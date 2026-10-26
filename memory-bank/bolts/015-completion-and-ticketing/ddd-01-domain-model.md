---
unit: 005-completion-and-ticketing
bolt: 015-completion-and-ticketing
stage: model
status: complete
updated: 2026-10-26T11:00:00Z
---

# Static Model - Completion and Ticketing (bolt 15: weighing ticket, printing, retry and reprint)

Scope: how a **completed batch gets its weighing ticket**, how the ticket is **printed and previewed**, what happens when the **printer is unavailable**, and how a ticket is **reprinted** marked REPRINT. It extends the Completion context of bolt 014 (write-back and summary); everything there stays valid. The Confirm & print screen is bolt 016 and appears only where the boundary needs to be clear, marked *(later)*.

Stories covered: `004-generate-and-print-ticket`, `005-printer-unavailable-retry`, `006-ticket-reprint`. Requirements: FR-29, FR-30, FR-35, BR-15, IR-16, IR-18, A-04, Q18 (open), FR-37 (audit). Workbook Step 27.

## Bounded Context

Same **Completion context** (`modules/completion`). New relationships:

| Neighbour | Relationship | What crosses the boundary |
|-----------|--------------|---------------------------|
| Weighing context | Customer → supplier (read-only) | the COMPLETED session (recipe snapshot with short names, operator, start and completion time) and its immutable records |
| Device context (`PrinterPort`) | Customer → supplier | `print(PrintDocument)` → job or `PrinterUnavailableError` / `DeviceProtocolError` |
| Audit | Internal | one `REPRINT` event per reprint |
| Consumption write-back (bolt 014) | **Independent** | neither waits for the other; a PENDING write-back never blocks printing and a printer failure never touches the write-back |
| Station UI *(later, bolt 016)* | Client | Print ticket F1, preview, Retry, Reprint |

## Domain Entities

| Entity | Properties | Business Rules |
|--------|------------|----------------|
| **Ticket** *(aggregate root)* | ticketId, batchId, sessionId, **content** (see below), barcodeValue, isReprint, reprintOf (ticketId of the original, or none), printStatus NOT_SENT \| PRINTED \| FAILED, printAttempts, lastError (code, state, message, or none), jobId, printedAt, createdByOperatorId, createdAt, updatedAt | **Content never changes** after creation. Only the print outcome changes. PRINTED is final. |
| **TicketContent** *(value, stored with the ticket)* | title, batch, order, machine, shade, date, operator, rows[], verdict, barcodeValue, reprint flag, **lines[]** (the exact text printed and previewed) | Composed once from the session and records; `lines` and the structured fields describe the same ticket. |
| **TicketRow** *(value)* | shortName, target, actual (in the target's unit), unit | One per recipe component, in sequence order. |
| **AuditEvent** `REPRINT` | existing type | actor = the signed-in operator; detail: batchId, original ticket id, new ticket id. |

## Value Objects

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| **PrintStatus** | NOT_SENT \| PRINTED \| FAILED | NOT_SENT = stored, not yet attempted (or interrupted); FAILED = last attempt refused. |
| **TicketVerdict** | "ALL WITHIN TOLERANCE" or one exception line per overridden component | Derived from the records: no OVERRIDDEN → all within tolerance; otherwise `EXCEPTION  <short name>  OVERRIDDEN` lines. |
| **Barcode** | value, symbology CODE128 | Value = the batch ID (FR-29); printable ASCII only. |
| **BarcodeSymbol** *(pure value)* | module widths of a Code 128 symbol with its check digit | Computed by `Code128` from the value; rendered to SVG for the preview. |
| **PrintFailure** | code, state (OFFLINE \| OUT_OF_PAPER, if known), message | Taken from the port's error. |

## Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|------------|
| **Ticket** | TicketContent, rows, print outcome | see below |

## Invariants

1. **Only a completed batch gets a ticket.** Not COMPLETED → `BATCH_INCOMPLETE` (422); no session → 404; nothing stored.
2. **One original ticket per batch.** Asking again for a batch that has one returns it and prints nothing (idempotent), whatever its print status. Reprints are separate tickets and may be several.
3. **Stored before printed.** The ticket (status NOT_SENT) is committed before the printer is called; a failed or interrupted print loses nothing and the preview stays available.
4. **The printed text is the stored text.** The printer receives exactly `content.lines` and the barcode value; the preview shows the same lines and the barcode symbol of the same value (FR-29 criterion 4).
5. **Content is composed from the records, never from the client.** Actuals are the recorded ones (ADR-7); targets are the snapshots; the date is the completion time; "OPER." is the operator of the session (as the write-back posting, bolt 014 O-5).
6. **Printer failure is not a data change.** A failed print changes only that ticket's print status and attempt count; the session, records and write-back are untouched (FR-35).
7. **PRINTED is final.** Printing a PRINTED ticket again does nothing and answers with the ticket (no accidental duplicate paper); the explicit way to get another copy is **reprint**.
8. **Retry is the same ticket.** Printing a NOT_SENT or FAILED ticket sends the same content; the result is **not** marked REPRINT unless the ticket itself is one.
9. **Reprint needs a printed original.** The original must exist (404 `TICKET_NOT_FOUND`) and be PRINTED (409 `TICKET_NOT_PRINTED`: retry the print instead). The reprint has identical content plus the REPRINT marking, links to its original, and writes the `REPRINT` audit event.
10. **The reprint is audited when it is created**, in the same unit of work as the new ticket, with the signed-in operator as actor (401 `NOT_SIGNED_IN` otherwise). Its print may still fail; it can then be retried and stays marked REPRINT.
11. **Barcode is Code 128 of the batch ID.** A value with characters Code 128 cannot carry is impossible in practice (batch IDs are ASCII) and is refused as a defect, not shown wrongly.
12. **Ticket and write-back are independent** (unit constraint): neither is a precondition of the other.

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| **TicketComposed** | first request for a completed batch | ticketId, batchId |
| **TicketPrinted** | printer accepted the document | ticketId, jobId, printedAt, attempt |
| **TicketPrintFailed** | printer refused | ticketId, failure, attempt |
| **TicketReprinted** | accepted reprint request | new ticketId, original ticketId, operatorId → audit `REPRINT` |

## Domain Services

| Service | Operations | Dependencies |
|---------|------------|--------------|
| **TicketService** *(application)* | `generate(batchId)`, `print(ticketId)`, `reprint(ticketId)`, `get(ticketId)`, `preview(ticketId)`, `forBatch(batchId)` | completed-batch reader, ticket repository, `PrinterPort`, AuditLog, OperatorIdentification, per-batch lock, clock, ids |
| **TicketComposer** *(pure)* | `compose(session, records, { reprint })` → TicketContent | none |
| **Code128** *(pure)* | `encode(value)` → symbol; `toSvg(value)` → SVG text | none (no library) |

`generate(batchId)` decision order: completed batch (404 / 422) → under the per-batch lock: an original exists → return it → compose, store NOT_SENT → print → save the outcome.

`print(ticketId)`: ticket exists (404) → PRINTED → return; else send `content.lines` and the barcode, then save PRINTED (job, time, attempt) or FAILED (failure, attempt). A failure is reported to the caller as the port's error (503 with the printer state) **after** it is saved.

`reprint(ticketId)`: signed-in operator → original exists and PRINTED → compose the same content marked REPRINT → in one transaction store the new ticket (NOT_SENT) and write the `REPRINT` event → print it.

## Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| **TicketRepository** | Ticket | `create(ticket)`, `save(ticket)` (print outcome only), `findById`, `findOriginalByBatch`, `listByBatch`. No delete; content and identity never updated. |
| **CompletedBatchReader**, **AuditEventRepository** | existing | read; `REPRINT` already in the audit list |

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Ticket** | The paper that travels with the container: batch, order, machine, shade, date, operator, what was weighed, the verdict and the barcode. |
| **Preview** | The same ticket shown on screen, with the barcode drawn. |
| **Print status** | NOT_SENT, PRINTED or FAILED. |
| **Retry** | Printing the same ticket again after a failure. Not a reprint. |
| **Reprint** | An extra copy of a printed ticket, visibly marked REPRINT and audited. |
| **Verdict** | "ALL WITHIN TOLERANCE" or the list of exceptions. |

## Training assumptions and open points

| # | Point | Position in this model |
|---|-------|------------------------|
| O-1 | **How a failed print is answered.** Story 005 says 503 `PRINTER_UNAVAILABLE` with state; ADR-5 prefers 200 with state for accepted actions. | Follow the story: **503 with the printer state and the stored ticket's id in `details`**, after the ticket and its FAILED status are saved. The UI offers Retry and the preview from the id. (Alternative: 200 with `printStatus: FAILED`.) |
| O-2 | **Pressing Print twice.** | One original per batch; asking again returns it without printing. The explicit copy is Reprint. |
| O-3 | **Reprint of a ticket that never printed.** | Refused (409): retry the print. |
| O-4 | **Time zone of DATE.** Prototype shows "2026-08-04 07:48" without a zone. | The completion time formatted **in UTC** (`YYYY-MM-DD HH:mm`); the station time zone is a pilot question for FCI. |
| O-5 | **Units on the ticket.** One unit column per row. | TGT and ACT are shown **in the recipe's unit**, the actual converted exactly and shown to that unit's precision (g: 1 decimal, kg: 3). The exact measurement stays on the record. |
| O-6 | **Label content, printer language, size (Q18, open with FCI).** | The prototype layout as plain text lines (32 characters wide) plus a Code 128 barcode; no printer language is modelled. |
| O-7 | **Operator on the ticket.** | The operator of the session (as the posting). The reprint's audit actor is whoever is signed in. |
| O-8 | **Is a retry of a print audited?** | No; only REPRINT is (FR-30, FR-37). Attempts are counted on the ticket. |
| O-9 | **Several reprints.** | Allowed; each is a ticket and an audit event. |

## Coverage of acceptance criteria

| Story | Criterion | Covered by |
|-------|-----------|-----------|
| 004 | Ticket stored with title, fields, five rows, verdict, barcode B-24187, sent to the printer | invariants 3–5, 11; TicketContent |
| 004 | Printer READY → PRINTED and a preview with Code 128 SVG | invariants 4, 7; Code128 |
| 004 | Preview shows the same content | invariant 4 |
| 005 | Printer OFFLINE → stored, FAILED, 503 with state, preview still available | invariants 3, 6; O-1 |
| 005 | Printer READY → retry → PRINTED, not marked REPRINT | invariant 8 |
| 005 | Session, records, write-back unchanged | invariants 6, 12 |
| 006 | PRINTED ticket → new ticket, identical content plus REPRINT, audit event | invariants 9, 10 |
| 006 | No original → 404 | invariant 9 |

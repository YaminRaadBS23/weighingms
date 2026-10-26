---
unit: 005-completion-and-ticketing
bolt: 015-completion-and-ticketing
stage: design
status: complete
updated: 2026-10-26T11:30:00Z
---

# Technical Design - Completion and Ticketing (bolt 15: weighing ticket, printing, retry and reprint)

Implements the approved static model (`ddd-01-domain-model.md`) within the project standards and ADR-1..10. The tickets live in the existing `modules/completion`; the `PrinterPort`, its HTTP adapter and the Dummy Printer already exist (unit 002), so there is **no new port**. Two small changes outside the module are needed and are named below (D-1 order and machine on the session snapshot, D-2 error codes).

## Architecture Pattern

Same hexagonal layering, added beside the write-back and summary:

```text
Presentation   completion/ticket-routes.ts   create | get | preview | print | reprint | by batch
Application    TicketService                 generate, print, reprint, get, preview, forBatch
Domain         Ticket (aggregate)            TicketComposer (pure)   Code128 (pure)
               errors, TicketRepository
Infrastructure DrizzleTicketRepository       migrations 0010 (tickets) and 0011 (triggers)
External       PrinterPort (existing)        CompletedBatchReader, AuditLog, OperatorIdentification (existing)
```

Files (indicative):

```text
src/shared/ticket.ts                                        TicketView, TicketPreview, TicketContent, PrintStatus, request shapes
src/shared/errors.ts                                        + TICKET_NOT_FOUND, TICKET_NOT_PRINTED
src/server/modules/completion/domain/ticket.ts              aggregate: compose result → NOT_SENT; markPrinted; markFailed
src/server/modules/completion/domain/ticket-composer.ts     session + records → TicketContent (pure)
src/server/modules/completion/domain/code128.ts             encode(value) and toSvg(value) (pure, no library)
src/server/modules/completion/domain/ticket-errors.ts       TicketNotFoundError, TicketNotPrintedError, TicketPrintError
src/server/modules/completion/domain/repositories.ts        + TicketRepository
src/server/modules/completion/application/ticket-service.ts use cases, per-batch lock
src/server/modules/completion/infrastructure/drizzle-ticket-repository.ts
src/server/modules/completion/module.ts, ticket-routes.ts   wiring and endpoints (module returns { writeBacks, summary, tickets })
src/server/db/weighingms/schema.ts                          + tickets table
src/server/db/weighingms/migrations/0010_tickets.sql, 0011_ticket_protection.sql
src/server/modules/weighing/domain/weighing-session.ts      RecipeSnapshot + optional orderRef, machineRef (D-1)
src/server/modules/weighing/application/session-starter.ts  fills them from the released batch (D-1)
src/server/app.ts                                           register ticket routes; decorate `completion` already exists
```

## Decisions of this design

| # | Decision | Why |
|---|----------|-----|
| D-1 | **Order and machine are copied into the recipe snapshot when the session starts** (`orderRef`, `machineRef`, optional). The session starter already reads the batch (`requireWeighable`); it keeps those two fields. The snapshot is stored as JSON, so **no migration**. | The ticket must print while OrgaTEX is offline (TD-1, invariant 12). Reading the batch at ticket time would make the ticket depend on OrgaTEX. Sessions that started before this change have no values; the ticket then prints `-`. |
| D-2 | New codes `TICKET_NOT_FOUND` (404) and `TICKET_NOT_PRINTED` (409). | Distinct, testable outcomes (invariant 9). |
| D-3 | **One stored `content` document (JSON) per ticket**, plus the lines inside it. The barcode SVG is **not stored**; it is drawn from `barcode_value` when needed. | Content never changes; the SVG is a pure function of the value, so it cannot disagree with it. |
| D-4 | **All ticket operations of a batch are serialised by the ADR-6 `SessionLock`, keyed by batch id.** The printer call is made inside the lock but **outside any database transaction**. | Prevents two Print presses from creating or printing twice; same reasoning as ADR-6/ADR-10. A printer call is one short HTTP request. |
| D-5 | **Failure is answered with the port's HTTP error, after the failure is saved** (O-1). The error body carries `details.ticketId`, `details.printStatus`, `details.state`. | Story 005 says 503 with the state; the UI can offer Retry and the preview from the id. |

## API Design

Convention (ADR-5): a call is **refused** (HTTP error, nothing changed) or **accepted**. The exception is the print itself: story 005 defines a printer refusal as **503 with the state**, and the ticket is already saved as FAILED when that answer is sent (D-5). The caller is told which ticket to retry.

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/tickets` | POST | `{ batchId }` | **201** `TicketView` (composed and printed now) · **200** `TicketView` (the batch already had its original; nothing printed) · 400 `VALIDATION_ERROR` · 404 `SESSION_NOT_FOUND` · 422 `BATCH_INCOMPLETE` · **503** `PRINTER_UNAVAILABLE` / 502 `DEVICE_PROTOCOL_ERROR` with `details.ticketId` (ticket stored, FAILED) |
| `/api/tickets/:ticketId` | GET | — | 200 `TicketView` · 404 `TICKET_NOT_FOUND` |
| `/api/tickets/:ticketId/preview` | GET | — | 200 `TicketPreview` · 404 `TICKET_NOT_FOUND` |
| `/api/tickets/:ticketId/print` | POST | — | 200 `TicketView` (PRINTED now, or already PRINTED and unchanged) · 404 · 503/502 as above (still FAILED, attempt counted) |
| `/api/tickets/:ticketId/reprint` | POST | — | **201** `TicketView` of the **new** REPRINT ticket · 401 `NOT_SIGNED_IN` · 404 `TICKET_NOT_FOUND` · 409 `TICKET_NOT_PRINTED` · 503/502 with `details.ticketId` = the new ticket (stored, audited, FAILED) |
| `/api/batches/:batchId/tickets` | GET | — | 200 `{ tickets: TicketView[] }` oldest first (original first); empty list when none · 404 `SESSION_NOT_FOUND` |

```text
TicketView = {
  ticketId, batchId, sessionId,
  isReprint: boolean, reprintOf: string | null,
  printStatus: 'NOT_SENT' | 'PRINTED' | 'FAILED',
  printAttempts: number,
  lastError: { code, state: 'OFFLINE' | 'OUT_OF_PAPER' | null, message } | null,
  jobId: string | null, printedAt: string | null,
  createdAt: string,
  content: TicketContent,
  preview: TicketPreview
}
TicketContent = {
  title, batch, order, machine, shade, date, operator,
  rows: [{ shortName, target, actual, unit }],
  verdict: string[],            "ALL WITHIN TOLERANCE" or one EXCEPTION line per overridden component
  barcodeValue, reprint: boolean,
  lines: string[]               exactly what is printed
}
TicketPreview = {
  ticketId, isReprint,
  lines: string[],
  barcode: { value, symbology: 'CODE128', svg: string }
}
```

`reprint` is POST on the **original's** id (the model's `reprint(ticketId)`); a reprint of a reprint is allowed (the source must be PRINTED) and links to the ticket it was copied from.

### Flows

**generate(batchId)**: validate the id (non-empty, trimmed, normalised like other batch ids) → read the batch (`NONE` → 404, `OPEN` → 422 `BATCH_INCOMPLETE`) → under the batch lock: an original exists → return it (200, no printing) → otherwise compose (TicketComposer) and in one transaction store it NOT_SENT → `print`.

**print(ticket)**: PRINTED → return unchanged (no call) → call `PrinterPort.print({ documentId: ticketId, lines: content.lines, barcode: barcodeValue })` → success: save PRINTED (`jobId`, `printedAt` = the printer's time, `attempts + 1`, error cleared) → failure (`PrinterUnavailableError` or `DeviceProtocolError`): save FAILED (`attempts + 1`, code, state, message) and throw `TicketPrintError` (same HTTP status and code as the port's error, details extended with `ticketId` and `printStatus: 'FAILED'`). **Any other error is not swallowed** (a bug is never reported as a printer outage); the row stays NOT_SENT.

**reprint(ticketId)**: signed-in operator (401) → load the source (404) → source not PRINTED → 409 → under the batch lock: compose the same content again from the stored content (not from the records, so the copy is identical) with `reprint = true`, a `*** REPRINT ***` line and the new barcode flag → in **one transaction** store the new ticket NOT_SENT and write the `REPRINT` audit event (actor = signed-in operator; detail: batchId, original ticket id, new ticket id) → `print` it.

**Composer (pure)**: `compose({ session, records, operator, reprint })`; reprint copies: `TicketComposer.asReprint(content)` rebuilds `lines` from the same structured fields with the REPRINT line added, so the original's text is the single source.

**Ticket text** (32 characters wide, ASCII except the title's dash; fields are cut with `~` if too long):

```text
FCI DYEING — WEIGHING TICKET
*** REPRINT ***                    (only on a reprint)
--------------------------------
BATCH   B-24187
ORDER   <orderRef>        MACHINE <machineRef>   (one line each)
SHADE   <shade>
DATE    2026-10-26 08:45          (completion time, UTC; O-4)
OPER.   <name> (<operatorId>)
--------------------------------
NAME        TGT     ACT UNIT      (names cut to 10, numbers right-aligned to 7)
<one row per component, sequence order>
--------------------------------
ALL WITHIN TOLERANCE              (or EXCEPTION <name> OVERRIDDEN, one per record)
```

Targets and actuals are shown in the recipe unit; the actual is converted exactly with `decimal.js` and rounded half-up to the unit's display precision (g 1 decimal, kg 3; O-5). The stored record keeps the exact measurement.

**Code 128** (`code128.ts`): Code Set B only (printable ASCII 32-126 is all a batch id needs; no Set C optimisation, so the symbol is a few modules longer). Symbol = start B (104), one code per character, check digit = (104 + Σ position × value) mod 103, stop (106). The 107 patterns are a constant table of bar/space widths (11 modules each; stop is 13). `toSvg(value)` returns a self-contained `<svg>` of `<rect>` bars, 10 quiet modules each side, no external references. A character outside 32-126 throws a defect error (invariant 11), never a wrong symbol.

## Data Persistence

Migration `0010` (drizzle-kit generated) adds `tickets` to `weighingms.db` (the same SQLite file as audit events, so the reprint and its `REPRINT` event commit together):

| Column | Type | Notes |
|--------|------|-------|
| `ticket_id` | text **primary key** | |
| `batch_id` | text, not null | |
| `session_id` | text → weighing_sessions, not null | |
| `is_reprint` | integer (0/1), not null | |
| `reprint_of` | text → tickets, nullable | set exactly when `is_reprint = 1` |
| `content` | text (JSON), not null | the whole `TicketContent`, never updated |
| `barcode_value` | text, not null | |
| `print_status` | text, not null | `NOT_SENT` \| `PRINTED` \| `FAILED` |
| `print_attempts` | integer, not null, default 0 | |
| `last_error_code`, `last_error_state`, `last_error_message` | text, nullable | cleared on PRINTED |
| `job_id`, `printed_at` | text, nullable | set with PRINTED |
| `created_by` | text → operators, not null | the signed-in operator for a reprint; the session's operator for the original |
| `created_at`, `updated_at` | text, not null | |

Index: **unique partial index `one_original_per_batch`** on `batch_id` where `is_reprint = 0` (invariant 2 held by the database, as `one_open_session_per_batch`). Index on `(batch_id, created_at)` for the list.

Migration `0011` (custom SQL, as 0001, 0005, 0007, 0009) adds triggers, in the spirit of ADR-1 and ADR-10:

- **no DELETE** of a ticket;
- **no UPDATE of** `ticket_id`, `batch_id`, `session_id`, `is_reprint`, `reprint_of`, `content`, `barcode_value`, `created_by`, `created_at` (content and identity are fixed);
- **a PRINTED row never changes again** (invariant 7);
- **PRINTED needs `job_id` and `printed_at`**; an unknown status is refused;
- **INSERT check**: an original has no `reprint_of`; a reprint has one and **the ticket it names is PRINTED** (invariant 9), and the new ticket starts NOT_SENT with 0 attempts.

Nothing is stored about the barcode symbol (D-3).

## Security Design

| Concern | Approach |
|---------|----------|
| Content from the server only (invariant 5) | `POST /api/tickets` takes only a batch id; there is no endpoint that accepts text or weights. Lines come from immutable records and the snapshot. |
| Who may do what | Create and retry print: no sign-in needed (they follow completion, like the first write-back send; the operator is the session's). **Reprint requires a signed-in operator** (ADR-2), who becomes the audit actor. |
| Audit (FR-30, FR-37, ADR-1) | `REPRINT` event per reprint, written in the same transaction as the new ticket; append-only. Print retries are not audited (O-8). |
| Output encoding | The SVG is built only from numbers computed from the pattern table (no user text); ticket text is plain text, escaped by React in the UI (bolt 016). Fields are cut to the line width. |
| Information disclosure | `lastError` carries the port's code, state and an operator-safe message; no URLs or stack traces. |
| Input validation | `batchId` string, trimmed, 1-64 characters; ids in paths looked up, never interpolated. |
| Paper duplicates | Print on a PRINTED ticket does nothing (invariant 7); copies only through the audited reprint. |

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| NFR-4 Exact arithmetic | `decimal.js` for the unit conversion of actuals; rounding only for display, once, in the composer. |
| NFR-5 Durability | The ticket row is committed before the printer is called; the outcome is saved right after; a crash in between leaves NOT_SENT and a printable ticket. |
| TD-1 Offline | No OrgaTEX call anywhere in the ticket path (D-1). A pending write-back never blocks a ticket. |
| FR-35 Printer failure | Stored FAILED + 503 with state; preview always available; retry any time. |
| Concurrency (ADR-6, D-4) | Per-batch lock; the partial unique index backs it across processes. |
| Observability (IR-09) | Events `ticket-composed`, `ticket-printed`, `ticket-print-failed`, `ticket-reprinted` (ticketId, batchId, attempt, error code, state). Ticket text is not logged. |
| Performance | One batch read, one insert, one printer call (adapter timeout), one update. |
| Testability | Clock, ids, `PrinterPort`, `AuditLog` injected; the Dummy Printer's `/ext/printer` state set by the existing simulation endpoints. |

## Error Handling

| Error Type | Code | HTTP |
|------------|------|------|
| No session for the batch | `SESSION_NOT_FOUND` | 404 (existing) |
| Batch not completed | `BATCH_INCOMPLETE` | 422 |
| No such ticket | `TICKET_NOT_FOUND` | 404 |
| Reprint of a ticket that was never printed | `TICKET_NOT_PRINTED` | 409 |
| Reprint without a signed-in operator | `NOT_SIGNED_IN` | 401 (existing) |
| Printer offline or out of paper (ticket saved FAILED) | `PRINTER_UNAVAILABLE` + `details.state`, `details.ticketId` | 503 |
| Printer answered something unreadable (ticket saved FAILED) | `DEVICE_PROTOCOL_ERROR` + `details.ticketId` | 502 |
| Bad request body | `VALIDATION_ERROR` | 400 (existing) |

## Decisions that need an ADR (Stage 3, optional)

- **ADR-11: A ticket is a stored document; printing is a separate, retryable step.** The ticket is committed before the printer is called and never changes; a printer refusal is answered with the port's 503 after FAILED is saved (this is the deliberate exception to ADR-5's "accepted calls answer 200"); PRINTED is final; copies only through an audited reprint. Alternatives: print first, store on success (loses the ticket when the printer is down, contradicts story 005); answer 200 with `printStatus: FAILED` (consistent with ADR-5, but the story and the Dummy Printer contract say 503); regenerate the text on every print or preview (the printed and previewed ticket could differ, and a reprint could differ from the original). *Consequence:* a failed print leaves a ticket that must be retried or abandoned deliberately; the UI always has an id to retry.
- Not an ADR: Code 128 set B only, the text layout, D-1 (a snapshot field), the view shapes.

## Testing approach (feeds the Test stage)

| Level | What |
|-------|------|
| Pure | `Code128`: pattern table (every symbol pattern totals 11 modules, stop 13); known check digit for a published sample; `B-24187` start/check/stop codes; refuses characters outside 32-126; SVG is well-formed, has quiet zones and no external references. `TicketComposer`: the prototype's five rows in order, short names, units, exact conversion and rounding (g/kg), UTC date, `-` for missing order/machine, verdict for all-OK and for overrides, every line at most 32 characters, reprint adds the REPRINT line and nothing else |
| Domain | Ticket transitions: NOT_SENT → PRINTED / FAILED, FAILED → PRINTED, PRINTED final, content immutable, attempts counted |
| Application (fake `PrinterPort`, in-memory db) | create → stored before the printer is called (printer fake checks the row exists) → PRINTED; second create → same ticket, printer called once; printer OFFLINE → FAILED row, 503 with ticketId and state, session, records and write-back unchanged; then READY → print → PRINTED, **not** REPRINT; protocol error → FAILED + 502; unexpected error not swallowed (row stays NOT_SENT); reprint of PRINTED → new ticket, same lines plus REPRINT, `REPRINT` audit with signed-in actor; reprint unsigned → 401, nothing stored; reprint of FAILED → 409; reprint with printer down → ticket + audit stored, FAILED; concurrent creates → one ticket; ticket works with the write-back PENDING and OrgaTEX offline |
| Repository / triggers | round-trip; one original per batch; DELETE refused; content, identity and `is_reprint` refused to change; PRINTED never changes; PRINTED needs job and time; reprint insert needs a PRINTED original; unknown status refused |
| API (real Dummy Printer and OrgaTEX) | complete B-24187 (five records) → `POST /api/tickets` → 201 PRINTED, one job on `/ext/printer` with title, five rows, verdict and barcode `B-24187`; preview returns the same lines and an SVG; printer `OFFLINE` → 503 with state, ticket FAILED, preview still 200; `READY` → print → PRINTED; reprint → 201 marked REPRINT with audit; incomplete → 422; unknown → 404. Evidence for Step 27 saved as `STEP-27-ticket.json`, `STEP-27-printer-api.json`, `STEP-27-ticket-test.txt` (screenshots optional) |
| Regression | all 910 tests; typecheck, lint, format, `vite build` |

## Out of scope in this bolt

The Confirm & print screen, Print ticket F1, the preview and Retry/Reprint buttons (bolt 016); a printer language, label size or layout configuration (Q18, open with FCI); background print retry; ticket archive or search; any change to how a session completes or to the write-back.

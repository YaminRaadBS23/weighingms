---
unit: 005-completion-and-ticketing
bolt: 014-completion-and-ticketing
stage: model
status: complete
updated: 2026-10-26T08:00:00Z
---

# Static Model - Completion and Ticketing (bolt 14: consumption write-back and completion summary)

Scope: how the **actual consumption of a completed batch reaches OrgaTEX exactly once**, even across outages, and what the **completion summary** reports. Tickets and printing are bolt 015 and appear only where the boundary needs to be clear, marked *(later)*.

Stories covered: `001-post-consumption-on-completion`, `002-hold-and-retry-write-back`, `003-completion-summary`. Requirements: FR-27, FR-28, FR-26 (summary), BR-12, BR-16, BR-17, BR-18, IR-05, IR-08, AC-08, TD-1. Workbook Step 26.

## Bounded Context

A new **Completion context** (`modules/completion`), downstream of Weighing. It never changes a session or a record; it only reads them.

| Neighbour | Relationship | What crosses the boundary |
|-----------|--------------|---------------------------|
| Weighing context | Customer → supplier (read-only) | the COMPLETED session and its immutable weighing records (ADR-1, ADR-8) |
| OrgaTEX (`OrgatexPort`) | Customer → supplier | `postConsumption(batchId, posting, idempotencyKey)` then `setBatchStatus(batchId, 'WEIGHED')` |
| Audit | Internal | `WRITEBACK_RETRY` events |
| Printer / ticket *(later, bolt 015)* | Independent | printing is never blocked by a PENDING write-back and vice versa |
| Station UI *(later, bolt 016)* | Client | triggers the write-back, shows CONFIRMED / PENDING, Retry, summary |

## Domain Entities

| Entity | Properties | Business Rules |
|--------|------------|----------------|
| **ConsumptionWriteBack** *(aggregate root)* | batchId, sessionId, idempotencyKey, status PENDING \| CONFIRMED, attempts, lastError (code + message, or none), postingId (once known), confirmedAt, createdAt, updatedAt | One per completed batch. The key is **stored before the first send**. CONFIRMED is terminal. Never deleted. |
| **ConsumptionPosting** *(value built from records)* | completedAt, operatorId, lines[] | Built only from the session's records and snapshots. |
| **ConsumptionLine** *(value)* | sequence, dyestuffCode, lotId, actual (as measured, with its unit), target, result (IN_TOLERANCE \| OVERRIDDEN) | One per recipe component, in sequence order. |
| **CompletionSummary** *(read model, not stored)* | batchId, componentsWeighed, componentsTotal, allWithinTolerance, totalDispensedKg, elapsed, operator, writeBack status | Computed on every read from the session and records. |

## Value Objects

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| **WriteBackStatus** | PENDING \| CONFIRMED | Closed list. |
| **IdempotencyKey** | text | Chosen once per batch completion and kept; later calls must match it (or send none). |
| **WriteBackFailure** | code, message | `ORGATEX_UNAVAILABLE`, `ORGATEX_PROTOCOL_ERROR`, `CONSUMPTION_REJECTED`, `INVALID_STATUS_TRANSITION`, `IDEMPOTENCY_CONFLICT`, … taken from the port's errors. |
| **TotalDispensed** | decimal kg, 3 decimals | Sum of all actuals converted exactly to kg (`decimal.js`), never floating point. |
| **Elapsed** | seconds | `completedAt − startedAt` of the session (assumption Q-UI-14). |

## Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|------------|
| **ConsumptionWriteBack** | its attempt counters and last failure | see below |
| **WeighingSession**, **WeighingRecord** (Weighing context) | unchanged | read only here |

## Invariants

1. **Only a completed batch is posted.** A session that is not COMPLETED → `BATCH_INCOMPLETE` (422) and nothing is stored.
2. **One write-back per completed batch** (batchId unique). Asking again never creates a second one.
3. **Key before send.** The write-back row (status PENDING, key) is committed *before* OrgaTEX is called, so a crash between send and answer leaves a retryable row with the same key.
4. **Exactly one posting in OrgaTEX.** Every send of one write-back uses its stored key and the same lines, so OrgaTEX stores one posting however many sends happen (IR-08).
5. **CONFIRMED means both steps worked.** The posting was acknowledged **and** the batch status was set to WEIGHED (ADR-8). If the posting works but WEIGHED fails, the write-back stays PENDING; a retry repeats both (the repeated posting is the same key, the status call is repeatable).
6. **An outage is state, not an error.** When OrgaTEX cannot be reached, or refuses the posting, the call still answers 200 with status PENDING, the failure, and the attempt count (ADR-5). Weighing is never blocked (TD-1); nothing is lost.
7. **No background sync.** A PENDING write-back changes only when someone asks for a retry (TD-1).
8. **Retry is the same send.** Retrying a CONFIRMED write-back changes nothing and returns the confirmation (no second posting, no new audit event). Retrying a PENDING one increments `attempts`, records the new outcome and writes one `WRITEBACK_RETRY` audit event.
9. **Lines come from the records, never from the client.** The request has no weights; actuals are the recorded ones (ADR-7).
10. **The summary is a pure read.** It never calls OrgaTEX or the printer, and it can be read before or after the write-back.
11. **`allWithinTolerance` is NO as soon as any record is OVERRIDDEN**; otherwise YES.
12. **Write-back and ticket are independent.** Neither waits for the other (unit constraint).

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| **WriteBackRequested** | first request for a completed batch | batchId, sessionId, idempotencyKey |
| **ConsumptionConfirmed** | posting acknowledged and WEIGHED set | batchId, postingId, confirmedAt, attempts |
| **ConsumptionDeferred** | OrgaTEX unreachable or refusing | batchId, failure, attempts |
| **WriteBackRetried** | explicit retry of a PENDING write-back | batchId, outcome → audit `WRITEBACK_RETRY` |

## Domain Services

| Service | Operations | Dependencies |
|---------|------------|--------------|
| **ConsumptionWriteBackService** *(application)* | `post(batchId, key?)` → write-back; `retry(batchId, operator)` → write-back; `status(batchId)`; `pendingCount()` | session and record repositories (read), write-back repository, `OrgatexPort`, AuditLog, OperatorIdentification, clock, ids |
| **PostingBuilder** *(pure)* | `build(session, records)` → ConsumptionPosting | none |
| **CompletionSummaryService** *(application, read-only)* | `summary(batchId)` | session, records, write-back repository |
| **SummaryMath** *(pure)* | `totalDispensedKg(actuals)`, `allWithinTolerance(results)`, `elapsed(start, end)` | `decimal.js` via the shared quantity helpers |

`post(batchId, key?)` decision order:
1. Find the session of the batch; none → `NOT_FOUND`; not COMPLETED → `BATCH_INCOMPLETE` (422).
2. A write-back exists: if a key was sent and differs from the stored key → `IDEMPOTENCY_CONFLICT` (409); if CONFIRMED → return it unchanged; if PENDING → continue to send (treated as a new attempt).
3. No write-back yet: create it PENDING with the key (the one sent, or a generated one) and commit.
4. Send: `postConsumption(batchId, posting, key)`, then `setBatchStatus(batchId, 'WEIGHED')`.
5. Success → CONFIRMED (time, postingId, attempts + 1). Port failure → stay PENDING (attempts + 1, lastError). Either way answer 200 with the write-back.

`retry(batchId)` is step 4–5 on a PENDING write-back plus the audit event; a missing write-back, or an incomplete batch, is refused as in step 1.

**Pending count** = completed batches whose write-back is **not CONFIRMED**, including a completed batch for which no write-back has been requested yet. This keeps a batch visible if the browser was closed before the first request, so nothing is silently unsent.

## Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| **WriteBackRepository** | ConsumptionWriteBack | `create(wb)`, `save(wb)` (status, attempts, lastError, postingId, confirmedAt only), `findByBatch(batchId)`, `countPending()` (needs the session repository's completed batches). No delete. |
| **WeighingSessionRepository**, **WeighingRecordRepository** | existing | read only; one new query: completed sessions (for the pending count) |
| **AuditEventRepository** | existing | `WRITEBACK_RETRY` already in the closed list |

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Write-back** | Sending the actual consumption of a completed batch to OrgaTEX and setting it WEIGHED. |
| **CONFIRMED / PENDING** | Delivered, or not yet delivered (never attempted or last attempt failed). |
| **Idempotency key** | The label that makes repeated sends of the same write-back count once in OrgaTEX. |
| **Pending count** | How many completed batches are not yet confirmed in OrgaTEX. |
| **Completion summary** | The numbers on the Confirm & print screen: n of n, all within tolerance, total dispensed (kg), elapsed, operator, write-back state. |

## Training assumptions and open points

| # | Point | Position in this model |
|---|-------|------------------------|
| O-1 | **Who triggers the write-back?** ADR-8 says completion makes no OrgaTEX call; Step 26 shows the batch complete → `POST /api/batches/B-24187/consumption`. | The **client triggers it** (the Confirm & print screen, bolt 016, calls it on arrival); there is no background job (TD-1). Until then the batch counts as pending. |
| O-2 | **Idempotency key.** Story 001 says "with an Idempotency-Key"; the same key again must give the same answer. | The header is **optional**: the first call stores the key sent, or a generated one (`WB-<batchId>-<sessionId>`); a later call with a **different** key is refused (409). |
| O-3 | **A refused posting** (OrgaTEX answers 422/409) is not an outage. | Treated the same way: PENDING with the failure shown; retry is possible. A permanent refusal would need OrgaTEX-side correction (pilot question). |
| O-4 | **Incomplete batch status codes.** Story 001 says 422, story 003 says 409. | Following the stories: consumption **422**, summary **409**, both `BATCH_INCOMPLETE`. A single code would be cleaner (pilot question). |
| O-5 | **Operator on the posting.** | The operator who started the session (`startedBy`); the records keep who confirmed each component. |
| O-6 | **Elapsed.** | Session start → completion (assumption Q-UI-14); time spent suspended is included. |
| O-7 | **Overridden components.** | Posted like any other with `result = OVERRIDDEN` (bolt 012, O-8); the summary reports NO. Surplus is not posted: the posting contract has no field for it. |
| O-8 | **Retry of a confirmed write-back.** | Harmless: returns the confirmation, no audit event. |
| O-9 | **Pending count while OrgaTEX is down.** | Counts only completed batches; a batch still being weighed is not pending. |

## Coverage of acceptance criteria

| Story | Criterion | Covered by |
|-------|-----------|-----------|
| 001 | POST with key → 200, one posting with five lines | invariants 3, 4, 9; `post` |
| 001 | Status CONFIRMED with time | ConsumptionWriteBack.confirmedAt |
| 001 | Same key again → same response, one posting | invariants 2, 4, 8; O-2 |
| 001 | Incomplete batch → 422 `BATCH_INCOMPLETE` | invariant 1; O-4 |
| 002 | OrgaTEX offline → PENDING, nothing lost, count 1 | invariants 3, 6; pending count |
| 002 | Back online + retry → CONFIRMED, one posting, `WRITEBACK_RETRY` audit | invariants 4, 5, 8 |
| 002 | Ticket printing not blocked | invariant 12 |
| 002 | `GET /api/write-backs/pending-count` | pending count |
| 003 | Summary: 5 of 5, YES, 35.322 kg, elapsed, operator, write-back state | CompletionSummary; invariants 10, 11 |
| 003 | Any OVERRIDDEN → NO; incomplete → 409 | invariant 11; O-4 |

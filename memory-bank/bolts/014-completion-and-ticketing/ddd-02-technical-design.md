---
unit: 005-completion-and-ticketing
bolt: 014-completion-and-ticketing
stage: design
status: complete
updated: 2026-10-26T08:30:00Z
---

# Technical Design - Completion and Ticketing (bolt 14: consumption write-back and completion summary)

Implements the approved static model (`ddd-01-domain-model.md`) within the project standards and ADR-1..9. One new module, `modules/completion`; no new port (`OrgatexPort.postConsumption` and `setBatchStatus` already exist and are idempotent). Tickets and printing are bolt 015.

## Architecture Pattern

Same hexagonal layering, as a sibling module of `weighing`:

```text
Presentation   completion/routes.ts   consumption | write-back | retry | pending-count | summary
Application    ConsumptionWriteBackService   post, retry, status, pendingCount
               CompletionSummaryService      summary (read only)
Domain         ConsumptionWriteBack (aggregate)   PostingBuilder (pure)   SummaryMath (pure)
               errors, WriteBackRepository, CompletedBatchReader (read port)
Infrastructure DrizzleWriteBackRepository   migration 0008 (write_backs)
               CompletedBatchReader implemented over the weighing repositories
External       OrgatexPort (existing)
```

Files (indicative):

```text
src/shared/completion.ts                                  WriteBackView, WriteBackStatus, CompletionSummaryResponse, PendingCountResponse
src/shared/errors.ts                                      + WRITEBACK_NOT_FOUND, WRITEBACK_KEY_MISMATCH
src/server/modules/completion/domain/write-back.ts        aggregate and state transitions
src/server/modules/completion/domain/posting-builder.ts   records → OrgatexConsumptionPosting
src/server/modules/completion/domain/summary-math.ts      total kg, all-within-tolerance, elapsed
src/server/modules/completion/domain/errors.ts, repositories.ts
src/server/modules/completion/application/consumption-write-back.ts, completion-summary.ts
src/server/modules/completion/infrastructure/drizzle-write-back-repository.ts, completed-batches.ts
src/server/modules/completion/module.ts, routes.ts        wiring and endpoints
src/server/db/weighingms/schema.ts, migrations/0008_write_backs.sql (+ trigger migration 0009)
src/server/app.ts                                         register the module
```

The completion module reads the Weighing context only through a narrow **`CompletedBatchReader`** (`completedByBatch(batchId)` → session snapshot + records, or `none` / `open`; `listCompletedBatchIds()`), implemented in infrastructure on top of the weighing repositories. The weighing session repository gains two read queries (`findCompletedByBatch`, `listCompleted`); nothing in Weighing writes anything new.

## API Design

Same convention as ADR-5: a call is **refused** (HTTP error, nothing changed) or **accepted** (200, with the state). A failed OrgaTEX send is *accepted* and reported as PENDING.

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/batches/:batchId/consumption` | POST | optional header `Idempotency-Key` | 200 `WriteBackView` (CONFIRMED or PENDING) · 404 `SESSION_NOT_FOUND` (no session for the batch) · 409 `WRITEBACK_KEY_MISMATCH` (key differs from the stored one) · 422 `BATCH_INCOMPLETE` |
| `/api/batches/:batchId/write-back` | GET | — | 200 `WriteBackView` (`requested:false` when completed but never sent) · 404 `SESSION_NOT_FOUND` · 409 `BATCH_INCOMPLETE` |
| `/api/batches/:batchId/write-back/retry` | POST | — | 200 `WriteBackView` · 401 `NOT_SIGNED_IN` · 404 `WRITEBACK_NOT_FOUND` · 422 `BATCH_INCOMPLETE` |
| `/api/write-backs/pending-count` | GET | — | 200 `{ count }` |
| `/api/batches/:batchId/summary` | GET | — | 200 `CompletionSummaryResponse` · 404 `SESSION_NOT_FOUND` · 409 `BATCH_INCOMPLETE` |

```text
WriteBackView = {
  batchId, sessionId,
  status: 'PENDING' | 'CONFIRMED',
  requested: boolean,                    false only for a completed batch nobody has sent yet
  attempts: number,                      0 when never sent
  idempotencyKey: string | null,
  postingId: string | null,
  confirmedAt: string | null,            "Written to OrgaTEX CONFIRMED hh:mm:ss"
  lastError: { code, message } | null,
  lines: number                          how many component lines are posted (5 for B-24187)
}
CompletionSummaryResponse = {
  batchId, sessionId,
  componentsWeighed, componentsTotal,
  allWithinTolerance: boolean,
  totalDispensed: { value: "35.322", unit: "kg" },
  startedAt, completedAt, elapsedSeconds,
  operator: { operatorId, name },
  writeBack: WriteBackView
}
PendingCountResponse = { count: number }
```

The `batchId` routes sit beside the existing `/api/batches` facade; the write-back and summary are separate endpoints because the UI shows them on different clocks (summary immediately, write-back after the send).

### Flows

**post(batchId, key?)** — read completed batch (404 / 422) → under a **per-batch lock** (the ADR-6 `SessionLock`, keyed by batch): load the write-back; none → create PENDING with key (header or `WB-<batchId>-<sessionId>`) in one transaction; exists with a different key → 409; CONFIRMED → return it → **send** (outside any database transaction): `postConsumption(...)` then `setBatchStatus('WEIGHED')` → save the outcome (CONFIRMED with `confirmedAt` and `postingId`, or still PENDING with `lastError`) and `attempts + 1`.

**retry(batchId)** — signed-in operator (401) → same lock → no write-back → 404 → CONFIRMED → return unchanged, **no audit event** → otherwise send as above and, in the **same transaction as the save**, append `WRITEBACK_RETRY` (actor = the signed-in operator, session = the batch's session, detail: batchId, attempt, outcome, error code).

**Send outcome mapping** — any `DomainError` raised by the port with status ≥ 500 or code `ORGATEX_UNAVAILABLE` / `ORGATEX_PROTOCOL_ERROR`, or a refusal (`CONSUMPTION_REJECTED`, `IDEMPOTENCY_CONFLICT`, `BATCH_NOT_RELEASED`, `INVALID_STATUS_TRANSITION`) → PENDING with that code and message. Anything else (a programming error) is **not swallowed**: the row stays PENDING and the error becomes a 500, so a bug is never reported as an outage.

**Retry of a posting whose WEIGHED step failed** — the stored `postingId` shows that the posting was acknowledged; the retry still repeats both calls (the posting is the same key and returns the same receipt, the status call is repeatable).

**summary(batchId)** — completed batch (404 / 409) → records → `SummaryMath` → write-back view (current state, never triggers a send).

## Data Persistence

Migration `0008` (generated by drizzle-kit) adds `write_backs` to `weighingms.db` (one SQLite file, so the audit event of a retry commits with the row):

| Column | Type | Notes |
|--------|------|-------|
| `batch_id` | text **primary key** | one write-back per batch (invariant 2) |
| `session_id` | text → weighing_sessions, not null | the completed session |
| `idempotency_key` | text, not null, unique | fixed at creation |
| `status` | text, not null | `PENDING` \| `CONFIRMED` |
| `attempts` | integer, not null, default 0 | |
| `last_error_code`, `last_error_message` | text, nullable | cleared on CONFIRMED |
| `posting_id` | text, nullable | OrgaTEX receipt id once acknowledged |
| `confirmed_at` | text, nullable | OrgaTEX receipt time |
| `created_at`, `updated_at` | text, not null | |

Migration `0009` (custom SQL, as 0001, 0005 and 0007) adds triggers: **no DELETE**; **no UPDATE of `batch_id`, `session_id` or `idempotency_key`**; **no UPDATE of a CONFIRMED row**; and a `BEFORE UPDATE` check that status CONFIRMED comes with `confirmed_at` and `posting_id`. This protects the "exactly once" promise from a bug, in the same spirit as ADR-1.

The summary is **not stored**; it is computed from records, so it can never disagree with them.

## Security Design

| Concern | Approach |
|---------|----------|
| No client-supplied consumption (BR-07) | The POST has no body; lines are built from immutable records. The header can only name the key, and a wrong key is refused. |
| Who may retry | A signed-in operator (ADR-2), the actor of the audit event. Sending the first time needs no sign-in (it is a consequence of completion; the UI calls it automatically). |
| Idempotency (IR-08) | Key stored before the first send; same key and lines every time; OrgaTEX deduplicates; the dummy returns the same receipt. |
| Audit (NFR-14) | `WRITEBACK_RETRY` per retry of a pending write-back (append-only, ADR-1). |
| Information disclosure | `lastError` carries the port's code and message (already operator-safe); no stack traces, no URLs. |
| Input validation | `batchId` is a path parameter checked against sessions; the key is trimmed, 1–128 printable characters, else `VALIDATION_ERROR`. |

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| NFR-4 Exact arithmetic | `totalDispensed` sums actuals with `decimal.js` after exact unit conversion to kg, formatted to 3 decimals (35.322 kg). |
| NFR-5 Durability | The row exists before the send; the outcome is saved right after; a crash in between leaves PENDING and a stable key. No transaction is held across the HTTP call. |
| TD-1 Offline | Outage → PENDING + 200; nothing blocks weighing or printing; no background retry. |
| Concurrency (ADR-6) | A per-batch lock serialises post and retry; idempotency also protects across processes. |
| Observability (IR-09) | Log events `writeback-requested`, `writeback-confirmed`, `writeback-deferred` (batchId, attempt, error code), `writeback-retried`. |
| Performance | One batch read, one send (two OrgaTEX calls), one small write. |
| Testability | Clock, ids and `OrgatexPort` injected; Dummy OrgaTEX `_sim` offline/online; fake port for the failure matrix. |

## Error Handling

| Error Type | Code | HTTP |
|------------|------|------|
| No session for the batch | `SESSION_NOT_FOUND` | 404 (existing) |
| Batch not completed — consumption, retry | `BATCH_INCOMPLETE` | 422 |
| Batch not completed — summary, write-back status | `BATCH_INCOMPLETE` | 409 |
| Different idempotency key | `WRITEBACK_KEY_MISMATCH` | 409 |
| Retry with nothing requested | `WRITEBACK_NOT_FOUND` | 404 |
| Retry without a signed-in operator | `NOT_SIGNED_IN` | 401 (existing) |
| OrgaTEX outage or refusal during a send | *(not an error)* | 200 with `status: PENDING`, `lastError` |

## Decisions that need an ADR (Stage 3)

- **ADR-10 — The write-back is a persisted, client-triggered, key-first send; outcomes are state, never background work.** *Alternatives:* send automatically at completion inside the weighing transaction (contradicts ADR-8 and TD-1); background sync job (contradicts TD-1 and adds a scheduler); outbox-only table with no row until sent (loses the "completed but unsent" state). *Consequence:* a batch that completed but whose screen was closed stays visible in the pending count until someone sends it.
- Not an ADR: the summary math, the posting builder, the view shapes; the `CompletedBatchReader` is a plain read port.

## Testing approach (feeds the Test stage)

| Level | What |
|-------|------|
| Pure | `PostingBuilder`: five lines in sequence order from records (actual as measured, target snapshot, lot, result); `SummaryMath`: total of the prototype actuals = 35.322 kg, mixed g/kg exact, any OVERRIDDEN → not all within tolerance, elapsed |
| Domain | write-back transitions: new PENDING, attempt recorded, confirmed is terminal, failure keeps the key |
| Application (fake `OrgatexPort`) | success → CONFIRMED, posting and WEIGHED called once each; unavailable → PENDING with code, count 1; retry → CONFIRMED, **same key** every send; retry of CONFIRMED → no calls, no audit; WEIGHED failing after a good posting → PENDING with postingId; key mismatch → 409; incomplete → 422; unexpected error not swallowed; concurrent posts → one write-back |
| Repository | round-trip; key unique; triggers reject DELETE, key change, update of a CONFIRMED row |
| API (real Dummy OrgaTEX) | complete B-24187 (five records), POST → 200 CONFIRMED, **one posting with five lines** in `/ext/orgatex/batches/B-24187/consumption`, batch WEIGHED; same POST/key again → still one posting; `_sim` offline → PENDING, count 1, retry offline → attempts 2; online → retry CONFIRMED, one posting, `WRITEBACK_RETRY` audit; summary values; override → NO; incomplete → 422/409. Evidence for Step 26 saved as `STEP-26-request.json`, `STEP-26-response.json`, `STEP-26-data.json` |
| Regression | all 842 tests; typecheck, lint, format, `vite build` |

## Out of scope in this bolt

The ticket, barcode, printing, preview and reprint (bolt 015); the Confirm & print screen, the Retry button and the strip's pending count (bolt 016); automatic background retry; any change to how a session completes (ADR-8).

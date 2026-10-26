# Implementation Walkthrough — Bolt 014 (Consumption write-back and completion summary)

Implements the approved model, design and ADR-10. No new port; the existing `OrgatexPort` calls are used.

## What was built
| Layer | Files |
|-------|-------|
| Shared | `src/shared/completion.ts` (`WriteBackView`, `CompletionSummaryResponse`, `PendingCountResponse`); error codes `WRITEBACK_NOT_FOUND`, `WRITEBACK_KEY_MISMATCH` |
| Domain | `modules/completion/domain/`: `write-back.ts` (aggregate), `posting-builder.ts`, `summary-math.ts`, `errors.ts`, `repositories.ts` |
| Application | `consumption-write-back.ts` (post, retry, status, pending count, per-batch lock), `completion-summary.ts` |
| Infrastructure | `drizzle-write-back-repository.ts`, `completed-batches.ts` (read-only view of the weighing data); two new session queries (`findCompletedByBatch`, `listCompletedBatchIds`) |
| Persistence | migration `0008_write_backs.sql` (table), `0009_write_back_protection.sql` (no delete, identity fixed, CONFIRMED final, receipt required) |
| Presentation | `modules/completion/routes.ts`, wiring in `module.ts` and `app.ts`; README endpoint rows |

## Rules kept
- Key stored before the first send; the send is outside any transaction; every send reuses the stored key and the lines built from the records.
- CONFIRMED only after the posting **and** WEIGHED; an outage or refusal is 200 with PENDING; unexpected errors are not swallowed.
- Retry of a PENDING write-back saves its outcome and the `WRITEBACK_RETRY` audit event in one transaction; retry of a CONFIRMED one changes nothing.
- Pending count includes completed batches never sent.

## Real run (scratch data, Dummy OrgaTEX)
B-24187 weighed to completion through the API, then:
1. Summary before sending: 5 of 5, all within tolerance YES, 35.320 kg, 15 s, R. Karim; write-back `requested:false`; pending count 1.
2. OrgaTEX offline, `POST …/consumption` → 200 **PENDING** (attempts 1, `ORGATEX_UNAVAILABLE`); retry offline → attempts 2; a different key → 409.
3. OrgaTEX online, retry → **CONFIRMED** (attempt 3, posting id, time); same POST again → same response; OrgaTEX holds **one posting with 5 lines**, batch status **WEIGHED**; pending count 0; two `WRITEBACK_RETRY` audit events.

## Step 26 evidence
`STEP-26-request.json`, `STEP-26-response.json`, `STEP-26-data.json` (the posting stored by Dummy OrgaTEX).

## Checks
Typecheck, ESLint and Prettier clean; the existing 842 tests still pass. New tests are written in the Test stage.

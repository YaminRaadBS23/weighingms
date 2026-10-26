# Test Report — Bolt 014 (Consumption write-back and completion summary)

**Result:** 910 tests pass (842 before + 68 new). Typecheck, ESLint, Prettier and `vite build` clean.

## New tests
| File | Tests | Covers |
|------|-------|--------|
| `domain/domain.test.ts` | 12 | Total dispensed: prototype actuals = 35.322 kg, exact where floating point is not, g/kg mix, empty. All-within-tolerance and elapsed. Posting lines built in sequence order from the records. Write-back transitions: new PENDING, failed attempts keep the key, posting id kept after a failed WEIGHED, CONFIRMED is final, restore does not share state |
| `application/consumption-write-back.test.ts` | 32 | **Story 001:** one posting with five lines, WEIGHED, CONFIRMED; lines from records (actual, lot, target); same request again sends nothing; header key trimmed and stored; generated key stable; different key 409; five invalid keys 400; incomplete 422; no session 404; overridden component posted as OVERRIDDEN; concurrent posts → one send. **Story 002:** offline → PENDING, count 1; retry online → CONFIRMED with the same key, one posting, one audit event; retry offline audited; retry of CONFIRMED changes nothing; 401 / 404 / 422 on retry; WEIGHED failure keeps the posting id and the retry repeats both; four kinds of refusal held as PENDING; an unexpected error is raised, not shown as an outage; pending count including never-sent batches. **Story 003:** summary values, overridden → NO and 35.322 kg, no OrgaTEX call, 409 / 404 |
| `infrastructure/write-back-repository.test.ts` | 11 | Round-trips PENDING and CONFIRMED; one write-back per batch and key; session queries; triggers: no delete, batch / session / key fixed, CONFIRMED final, receipt required, unknown status |
| `routes.test.ts` | 13 | Real Dummy Scale and Dummy OrgaTEX over HTTP: Step 26 — B-24187 → 200 CONFIRMED, **one posting with five lines**, batch WEIGHED; same key → same answer; different key 409; incomplete 422; offline → 200 PENDING, count 1, offline retry attempts 2, online retry CONFIRMED, one posting, two `WRITEBACK_RETRY` events; GET write-back states; 401 / 404; pending write-back does not block the summary; summary values, 409 and 404 |

## Step 26 evidence
`STEP-26-request.json`, `STEP-26-response.json`, `STEP-26-data.json` (from the real run, see the implementation walkthrough); `routes.test.ts` repeats the scenario as automated tests.

## Not covered here
The Retry button, the pending count in the status strip and "Written to OrgaTEX CONFIRMED hh:mm:ss" on screen (bolt 016); the ticket (bolt 015); end-to-end browser tests (bolt 017).

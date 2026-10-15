---
stage: test
bolt: 002-orgatex-integration
created: 2026-10-15T12:56:31Z
---

## Test Report: orgatex-integration (bolt 2)

### Summary

- **Tests**: 81/81 passed (7 files; 35 new in this bolt, 46 regression)
- **Coverage**: not measured (project standard: critical-path list instead of a coverage gate); every acceptance criterion below is covered by a test
- **Quality gates**: `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run format:check` ✅

### Test Files

- [x] `src/server/integrations/orgatex/dummy/routes.test.ts` - **+18 write-side contract tests** (30 total): five-line posting stored once with the stored receipt returned; repeat with same key and body returns the original receipt (one posting); reordered lines count as the same request; same key with a different body → 409 `IDEMPOTENCY_CONFLICT`; different key → second posting; rejections for missing key (400), unknown batch (404), QUEUED batch (409), dyestuff not in recipe, lot of another dyestuff, numeric quantity, empty lines (422); GET consumption of unknown batch (404); status RELEASED → WEIGHING → WEIGHED visible in the queue; RELEASED → WEIGHED directly and same-status repeat; backwards, QUEUED, unknown batch and invalid status rejected
- [x] `src/server/integrations/orgatex/dummy/simulation.test.ts` - **6 new tests**: offline → all 8 business endpoints answer 503 `ORGATEX_OFFLINE`; offline → `OrgatexPort` raises `ORGATEX_UNAVAILABLE` (reads and posting) and link OFFLINE; online → normal answers and link ONLINE; reset → seed statuses, no postings, online; state readout; **production configuration → `_sim` endpoints 404**, business endpoints still served
- [x] `src/server/integrations/orgatex/http-orgatex-adapter.test.ts` - **+11 tests** (23 total): `postConsumption` maps the receipt and is idempotent through the port (one stored posting, log line with key); `setBatchStatus` returns the updated batch; 409/422/404 answers translated to `IDEMPOTENCY_CONFLICT`, `BATCH_NOT_RELEASED` (posting and status), `CONSUMPTION_REJECTED`, `INVALID_STATUS_TRANSITION`, `BATCH_NOT_FOUND` with the link staying ONLINE; unexpected 400 → `ORGATEX_PROTOCOL_ERROR`; the `fetch` transport sends method, `Idempotency-Key` header and JSON body
- [x] `src/server/test-support.ts` - Shared `prototypePosting()` fixture: the five prototype ticket actuals for B-24187
- [x] Regression: `quantity.test.ts` (6), `errors.test.ts` (6), `app.test.ts` (5), `seed.test.ts` (5), existing read-side contract and adapter tests — all passing on the generalised transport

### Acceptance Criteria Validation

**Story 004-dummy-orgatex-accepts-consumption-idempotently**

- ✅ **B-24187 posting with key K and five lines → one posting stored, 200 with the stored record**: `routes.test.ts`
- ✅ **Same key again → same response, no second posting**: `routes.test.ts`, `http-orgatex-adapter.test.ts`
- ✅ **Same key, different body → 409 `IDEMPOTENCY_CONFLICT`**: `routes.test.ts`, `http-orgatex-adapter.test.ts`
- ✅ **RELEASED → WEIGHING → WEIGHED shown in the queue**: `routes.test.ts`
- ✅ **`GET /ext/orgatex/batches/B-24187/consumption` returns the stored record**: `routes.test.ts`

**Story 005-orgatex-outage-simulation**

- ✅ **`_sim/offline` → every business endpoint 503 and `OrgatexPort` raises `ORGATEX_UNAVAILABLE`**: `simulation.test.ts`
- ✅ **`_sim/online` → endpoints respond normally**: `simulation.test.ts`
- ✅ **`_sim/reset` → data equals the seed**: `simulation.test.ts`
- ✅ **Production mode → `_sim/*` 404**: `simulation.test.ts`

**Bolt-level (implementation-plan.md)**: all six criteria met (the five above plus "all tests, typecheck, lint and format pass").

### Issues Found

None.

### Notes

- Write-side tests build a fresh in-memory app per test, so postings and status changes never leak between tests or into `data/orgatex.db`.
- The manual check recorded in the implementation walkthrough (same-key double post, conflict, status, offline, reset against `npm start`) matches the automated results.

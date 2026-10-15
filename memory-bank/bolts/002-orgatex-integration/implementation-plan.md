---
stage: plan
bolt: 002-orgatex-integration
created: 2026-10-15T12:49:13Z
---

## Implementation Plan: orgatex-integration (bolt 2 of 17)

### Objective

Complete the Dummy OrgaTEX training system and `OrgatexPort` with the **write side** — idempotent consumption posting and batch status updates — and add the **training-only simulation controls** (offline / online / reset), so OrgaTEX write-back and OrgaTEX-unavailable behaviour can be built and tested in later bolts.

### Stories and requirements implemented

| Story | Requirements | What it delivers |
|-------|--------------|------------------|
| `004-dummy-orgatex-accepts-consumption-idempotently` | DB-1 (write side), NFR-7, IR-05, IR-06, IR-08; supports FR-26, FR-27, FR-28 | `POST …/consumption` with `Idempotency-Key`, `GET …/consumption`, `PATCH …/status`; port `postConsumption`, `setBatchStatus` |
| `005-orgatex-outage-simulation` | DB-6; supports FR-28, FR-36, workbook Step 30 | `/ext/orgatex/_sim/offline`, `/online`, `/reset`, `/state` — dev/test only |

Out of scope: write-back orchestration, PENDING/retry state and the WeighingMS `/api/batches/:id/consumption` facade (bolt 014); batch-status calls from the weighing session (bolts 006/010).

---

### 1. What will change

1. **Dummy OrgaTEX database**: two new tables — consumption postings and their lines — via a second Drizzle migration. Quantities stay decimal text + unit.
2. **Dummy OrgaTEX endpoints (training contract)**: consumption post with idempotency, consumption listing, batch status update with forward-only transitions.
3. **Simulation controls**: an in-memory offline switch that makes every non-`_sim` Dummy OrgaTEX endpoint answer 503; reset to seed (also clears postings and goes back online); state readout. Registered only when `config.enableSimulation` is true (development/test), never in production.
4. **Port + adapter**: `OrgatexPort` gains `postConsumption` and `setBatchStatus`. The adapter's transport generalises from GET-only to `request(method, path, body, headers)`; new error translations for 409/422 answers.
5. **Errors**: new domain errors `BATCH_NOT_RELEASED` (409), `IDEMPOTENCY_CONFLICT` (409), `INVALID_STATUS_TRANSITION` (409), `CONSUMPTION_REJECTED` (422).

### 2. Files to be created / modified

```text
src/server/integrations/orgatex/dummy/
  schema.ts                  + consumption_postings, consumption_lines tables          (modified)
  migrations/0001_*.sql      generated                                                  (new)
  contract.ts                + posting request/receipt, status update types             (modified)
  routes.ts                  + POST/GET consumption, PATCH status                       (modified)
  consumption.ts             idempotency + validation logic for postings                (new)
  simulation.ts              offline switch + _sim routes (offline/online/reset/state)  (new)
  seed.ts                    reset also clears postings                                 (modified)
  routes.test.ts             + write-side contract tests                                (modified)
  simulation.test.ts         _sim behaviour + production gating                         (new)
src/server/integrations/orgatex/
  orgatex-port.ts            + postConsumption, setBatchStatus, receipt types           (modified)
  http-orgatex-adapter.ts    generalised transport, new operations, 409/422 mapping     (modified)
  http-orgatex-adapter.test.ts + write operations, conflict and offline cases           (modified)
src/server/app.ts            register simulation plugin when enabled; inject transport  (modified)
src/server/errors.ts, src/shared/errors.ts   + new error codes/classes                  (modified)
README.md                    + new endpoints and reset instructions                     (modified)
```

### 3. APIs involved (Dummy OrgaTEX — training contract, not the real OrgaTEX interface)

| Method | Path | Behaviour |
|--------|------|-----------|
| POST | `/ext/orgatex/batches/:batchId/consumption` | Header `Idempotency-Key` required (400 if missing). Body `{ completedAt, operatorId, lines: [{ sequence, dyestuffCode, lotId, actual{value,unit}, target{value,unit}, result }] }`. **200** with the stored receipt `{ postingId, batchId, idempotencyKey, receivedAt, lines }`. Same key + same body → the **original** receipt, nothing new stored. Same key + different body → **409 `IDEMPOTENCY_CONFLICT`**. Unknown batch → 404. Batch not released (QUEUED) → **409 `BATCH_NOT_RELEASED`**. A line whose dyestuff is not in the batch recipe, or whose lot does not belong to its dyestuff, or with a non-decimal quantity → **422 `CONSUMPTION_REJECTED`** |
| GET | `/ext/orgatex/batches/:batchId/consumption` | `{ items: receipt[] }` — the stored record(s) (workbook Step 26 evidence) |
| PATCH | `/ext/orgatex/batches/:batchId/status` | Body `{ status: "WEIGHING" \| "WEIGHED" }`. Forward-only: RELEASED→WEIGHING, RELEASED→WEIGHED, WEIGHING→WEIGHED; same status → 200 (idempotent). QUEUED → 409 `BATCH_NOT_RELEASED`; backwards → 409 `INVALID_STATUS_TRANSITION`. Returns the batch |
| POST | `/ext/orgatex/_sim/offline` | dev/test only. All non-`_sim` `/ext/orgatex` endpoints answer **503** `{ error: { code: "ORGATEX_OFFLINE" } }` |
| POST | `/ext/orgatex/_sim/online` | dev/test only. Normal answers again |
| POST | `/ext/orgatex/_sim/reset` | dev/test only. Reload seed (batches back to TD-7 statuses), delete postings, go online |
| GET | `/ext/orgatex/_sim/state` | dev/test only. `{ online, postings }` |

**Port (in-process)**: `postConsumption(batchId, posting, idempotencyKey) → OrgatexConsumptionReceipt`, `setBatchStatus(batchId, status) → OrgatexBatch`. Offline/5xx/timeout → `ORGATEX_UNAVAILABLE` (existing behaviour, link OFFLINE).

### 4. Technical approach

- **Idempotency**: the stored posting keeps the key (unique index) and a SHA-256 hash of the canonical request body. Lookup by key happens before validation, inside one SQLite transaction with the insert, so a repeat never double-posts.
- **Offline switch**: an `onRequest` hook in the Dummy OrgaTEX plugin checks the in-memory flag and short-circuits with 503 for every route except `/_sim/*`. The flag belongs to the dummy instance; WeighingMS code cannot see it.
- **Production gating**: `app.ts` registers the `_sim` routes only when `config.enableSimulation`; production builds answer 404 for them.
- **Adapter transport**: `HttpClient.request({ method, path, body?, headers? })`; both the `fetch` transport and the test `inject` transport implement it. Existing GET operations move onto it unchanged.
- **Status codes → errors**: 409 with `BATCH_NOT_RELEASED` / `IDEMPOTENCY_CONFLICT` / `INVALID_STATUS_TRANSITION` → matching domain errors (409); 422 → `ConsumptionRejectedError`; 400 → `OrgatexProtocolError` (WeighingMS sent something malformed); 503/5xx/network/timeout → `OrgatexUnavailableError`.

### 5. How this will be tested

| Level | Tests |
|-------|-------|
| Contract (`routes.test.ts`) | Post B-24187 with key K and 5 lines → 200 + receipt; repeat K → identical receipt, still one posting; K with different body → 409; missing key → 400; QUEUED batch → 409; unknown batch → 404; foreign dyestuff / wrong lot / numeric quantity → 422; GET consumption returns the stored record; status RELEASED→WEIGHING→WEIGHED visible in the queue; same status idempotent; backwards → 409; QUEUED → 409 |
| Simulation (`simulation.test.ts`) | Offline → every business endpoint 503 and `OrgatexPort` raises `ORGATEX_UNAVAILABLE` with link OFFLINE; online → normal; reset → statuses equal seed, postings gone, online; state readout; **production config → `_sim` routes 404** |
| Adapter (`http-orgatex-adapter.test.ts`) | `postConsumption` returns mapped receipt and is idempotent through the port; `setBatchStatus` maps the batch; 409/422 answers → correct domain errors; offline → `ORGATEX_UNAVAILABLE`; existing read tests keep passing on the generalised transport |
| Regression | All 46 existing tests pass; typecheck, lint, format pass |
| Manual | `curl` the post twice with the same key against `npm start` and show one stored posting |

### Acceptance Criteria (bolt level)

- [ ] Consumption posting stored once per idempotency key; repeat returns the original receipt; conflicting body → 409
- [ ] `GET …/consumption` returns the stored record
- [ ] Batch status RELEASED → WEIGHING → WEIGHED visible in the queue; invalid transitions rejected
- [ ] `_sim/offline` makes every business endpoint 503 and the port raise `ORGATEX_UNAVAILABLE`; `_sim/online` restores; `_sim/reset` restores seed data
- [ ] `_sim` endpoints are absent (404) in production configuration
- [ ] All tests, typecheck, lint and format pass

### Notes

- The posting body shape is a **training contract** chosen to carry what brief IR-05 names (actual consumption per component, lot); the real OrgaTEX format is unknown (A-02).
- `operatorId` is carried for traceability; Dummy OrgaTEX does not validate it (operators are WeighingMS-owned).

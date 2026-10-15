---
stage: plan
bolt: 005-batch-and-material
created: 2026-10-15T14:07:22Z
---

## Implementation Plan: batch-and-material — queue, selection, recipe (bolt 5 of 17)

### Objective

Give the station its view of OrgaTEX work through the WeighingMS API: the **batch queue**, **batch selection with the release check**, and the **recipe** for a selected batch — at exactly the paths the workbook uses (`GET /api/batches`, `/api/batches/:batchId`, `/api/batches/:batchId/recipe`) — with a defined answer when OrgaTEX cannot be reached. Also provides the batch service that the weighing session (bolt 006) will use to refuse batches that are not released.

### Stories and requirements implemented

| Story | Requirements | What it delivers |
|-------|--------------|------------------|
| `001-station-batch-queue` | FR-2, IR-01 | `GET /api/batches`: queue with order, machine, fabric, shade, component count, status, `selectable`, reason, received time |
| `002-select-batch-with-release-check` | FR-3, FR-4, BR-03 | `GET /api/batches/:batchId` (scan-normalised ID); selection rule; `requireWeighable()` for bolt 006 (409 `BATCH_NOT_RELEASED`); 404 `BATCH_NOT_FOUND` |
| `003-load-recipe-for-batch` | FR-5, NFR-2, IR-02 | `GET /api/batches/:batchId/recipe` with exact decimal values |
| `004-orgatex-unavailable-on-load` | FR-36, BR-16, A-03, TD-1 | 503 `ORGATEX_UNAVAILABLE` (never an empty queue) and recovery when OrgaTEX returns |

Not in this bolt: lot/container validation (bolt 008), weighing sessions (bolt 006 — the criterion "a session in progress keeps working while OrgaTEX is offline" is verified there, because sessions do not exist yet), UI (bolt 007).

---

### 1. What will change

1. **Selection rule** (`src/shared/domain/batch-selection.ts`, pure, shared with the UI): a batch is selectable when its OrgaTEX status is RELEASED, or WEIGHING (resume an existing session); QUEUED → "Not released by OrgaTEX"; WEIGHED → "Already weighed"; a batch without a recipe is not selectable ("No recipe available").
2. **Batch service** (`src/server/modules/batches/batch-service.ts`): wraps `OrgatexPort`; normalises scanned IDs (trim + upper case, as in the scan-code rules); `getQueue()`, `getBatch(id)`, `getRecipe(id)`, `requireWeighable(id)` (throws `BATCH_NOT_RELEASED` 409 with the reason). Errors from the port (`BATCH_NOT_FOUND`, `RECIPE_NOT_FOUND`, `ORGATEX_UNAVAILABLE`) pass through unchanged.
3. **Facade routes** (`src/server/modules/batches/routes.ts`): the three `/api/batches…` endpoints, mapping port types to the shared API contract.
4. **API contract** (`src/shared/batches.ts`): queue, batch and recipe response types for the UI.
5. **App wiring**: service decorated as `app.batches` (for bolt 006), routes registered under `/api`.

### 2. Files to be created / modified

```text
src/shared/domain/batch-selection.ts         selection rule + reasons (pure)                        (new)
src/shared/domain/batch-selection.test.ts                                                            (new)
src/shared/batches.ts                        /api/batches contract types                            (new)
src/server/modules/batches/batch-service.ts  service over OrgatexPort                               (new)
src/server/modules/batches/batch-service.test.ts                                                     (new)
src/server/modules/batches/routes.ts         /api/batches, /:batchId, /:batchId/recipe              (new)
src/server/modules/batches/routes.test.ts    API tests (online, offline, recovery)                  (new)
src/server/app.ts                            decorate batches service, register routes              (modified)
README.md                                    API table                                              (modified)
```

### 3. APIs involved

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/batches` | `{ items: BatchSummary[], receivedAt }` — `BatchSummary` = `{ batchId, orderRef, machineRef, fabric: { description, weight }, shade, componentCount, status, selectable, reason }` |
| GET | `/api/batches/:batchId` | `BatchSummary` + `releasedAt`; ID normalised (`b-24187` → `B-24187`); 404 `BATCH_NOT_FOUND` |
| GET | `/api/batches/:batchId/recipe` | `{ batchId, recipeId, shade, version, components: [{ sequence, dyestuff: { code, name, shortName, colourHex, type }, target, tolerance, barMax, suggestedLotId }] }`; 404 `BATCH_NOT_FOUND` / `RECIPE_NOT_FOUND` |
| — | any of the above, OrgaTEX unreachable | **503 `ORGATEX_UNAVAILABLE`** |

**Consumed:** `OrgatexPort.listBatches`, `getBatch`, `getRecipe` (bolt 001). **Provided in-process:** `BatchService.requireWeighable(batchId)` for `POST /api/sessions` (bolt 006).

These are the workbook's Step 18/19 paths; they are WeighingMS endpoints that delegate to Dummy OrgaTEX through the adapter (`api-conventions.md`, facade pattern).

### 4. Technical approach

- **Thin facade, no storage**: OrgaTEX stays master (C-01); every request goes through the port, so the queue's `receivedAt` is the time WeighingMS received it.
- **Reason texts** are fixed English strings in the shared rule (they become catalogue keys when the UI message catalogue arrives in bolt 007).
- **Recipe of a non-selectable batch** is still returned if OrgaTEX has one (B-24188 is RELEASED; B-24190/B-24191 have none → 404); selection is enforced where a session is started, not when viewing.
- **Errors**: the port's domain errors map through the existing central handler — no new error codes.

### 5. How this will be tested

| Level | Tests |
|-------|-------|
| Unit — rule | RELEASED and WEIGHING selectable; QUEUED "Not released by OrgaTEX"; WEIGHED "Already weighed"; no recipe "No recipe available" |
| Unit — service (fake port) | ID normalisation; `requireWeighable` passes for RELEASED/WEIGHING, throws 409 `BATCH_NOT_RELEASED` with the reason for QUEUED/WEIGHED; port errors pass through |
| API — online | queue lists B-24187, B-24188 (selectable) and B-24190, B-24191 (not selectable, reason) with prototype values and `receivedAt`; after Dummy OrgaTEX sets B-24187 WEIGHED → "Already weighed"; WEIGHING → selectable; `GET /api/batches/B-24187` and `/b-24187` → detail; `B-99999` → 404; recipe → Teal 4C, five components in sequence, exact strings equal to the seed; B-24190 recipe → 404 `RECIPE_NOT_FOUND`; recipe response time ≪ 3 s |
| API — OrgaTEX offline | `_sim/offline` → queue, detail and recipe 503 `ORGATEX_UNAVAILABLE` (not an empty list); `_sim/online` → normal answers again |
| Regression | all 177 existing tests; typecheck, lint, format |
| Manual | `curl` the three workbook paths against `npm start` (preview of Step 18) |

### Acceptance Criteria (bolt level)

- [ ] `GET /api/batches` returns the four batches with all queue fields, `selectable`, reason and received time
- [ ] QUEUED → not selectable "Not released by OrgaTEX"; WEIGHED → "Already weighed"; WEIGHING → selectable (resume)
- [ ] `GET /api/batches/B-24187` → detail with `selectable: true`; scanned lower-case ID resolves; unknown → 404 `BATCH_NOT_FOUND`
- [ ] `requireWeighable` refuses QUEUED/WEIGHED batches with 409 `BATCH_NOT_RELEASED` (ready for bolt 006)
- [ ] `GET /api/batches/B-24187/recipe` → Teal 4C and five components with exact seed values
- [ ] OrgaTEX offline → 503 `ORGATEX_UNAVAILABLE` on queue, detail and recipe; recovers when online
- [ ] All tests, typecheck, lint and format pass

### Notes

- Story 004's fourth criterion (session keeps working while OrgaTEX is offline) depends on sessions and is carried into bolt 006's tests; it is recorded here so it is not lost.

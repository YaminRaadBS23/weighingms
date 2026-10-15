---
stage: implement
bolt: 005-batch-and-material
created: 2026-10-15T14:09:16Z
---

## Implementation Walkthrough: batch-and-material — queue, selection, recipe (bolt 5)

### Summary

The station can now obtain its work from OrgaTEX through the WeighingMS API at the workbook's paths: the batch queue with a selectable flag and reason per batch, the detail of a batch (by scanned or typed ID), and the recipe of a batch. A shared selection rule decides which batches may be weighed, and a batch service offers the release check the weighing session will use. When OrgaTEX cannot be reached, all three endpoints answer 503 rather than returning empty or stale data.

### Structure Overview

A pure selection rule lives in shared domain code so the UI can apply the same rule. A batch service in the WeighingMS batches module wraps `OrgatexPort`, normalises IDs, maps port types to the shared API contract and provides the release check; the routes module exposes it as a thin facade. Nothing is stored — OrgaTEX remains the master of batches and recipes.

### Completed Work

- [x] `src/shared/domain/batch-selection.ts` - Selection rule: RELEASED and WEIGHING selectable; QUEUED, WEIGHED and no-recipe batches not selectable, each with a fixed reason
- [x] `src/shared/batches.ts` - `/api/batches` contract types (queue, batch detail, recipe) shared with the UI
- [x] `src/server/modules/batches/batch-service.ts` - Queue, batch and recipe over OrgatexPort; scanned-ID normalisation; `requireWeighable` release check for session start
- [x] `src/server/modules/batches/routes.ts` - `GET /api/batches`, `/api/batches/:batchId`, `/api/batches/:batchId/recipe`
- [x] `src/server/errors.ts` - Batch-not-released error now carries the reason
- [x] `src/server/app.ts` - Batch service decorated for later modules; batch routes registered under `/api`
- [x] `README.md` - Batch endpoints and module layout

### Key Decisions

- **Selection rule as shared pure code**: the queue's `selectable`/reason and the session's release check (bolt 006) can never disagree, and the UI can reuse it.
- **A batch without a recipe is not selectable** ("No recipe available"): covers B-24190/B-24191, whose recipes are not in the prototype.
- **Viewing is not restricted, starting is**: details and recipes are returned for any batch OrgaTEX knows; the release check is enforced when a session starts.
- **No local cache**: every request goes to OrgaTEX through the port; `receivedAt` is the time WeighingMS received the queue.

### Deviations from Plan

None.

### Dependencies Added

None.

### Developer Notes

- Verified manually against `npm start` (preview of workbook Step 18): `curl /api/batches` → B-24187 and B-24188 selectable, B-24190 and B-24191 "Not released by OrgaTEX", with order, machine, fabric · weight, shade and component count; `/api/batches/B-24187` → detail with `selectable: true`; `/api/batches/b-24187` → resolves to B-24187; `/api/batches/B-24187/recipe` → Teal 4C with the five components and exact values in 5 ms; B-99999 → 404 `BATCH_NOT_FOUND`; B-24190 recipe → 404 `RECIPE_NOT_FOUND`; OrgaTEX offline → 503 `ORGATEX_UNAVAILABLE`; online again → 200.
- Typecheck, lint, format pass; all 177 existing tests pass.
- Story 004's "session keeps working while OrgaTEX is offline" is carried into bolt 006.

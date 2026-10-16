---
stage: test
bolt: 005-batch-and-material
created: 2026-10-16T08:29:37Z
---

## Test Report: batch-and-material — queue, selection, recipe (bolt 5)

### Summary

- **Tests**: 200/200 passed (20 files; 23 new in this bolt, 177 regression)
- **Coverage**: not measured (project standard: critical-path list instead of a coverage gate); every acceptance criterion below is covered by a test, except one carried into bolt 006 (see Notes)
- **Quality gates**: `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run format:check` ✅

### Test Files

- [x] `src/shared/domain/batch-selection.test.ts` - **6 tests**: RELEASED and WEIGHING selectable; QUEUED (with or without recipe) "Not released by OrgaTEX"; WEIGHED "Already weighed"; RELEASED without recipe "No recipe available"
- [x] `src/server/modules/batches/batch-service.test.ts` - **7 tests** with a fake OrgatexPort: scanned ID trimmed and upper-cased before OrgaTEX is asked; queue items carry `selectable` and reason; `requireWeighable` accepts RELEASED and WEIGHING; refuses QUEUED and WEIGHED with 409 `BATCH_NOT_RELEASED` and the reason; port errors (`BATCH_NOT_FOUND`, `ORGATEX_UNAVAILABLE`) pass through unchanged
- [x] `src/server/modules/batches/routes.test.ts` - **10 API tests** against the in-process Dummy OrgaTEX: queue with all prototype values, statuses, `selectable`, reasons and `receivedAt`; WEIGHED → "Already weighed", WEIGHING → selectable; exact detail of B-24187; lower-case scanned ID; B-24190 detail not selectable; unknown → 404; release check refuses B-24190 (409) and accepts `b-24187`; recipe equal to the seed file (all five components, short names, exact decimal strings) in under 3 s; batch without recipe → 404 `RECIPE_NOT_FOUND`; **OrgaTEX offline → 503 on queue, detail and recipe (no empty queue), recovery after online**
- [x] Regression: all 177 tests from bolts 001–004 pass

### Acceptance Criteria Validation

**Story 001-station-batch-queue**
- ✅ **`GET /api/batches` returns B-24187, B-24188, B-24190, B-24191 with order, machine, fabric, shade, component count, status, `selectable` and received time**: API test
- ✅ **B-24190 QUEUED → `selectable:false`, "Not released by OrgaTEX"**: API and rule tests
- ✅ **B-24187 WEIGHED → `selectable:false`, "Already weighed"**: API and rule tests

**Story 002-select-batch-with-release-check**
- ✅ **`GET /api/batches/B-24187` → detail with `selectable:true`**: API test
- ✅ **B-24190 at session start → 409 `BATCH_NOT_RELEASED` with reason**: `requireWeighable` API and service tests (the `POST /api/sessions` endpoint itself arrives in bolt 006 and calls this check)
- ✅ **Scanned `B-99999` → 404 `BATCH_NOT_FOUND`**: API test
- ✅ **WEIGHING batch selectable for resume**: API, service and rule tests

**Story 003-load-recipe-for-batch**
- ✅ **Recipe: Teal 4C, five components in sequence with dyestuff (code, name, colour, short name), target, tolerance, unit, bar full-scale, suggested lot**: API test
- ✅ **Values equal the seed exactly (decimal strings)**: API test compares against `data/seed/orgatex-seed.json`
- ✅ **Response ≤ 3 s**: API test (measured locally in milliseconds)

**Story 004-orgatex-unavailable-on-load**
- ✅ **OrgaTEX offline → `GET /api/batches` 503 `ORGATEX_UNAVAILABLE`, not an empty list**: API test
- ✅ **OrgaTEX offline → recipe 503**: API test
- ✅ **OrgaTEX back online → normal responses**: API test
- ⏭️ **Session in progress keeps working while OrgaTEX is offline**: carried into bolt 006 (sessions do not exist yet) — recorded in the plan

### Issues Found

None.

### Notes

- These tests also serve as the automated version of workbook Step 18's API checks; the `curl` evidence file for Step 18 is produced separately after this bolt.
- The carried-over criterion will be added to bolt 006's tests so it is not lost.

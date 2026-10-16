---
stage: test
bolt: 008-batch-and-material
created: 2026-10-16T12:58:52Z
---

## Test Report: batch-and-material — lot validation and container master (bolt 8)

### Summary

- **Tests**: 356/356 passed (36 files; 54 new in this bolt, 302 regression); full suite run three times in a row, 356/356 each time
- **Coverage**: not measured (project standard: critical-path list instead of a coverage gate); every acceptance criterion below is covered by a test
- **Quality gates**: `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run format:check` ✅

### Test Files

- [x] `src/server/integrations/orgatex/dummy/routes.test.ts` - **+7 tests**: `GET /ext/orgatex/lots/:lotId` for each of the six seeded lots (incl. training-only `2026-0402`) with its dyestuff; unknown lot → 404 `LOT_NOT_FOUND` in the standard error body
- [x] `src/server/integrations/orgatex/http-orgatex-adapter.test.ts` - **+3 tests**: `findLot` maps a lot; unknown lot → `LOT_NOT_FOUND` (404); OrgaTEX unreachable → `ORGATEX_UNAVAILABLE` (503)
- [x] `src/server/modules/materials/container-repository.test.ts` - **7 tests**: six containers seeded with exact tares (214.0 g / 1.850 kg), types, service state and defaults; second start does not duplicate; **an existing database that already has operators receives the containers and keeps its operators**; lookup by ID and by default dyestuff; the database refuses two containers defaulting to one dyestuff; seed validation (bad ID, bad tare, bad unit, duplicate default)
- [x] `src/server/modules/materials/material-service.test.ts` - **16 tests** (fake OrgaTEX port): lot ok / training-only lot / `LOT_MISMATCH` / `LOT_NOT_FOUND` / `ORGATEX_UNAVAILABLE` / trimming; **`resolveLot` returns the suggested lot with no OrgaTEX call, even while OrgaTEX is offline**; a scanned lot is validated and replaces the suggestion; wrong-dyestuff scan refused; scan while offline fails; container ok with normalisation, unknown, out of service; default container for all five dyestuffs; none for an unknown dyestuff
- [x] `src/server/modules/materials/routes.test.ts` - **21 tests** over HTTP: `2026-0387` for DYE-4471 → 200; `2026-0402` → 200; `2026-0341` → 422 `LOT_MISMATCH`; unknown lot → 404; 400 for missing/empty/non-string fields; OrgaTEX offline → 503; `GET /api/containers` lists six containers with decimal-text tares and still answers while OrgaTEX is offline; **B-24187 recipe components → default containers Blue→C-09, Red→C-11, Yellow→C-12, Sodium Sulphate→D-03, Soda Ash→D-05**; container validate: `C-12` → 200 with tare, lower-case/padded input, `C-99` → 404 `CONTAINER_UNKNOWN`, `C-13` → 422 `CONTAINER_OUT_OF_SERVICE`, 400 for empty codes
- [x] Regression: all 302 tests from bolts 001–007 pass

### Acceptance Criteria Validation

- ✅ **DYE-4471 + `2026-0387` ok; + `2026-0341` → 422 `LOT_MISMATCH`; unknown lot → 404 `LOT_NOT_FOUND`**: routes and service tests
- ✅ **No scanned lot → suggested lot, no OrgaTEX call**: service test (recording fake, OrgaTEX offline)
- ✅ **C-09, C-11, C-12 (214.0 g) and D-03, D-05 (1.850 kg) exist and are in service**: repository and routes tests
- ✅ **Default containers for B-24187 components**: routes test (read from the real recipe endpoint)
- ✅ **`C-99` → 404 `CONTAINER_UNKNOWN`; out-of-service → 422 `CONTAINER_OUT_OF_SERVICE`**: service and routes tests
- ✅ **Existing `weighingms.db` receives containers without losing operators or sessions**: repository test (operators kept); manual check in Stage 2 also kept the in-progress session
- ✅ **All tests, typecheck, lint and format pass**

### Issues Found

None. No defects were found in the Stage 2 code by the new tests.

### Notes

- The tests that need OrgaTEX use the in-process Dummy OrgaTEX through Fastify inject (`_sim/offline` for the offline cases); service tests use a fake port so the "no OrgaTEX call" rule is observable.
- Using these checks in the weighing session (identity/lot/container unlock) is tested in bolt 009.

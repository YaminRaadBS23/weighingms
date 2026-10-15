---
stage: test
bolt: 001-orgatex-integration
created: 2026-10-15T12:46:34Z
---

## Test Report: orgatex-integration

### Summary

- **Tests**: 46/46 passed (6 test files, Vitest 5.0.4, ~0.7 s)
- **Coverage**: not measured — the project standard uses a critical-path list instead of a coverage gate (`coding-standards.md`); every acceptance criterion below is covered by at least one test or a recorded live check
- **Quality gates**: `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run format:check` ✅ · `vite build` ✅

### Test Files

- [x] `src/shared/quantity.test.ts` - Decimal arithmetic (0.1 + 0.2 = 0.3), exact g↔kg conversion, cross-unit add/subtract, comparison at tolerance boundaries, display precision, rejection of non-decimal input (6 tests)
- [x] `src/server/errors.test.ts` - Each DomainError maps to its HTTP status and stable code; details only when present (6 tests)
- [x] `src/server/app.test.ts` - Health endpoint; DomainError → standard error body; unexpected error → generic 500 without leaking detail; unknown route → standard 404; OrgatexPort available to WeighingMS code (5 tests)
- [x] `src/server/integrations/orgatex/dummy/seed.test.ts` - Repository seed validates; loads 4 batches / 1 recipe / 5 components / 6 lots; quantities stored as strings; seed-if-empty preserves data; broken reference and numeric quantity rejected (5 tests)
- [x] `src/server/integrations/orgatex/dummy/routes.test.ts` - Contract tests for every Dummy OrgaTEX read endpoint: ping, queue with exact prototype values and TD-7 statuses, unknown station, batch, recipe with all five components in sequence, string quantities, lots incl. training-only lot, four 404 cases in the standard body (12 tests)
- [x] `src/server/integrations/orgatex/http-orgatex-adapter.test.ts` - Mapping to port types and received time; batch/recipe/lots mapping; 404 → BATCH/RECIPE/DYESTUFF_NOT_FOUND; link status ONLINE with last contact; one structured log line per call (IR-09); unreachable → ORGATEX_UNAVAILABLE + OFFLINE; timeout → ORGATEX_UNAVAILABLE within the limit; 5xx → ORGATEX_UNAVAILABLE; malformed payload → ORGATEX_PROTOCOL_ERROR; last contact kept when OFFLINE (12 tests)

Supporting file: `src/server/test-support.ts` - builds a fresh app with an in-memory Dummy OrgaTEX reached through Fastify inject.

### Acceptance Criteria Validation

**Story 001-project-scaffold**

- ✅ **`npm install` + `npm run dev` → server on 127.0.0.1 and UI shell in the browser**: live check — UI at 127.0.0.1:5173 serves "WeighingMS — Station 01"; `/api/health` reachable directly on :3000 and through the Vite proxy
- ✅ **`GET /api/health` → 200 `{ "status": "ok" }`**: `app.test.ts`
- ✅ **DomainError → `{ error: { code, message } }` with mapped status**: `app.test.ts`, `errors.test.ts`
- ✅ **`npm test`, `npm run lint`, `npm run format:check` pass**: all green (plus `typecheck`)
- ✅ **`"0.1" + "0.2"` g = exactly `"0.3"` g**: `quantity.test.ts`

**Story 002-dummy-orgatex-serves-batches-and-recipes**

- ✅ **Queue returns B-24187, B-24188 (RELEASED), B-24190, B-24191 (QUEUED) with prototype values**: `routes.test.ts`
- ✅ **B-24187 recipe: five components in sequence with exact target/tolerance/unit, code, colour, short name, bar full-scale, suggested lot**: `routes.test.ts`
- ✅ **DYE-4471 lots include 2026-0387**: `routes.test.ts`
- ✅ **Unknown batch → 404 in standard error format**: `routes.test.ts`
- ✅ **Quantities are `{ value: string, unit }`**: `routes.test.ts`, `seed.test.ts`

**Story 003-orgatex-port-read-operations**

- ✅ **listBatches / getBatch / getRecipe / listLots return WeighingMS domain types**: `http-orgatex-adapter.test.ts` (inject transport) and live check over real `fetch` (4 batches, 5 components, link ONLINE)
- ✅ **Dummy 404 → BATCH_NOT_FOUND / RECIPE_NOT_FOUND (and DYESTUFF_NOT_FOUND)**: `http-orgatex-adapter.test.ts`
- ✅ **Unreachable or slower than timeout → ORGATEX_UNAVAILABLE**: `http-orgatex-adapter.test.ts`
- ✅ **getLinkStatus → ONLINE + last contact time after success**: `http-orgatex-adapter.test.ts`
- ✅ **One structured log line per call with operation, batch ID and outcome (IR-09)**: `http-orgatex-adapter.test.ts`

**Bolt-level (implementation-plan.md)**

- ✅ OrgatexPort is the only way WeighingMS code reads OrgaTEX data (no module outside the adapter imports the dummy contract or schema)
- ✅ No scenario data outside `data/seed/` and test expectations (UI shell contains none)

### Issues Found

- None in the product code. One test-harness note: an ad-hoc live-check script outside the project was first compiled as CommonJS; rerun as an ES module — not a product issue.

### Notes

- Tests use an in-memory SQLite Dummy OrgaTEX per app instance, so they are independent and leave `data/orgatex.db` untouched.
- The unreachable-OrgaTEX test uses `127.0.0.1:9` (connection refused); the timeout test uses a transport that never answers and a 50 ms limit.
- `npm audit`: 4 moderate findings via the dev-only `drizzle-kit` (see implementation walkthrough); runtime dependencies unaffected.

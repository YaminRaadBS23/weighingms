---
stage: test
bolt: 007-assisted-weighing-station-ui
created: 2026-10-16T12:51:46Z
---

## Test Report: assisted-weighing-station-ui — shell, sign-in, Select batch (bolt 7)

### Summary

- **Tests**: 302/302 passed (28 files; 49 new in this bolt, 253 regression); full suite run three times in a row, 302/302 each time
- **Coverage**: not measured (project standard: critical-path list instead of a coverage gate); every acceptance criterion below is covered by a test or a recorded browser check
- **Quality gates**: `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run format:check` ✅ · `vite build` ✅

### Test Files

- [x] `src/web/no-scenario-data.test.ts` - **10 tests**: the UI source (comments ignored) contains no batch IDs, order numbers, machine names, dyestuff codes, lot numbers, shades or recipe values, no operator names, no call to `/ext/...`, and no hard-coded batch list. The check was proven able to fail by planting a batch ID in a UI file (it named the file), then restoring it.
- [x] `src/web/screens/select-batch/SelectBatchScreen.test.tsx` - **12 tests**: queue from `GET /api/batches` with the prototype columns, received time, status tags and disabled rows; empty queue; touching a released batch issues **`GET /api/batches` → `GET /api/batches/:id` → `GET …/recipe` → `POST /api/sessions`** in that order and never touches `/ext`; touching a QUEUED batch shows its reason and calls nothing; typed batch ID (classified by the API) starts the batch; scanned batch card starts the batch; a non-batch code is refused; `SESSION_IN_PROGRESS` shown; **OrgaTEX unavailable → "OrgaTEX not reachable" + Retry instead of the table, recovery after Retry**; OrgaTEX dropping while opening a batch; other load failures with Retry
- [x] `src/web/App.test.tsx` - **7 tests**: no operator → sign-in only; operator without session → Select batch with operator chip and Sign out; session in progress (reload) → weigh screen with crumb, recipe, components and the ACTIVE state; same while OrgaTEX is offline (crumb shows the batch only); API unreadable → sign-in; full flow sign in → select → session started → weigh screen; Sign out → sign-in
- [x] `src/web/screens/sign-in/SignInScreen.test.tsx` - **5 tests**: prompt text; typed badge signs in through the API; scanned badge signs in; unknown/inactive badge shows the error and stays; Enter disabled until something is typed
- [x] `src/web/shell/StatusStrip.test.tsx` - **3 tests**: both scales, scanner, printer, ORGATEX link time, EN and the clock; **text for every non-ready state** (CAL EXPIRED, OFFLINE, OUT OF PAPER, ORGATEX OFFLINE); devices shown OFFLINE when the API cannot be reached
- [x] `src/web/shell/TopBar.test.tsx` - **3 tests**: brand, crumb and operator chip; Sign out handler; nothing shown when there is no crumb or operator
- [x] `src/web/i18n/messages.test.ts` (2) and `src/web/shared/format.test.ts` (3) - catalogue wording, placeholders; time and quantity formatting with the prototype precision
- [x] `src/server/modules/orgatex-status/routes.test.ts` - **4 tests**: `/api/orgatex/status` ONLINE with the last-contact time; OFFLINE (200, not an error) keeping the last contact time; recovery; `OrgatexPort.ping()` refreshes the link and never throws
- [x] `src/web/test/mock-api.ts` - Test helper: in-memory fake of the WeighingMS API (records every call) and test fixtures; the fixtures live only in test code
- [x] Regression: all 253 tests from bolts 001–006 pass

### Acceptance Criteria Validation

**Story 001-app-shell-top-bar-and-status-strip**
- ✅ **Dark HMI frame with "WeighingMS STATION 01", crumb and operator chip, prototype tokens**: TopBar tests; browser check
- ✅ **Strip shows SCALE 3 kg · READY, SCALE 32 kg · READY, SCANNER, PRINTER, ORGATEX · LINKED hh:mm, EN and a live clock; changes within 2 s**: StatusStrip tests (2 s refresh); browser check. The pending write-back count is added in bolt 014 (no endpoint exists yet)
- ✅ **Non-ready states carry text next to the dot colour**: StatusStrip test
- ✅ **Every UI string comes from the English catalogue**: catalogue test; components use `t()` throughout

**Story 002-sign-in-screen**
- ✅ **No operator → only the sign-in prompt is reachable**: App test
- ✅ **Valid badge (scanned or typed) → operator chip "Operator R. Karim · Shift A" and Select batch opens**: SignIn tests, App flow test; browser check
- ✅ **Unknown badge → error message**: SignIn test

**Story 003-select-batch-screen**
- ✅ **Queue fetched from `GET /api/batches` and shown with the prototype columns and "Queue received from OrgaTEX at hh:mm"**: Select batch test; browser check (Network tab)
- ✅ **B-24187 touched or scanned → batch, recipe, session start, Weigh opens**: Select batch tests (touch, scan, typed); browser Network tab showed `GET /api/batches/B-24187` → `GET …/recipe` → `POST /api/sessions` 201
- ✅ **QUEUED batch visibly not selectable, touching it shows the reason**: Select batch test; browser check ("Batch B-24190: Not released by OrgaTEX")
- ✅ **OrgaTEX offline → "OrgaTEX not reachable" + Retry instead of the table**: Select batch tests
- ✅ **UI source contains no batch data**: `no-scenario-data.test.ts`

**Bolt-level (implementation-plan.md)**: all eight criteria met.

### Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| Blank page in the dev server: `src/web/api/` collided with the `/api` proxy prefix (found in the browser during Stage 2) | High (page unusable in `npm run dev`) | **Fixed** (folder renamed to `services/`) |
| A test built the app without an in-memory WeighingMS database and created `data/weighingms.db` on every run | Low | **Fixed** in Stage 2 |
| Two assertions in new tests were wrong (ambiguous text query; first request is the scanner poll because child effects run first) | — (test code) | Fixed |

### Notes

- Component tests run in jsdom with an in-memory fake of `fetch`; they check behaviour and the exact request sequence, not pixel layout. Pixel-level comparison with the prototype is workbook Step 28.
- Not covered by an automated browser run: scanner-driven selection and the OrgaTEX-unavailable screen in a real browser (covered by the component tests); a full Playwright run comes in bolt 017.

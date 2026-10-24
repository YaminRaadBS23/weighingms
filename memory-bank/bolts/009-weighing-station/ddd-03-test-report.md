---
unit: 004-weighing-station
bolt: 009-weighing-station
stage: test
status: complete
updated: 2026-10-24T13:04:35Z
---

# Test Report - Weighing Station (bolt 9: component preparation)

## Test Summary

| Category | Passed | Failed | Skipped | Coverage |
|----------|--------|--------|---------|----------|
| Unit — pure rule (`scale-selection.test.ts`) | 22 | 0 | 0 | not measured |
| Unit — aggregate (`weighing-session-preparation.test.ts`) | 17 | 0 | 0 | not measured |
| Unit — per-session lock (`session-lock.test.ts`) | 4 | 0 | 0 | not measured |
| Integration — application with fake scales and real `MaterialService` (`component-preparation.test.ts`) | 45 | 0 | 0 | not measured |
| Persistence — migration 0003 columns, legacy rows, PIN verifier (`preparation-persistence.test.ts`) | 6 | 0 | 0 | not measured |
| Integration — Dummy Scale tare with container (`scale-device.test.ts` +6, `dummy/routes.test.ts` +6, `http-scale-adapter.test.ts` +2) | 14 | 0 | 0 | not measured |
| API — real Dummy Scale and Dummy OrgaTEX, restart with real files (`preparation-routes.test.ts`) | 41 | 0 | 0 | not measured |
| **New in this bolt** | **149** | 0 | 0 | |
| Regression (bolts 001–008) | 356 | 0 | 0 | |
| **Total** | **505** | **0** | **0** | — |

Quality gates: `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run format:check` ✅. Full suite run three times in a row: 505/505 each time. No test created `data/weighingms.db`.

Coverage percentage is not measured — the project standard (`coding-standards.md`) uses a critical-path list instead of a coverage gate; every acceptance criterion and every aggregate invariant of this bolt below has a test.

## Acceptance Criteria Validation

| Story | Criteria | Status |
|-------|----------|--------|
| 004-verify-dyestuff-identity-and-unlock | Yellow active + `DYE-4471` → identity verified, lot 2026-0387, container C-12, container placed, scale tared, net 0.0 g, UNLOCKED | ✅ (application + API, `GET /api/scales/scale-3kg/weight` = 0.0 g) |
| 004-verify-dyestuff-identity-and-unlock | `DYE-2204` → 422 `WRONG_DYESTUFF`, nothing unlocks, no tare | ✅ |
| 004-verify-dyestuff-identity-and-unlock | Valid scanned lot or container replaces the default; container change re-tares | ✅ (lot kept tare; container re-tared; failure is all-or-nothing) |
| 004-verify-dyestuff-identity-and-unlock | Not unlocked → confirm gives 409 `IDENTITY_NOT_VERIFIED` | ✅ at the domain guard `requireUnlocked` (aggregate test); the confirm endpoint arrives in bolt 010, which calls this guard |
| 004-verify-dyestuff-identity-and-unlock | Scale unavailable at unlock → identity verified, tare pending, locked until the tare succeeds | ✅ (state AWAITING_TARE with the cause; retry by scanning again unlocks) |
| 005-automatic-scale-selection | Blue, Red, Yellow → `scale-3kg` | ✅ (pure rule, application, API) |
| 005-automatic-scale-selection | Sodium Sulphate (24.000 kg + 0.120 + 1.850) and Soda Ash → `scale-32kg` | ✅ |
| 005-automatic-scale-selection | Requirement exactly 3 kg → `scale-3kg`; just above → `scale-32kg` | ✅ (3000 g, 3 kg, 3000.1 g, 3.0001 kg; 32 kg inclusive) |
| 005-automatic-scale-selection | Smaller scale expired or disconnected → next suitable; none → `NO_SUITABLE_SCALE` | ✅ (pure rule, activation, unlock re-evaluation, API) |
| 005-automatic-scale-selection | Active component carries scale and mode AUTO | ✅ |
| 005-automatic-scale-selection | Mixed g / kg compared exactly | ✅ |
| 006-supervisor-scale-reselection | Valid supervisor PIN and capable scale → MANUAL and a `SCALE_RESELECT` audit event | ✅ (audit names the supervisor; PIN absent from logs, responses and audit) |
| 006-supervisor-scale-reselection | Operator or wrong PIN (and unknown badge) → 403 `NOT_AUTHORISED`, identical body | ✅ |
| 006-supervisor-scale-reselection | Insufficient capacity → 422 `SCALE_CAPACITY_INSUFFICIENT` | ✅ |
| 007-calibration-enforcement | `scale-3kg` expired, Yellow activated → automatic selection skips it | ✅ |
| 007-calibration-enforcement | Component on a scale that expires → 422 `SCALE_CALIBRATION_EXPIRED` at confirm | ✅ at the domain guard `requireScaleUsable` and at unlock/reselection (422); the confirm endpoint arrives in bolt 010, which calls the guard |
| 007-calibration-enforcement | Valid calibration → no effect | ✅ |

### Model invariants (ddd-01) and design decisions

| Item | Covered by |
|------|-----------|
| (8) active component has scale + preparation; deactivation discards both | aggregate, persistence (columns cleared), application |
| (9) smallest usable capacity, inclusive, ID tie-break | pure rule |
| (10) wrong dyestuff changes nothing | aggregate, application, API |
| (11) lot/container before or after identity | aggregate, application |
| (12) tare tied to container/scale; all-or-nothing changes | aggregate, application (failed re-tare, failed reselection tare) |
| (13) scale usable now; automatic re-evaluation at unlock | aggregate guard, application, API |
| (14) reselection by supervisor only, capacity/usability checked, audit written | application, API |
| ADR-4 Dummy Scale places the container (unless something was added since the last tare) | device, dummy route, adapter, API (incl. the previous-container regression) |
| ADR-5 accepted-but-locked is state (`issue`), refused is an error | application, API |
| ADR-6 double scan tares once | application (tare held in flight), lock unit tests |
| Reselection + audit are one transaction | application (audit failure rolls the reselection back) |
| Legacy active component (before migration) loads as "no scale, nothing verified" | persistence |

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| Container of the previous component stayed "on" the simulated 32 kg scale, so the next unlock tared the wrong weight (found by the manual check in Stage 4, before the tests) | Medium (wrong tare in the demo) | **Fixed** (Dummy Scale rule widened, ADR-4 amended); regression tests in device and API suites |
| One API test assumed a disconnected automatic scale gives a "scale unavailable" issue; the system correctly fails over to the other scale | — (test expectation) | Test rewritten; separate tests now cover failover (automatic) and `SCALE_UNAVAILABLE` (supervisor-chosen scale) |
| One test used wrong arithmetic (Soda Ash requirement 11.51 kg, not 11.61) | — (test data) | Fixed |

## Notes

- Not covered here (by design): the Weigh screen and its scan prompts (bolt 011), the supervisor dialog (bolt 013), the confirm / re-tare endpoints that will call `requireUnlocked` and `requireScaleUsable` (bolt 010), the Training Panel controls (bolt 016).
- Known gaps recorded in the design: no lock-out after repeated wrong PINs (training); a scale that expires after unlock is detected at the next use.
- Carry-forward to bolt 010: the 409 `IDENTITY_NOT_VERIFIED` and 422 `SCALE_CALIBRATION_EXPIRED` responses from the confirm endpoint (story 004 criterion 4, story 007 criterion 2) must be tested there through HTTP.

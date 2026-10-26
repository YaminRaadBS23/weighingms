---
stage: test
bolt: 012-weighing-station
created: 2026-10-26T11:00:00Z
---

## Test Report: weighing-station — supervisor override and the Step 24 rule (bolt 12)

### Summary

- **Tests**: 103 new → **800 passing** (697 before); 52 files
- **Typecheck / lint / format**: clean
- **Coverage focus**: every rule of `ddd-01` invariants 22–28 and every acceptance criterion of stories 013 and 014
- **Evidence**: `STEP-24-overshoot-test.txt` (verbose run of the override tests) and `STEP-24-overshoot-decision.md`

### Test Files

| File | Tests | What it proves |
|------|-------|----------------|
| `src/shared/domain/tolerance.test.ts` (additions) | 17 | `isOverridable`: under, near, over at the boundaries (84.5, 84.6, 93.4, 94.6, 96.4 g) yes; inside the band (93.5, 94.0, 94.5) no; zero and negative no; kg; surplus is measured from the target (+2.4 g, not +1.9 g from the limit) |
| `domain/weighing-record-override.test.ts` | 6 | `buildRecord` with an override: OVERRIDDEN, zone, surplus only for OVER, limits snapshot and measured actual kept, station operator kept; in-tolerance record has no override; an in-tolerance weight cannot carry one |
| `infrastructure/weighing-record-repository.test.ts` (additions) | 10 | override round-trip; null override columns on ordinary records; the insert trigger refuses OVERRIDDEN without override, an override on IN_TOLERANCE, empty/blank reason, unknown zone, stray override columns; foreign key on the supervisor; overridden records are as immutable as any |
| `application/component-override.test.ts` | 50 | recorded facts for over / near / under / kg / last component; reason trimmed; same person as operator and supervisor; **no recalculation**; one fresh read and no OrgaTEX call; every refusal writes nothing (blank reason, wrong PIN, unknown, operator and inactive badge, not signed in, locked, unstable, zero and negative weight, in tolerance at 93.5 / 94.0 / 94.5, scale dead or expired, done / pending / unknown component, suspended and completed session); the scale is **never read** when authorisation fails; logs never hold the PIN or the reason; atomicity both ways; double click serialised; confirm still refuses every zone but OK; recovery (excess removed, re-tare) needs no supervisor; evaluation table (7 weights), unstable, read-only, no sign-in needed, refusals, kg |
| `override-routes.test.ts` (HTTP, real Dummy Scale and OrgaTEX) | 20 | evaluation at 96.4 g; 400 / 401 / 403 / 404 / 409 / 503 answers; the three 403 cases are byte-identical; crafted weight ignored; recipe unchanged; records and audit endpoints; double click; OrgaTEX offline |
| `application/confirmation-test-support.ts` | — | the fake scale and module setup of bolt 010, extracted so the confirmation and override tests share them |

### Acceptance Criteria

| Story | Criterion | Evidence |
|-------|-----------|----------|
| 013 | Valid supervisor PIN and reason → OVERRIDDEN record, override, `OVERRIDE` audit, component DONE | application and HTTP tests "OVERRIDDEN … DONE" |
| 013 | Empty reason → 400 `REASON_REQUIRED`; operator or wrong PIN → 403 `NOT_AUTHORISED` | refusal tests (application and HTTP) |
| 013 | Within tolerance → 409 `OVERRIDE_NOT_NEEDED`; weight 0 → 409 | refusal tests, boundaries 93.5 / 94.0 / 94.5 |
| 014 | 96.4 g: zone OVER, surplus +2.4 g (+2.6 %), confirm not allowed | evaluation tests (application and HTTP) |
| 014 | Re-tare or override apply the existing rules | recovery tests |
| 014 | Overdose leaves the other targets and the recipe unchanged | "no recalculation" tests (application and HTTP) |
| 014 | Removing the excess makes confirm allowed again | recovery test and HTTP "no state is kept" |
| 014 | Override of 96.4 g → OVERRIDDEN, surplus kept, `OVERRIDE` audit | recorded-facts tests |
| 014 | Surplus = weight − target, one decimal percent of the target | rule tests |
| FR-22 AC3 | Record stores supervisor, reason, time and weight | record and audit assertions |

### Verification of the tests

Five deliberate breakages were each caught, then reverted: skipping the "not needed" check (5 failures), storing a surplus for every override (9), allowing an override at zero weight (9), writing the audit event outside the transaction (1), authorising after measuring (4).

### Regression

All 697 earlier tests still pass. The confirmation test file now uses the shared support module; two assertions gained `override: null`.

### Not covered here

The supervisor dialog, the "OVERRIDE REQUESTED — AWAITING SUPERVISOR" state, the surplus panel and the exception banners (bolt 013); OrgaTEX write-back of the OVERRIDDEN flag and the ticket (bolts 014, 015); PIN lock-out (known gap, O-7); a restart-durability test with real files for the override (the repository round-trip and the transaction tests cover storage).

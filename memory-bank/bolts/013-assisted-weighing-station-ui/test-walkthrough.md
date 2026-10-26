# Test Walkthrough — Bolt 013 (Exception states in the Weigh screen)

**Result:** 842 tests pass (800 before + 42 new). Typecheck, ESLint, Prettier and `vite build` clean.

## New tests
| File | Tests | Covers |
|------|-------|--------|
| `weigh-model.test.ts` (+26, now 50) | `scaleCondition` (8 cases incl. the 2 s limit and precedence), OK reasons per condition (4), `overrideKeyState` (6 weights + reasons), `surplusView` (96.4 g, 94.6 g, kg component, absent cases), error wording for supervisor codes (4) |
| `WeighExceptions.test.tsx` (16) | Surplus panel: 96.4 g and 94.6 g, absent in tolerance, disappears after removing excess. Scale failure: lost scale notice and blocked OK/override, reconnect asks for re-tare, re-tare clears it, short gap shows nothing, expired calibration notice. Override dialog: awaiting status, masked PIN, all three fields required, body has badge/PIN/reason only (no weight), refusal stays in dialog and clears the PIN, Cancel/Escape make no call. Change scale: only fitting scales listed, current marked, unusable disabled, request body, refusal. Rail shows "OVERRIDDEN". |

## Not covered by automated tests
Calibration expiring mid-session and the Training Panel are exercised in the browser check (implementation walkthrough) and later in the Playwright bolt 017.

# Implementation Walkthrough — Bolt 013 (Exception states in the Weigh screen)

Implements the approved plan (D-1..D-7). No server change: the UI uses the existing override, scale-options and scale endpoints.

## What was built
| Area | Files |
|------|-------|
| API client | `override`, `scaleOptions`, `reselectScale` in `src/web/services/api-client.ts` |
| View-model | `weigh-model.ts`: `scaleCondition` (OK / LOST after 2 s / RECONNECTED until re-tare / CAL_EXPIRED), `overrideKeyState`, `surplusView`, extended `okKeyState` reasons |
| Components | `ScaleNotice`, `SurplusPanel`, `SupervisorDialog` (Override and Change scale modes) |
| Changed | `WeighScreen` (loss tracking, dialogs, panel), `ActionKeys` (Supervisor override, Change scale), `Readout` ("Scale unavailable"), `RecipeRail` ("✓ … · OVERRIDDEN"), CSS, `messages.ts` |

## Rules kept
- The override request carries badge, PIN and reason only; no weight (ADR-7). PIN field is masked and cleared after each failed attempt.
- Surplus is measured from the target; no recipe recalculation (Step 24, Option A).
- The server decides again on every call; the UI only offers the key.

## Real-browser check (scratch data, training credentials)
1. 1272.4 g on a 1240.0 g target: "Surplus +32.4 g (+2.6%) — over tolerance" with recovery text; OK disabled.
2. Scale disconnected: after ~2 s "Scale unavailable" banner and readout, status "WEIGHING STOPPED", override disabled.
3. Reconnected: "The scale is back — re-tare to continue"; OK and override stay off until Re-tare.
4. Override dialog (status "OVERRIDE REQUESTED — AWAITING SUPERVISOR"), BDG-0901 + PIN + reason: record `OVERRIDDEN`, actual 1272.4 g, surplus 32.4 g (2.6%), supervisor and reason stored; rail shows component 1 done and component 2 active.

## Checks
Typecheck, ESLint and Prettier clean; existing 800 tests still pass. New tests are written in the Test stage.

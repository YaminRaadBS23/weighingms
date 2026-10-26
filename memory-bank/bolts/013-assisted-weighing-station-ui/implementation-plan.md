---
stage: plan
bolt: 013-assisted-weighing-station-ui
created: 2026-10-26T07:00:00Z
---

## Implementation Plan: assisted-weighing-station-ui — exception states (bolt 13 of 17)

### Objective

Add the exception states of the **2 · Weigh** screen (workbook **Step 24 UI evidence**, preparing **Step 30** failure tests): what the operator sees when the **scale is lost or out of calibration**, the **surplus panel** for an over-dosed component, and the **supervisor dialog** for an override (PIN + reason) and for choosing another scale. Everything follows the rules already decided and built: the Step 24 rule (TD-10, Option A — block, recover by removing the excess or Re-tare, supervisor override, **no compensation**) and the server rules of bolts 009 and 012. The UI shows and requests; the server decides (ADR-7).

### Stories and requirements implemented

| Story | Requirements | What it delivers |
|-------|--------------|------------------|
| `008-scale-and-device-failure-states` | FR-33, FR-13 (presentation), NFR-3 | After 2 s without a reading: readout "Scale unavailable", OK disabled, strip OFFLINE (already shown). When the scale returns: a notice asks the operator to **re-tare** and weighing continues. CAL EXPIRED: a message says weighing is blocked on that scale |
| `009-supervisor-dialog` | FR-22, FR-12 (presentation) | **Supervisor override** key; status "OVERRIDE REQUESTED — AWAITING SUPERVISOR"; dialog with badge, masked PIN and reason; valid → component DONE (overridden); invalid PIN or empty reason → error shown, nothing changes. **Change scale** dialog offering only scales with enough capacity; badge then shows "manual" |
| `010-surplus-panel` | FR-20, FR-21 (presentation), TD-10 | Panel "Surplus +2.4 g (+2.6%) — over tolerance" with the recovery actions only, **no compensation table**; disappears when the weight is back in tolerance or after Re-tare |

Out of scope: Confirm & print and the Training Panel (bolt 016), Playwright failure suite (bolt 017), scanner / printer / OrgaTEX banners beyond what the status strip already shows, PIN lock-out.

---

### 1. What will change

**UI (`src/web`) — no server change expected:**

1. **API client** gains `override(sessionId, seq, {supervisorBadge, pin, reason})`, `scaleOptions(sessionId, seq)` and `reselectScale(sessionId, seq, {scaleId, supervisorBadge, pin})`.
2. **Scale condition** (pure, in `weigh-model.ts`): from the 2 s scale list and the weight polling it derives one of `OK`, `LOST` (no successful reading for 2 s, or the scale reported OFFLINE), `RECONNECTED` (readings are back after a loss; a re-tare has not been done yet) or `CAL_EXPIRED`. The 100 ms poll records the time of the first failure; `LOST` is declared after `SCALE_LOST_MS = 2000`.
3. **`ScaleNotice.tsx`**: one banner under the header for the non-OK conditions — "Scale unavailable — check the scale connection" (LOST), "Scale is back — re-tare to continue" (RECONNECTED), "Calibration expired on this scale — weighing is blocked. Ask a supervisor to choose another scale." (CAL_EXPIRED). The readout shows "Scale unavailable" instead of the number while LOST; **OK stays disabled** with the matching reason. After **Re-tare** succeeds the condition returns to OK.
4. **`SurplusPanel.tsx`**: shown while the live zone is OVER, built from the shared `surplus()` (weight − target, percent of target, one decimal): heading "Surplus +2.4 g (+2.6%) — over tolerance", then the approved recovery actions as text — "Remove the excess until the weight is within tolerance, or press Re-tare to start this component again. A supervisor can override." No "would become" table, no recalculation. It disappears as soon as the live weight leaves the OVER zone.
5. **`SupervisorDialog.tsx`** with two modes:
   - **Override**: opened by the **Supervisor override** key (enabled when the component is unlocked and the live reading is not in tolerance and above zero — the shared `isOverridable`; the server still decides). Fields: supervisor badge (typed, or filled by scanning a badge), **PIN (masked, `autocomplete=off`)**, **reason** (required, up to 500 characters, counter). While it is open the status line reads "OVERRIDE REQUESTED — AWAITING SUPERVISOR". Submit → `POST …/override`; success closes the dialog and applies the returned session (component DONE, next ACTIVE); any refusal is shown inside the dialog in words (not authorised, reason required, weight now in tolerance, reading unstable, …) and **nothing changes**; the PIN field is cleared after every attempt.
   - **Change scale**: opened by a **Change scale** key. Lists the scales from `GET …/scale-options` that **fit** the requirement (capacity ≥ requirement); a scale that fits but is not usable (OFFLINE, CAL EXPIRED) is shown disabled with its state; the current one is marked. Supervisor badge and masked PIN are required. Success closes the dialog and the badge reads "manual".
   - Cancel or Escape closes without any call; focus starts on the first field; the PIN is held only in the input and in the request (never logged, never kept in app state after submit).
6. **Action keys** gain **Supervisor override** (right-aligned ghost key, as in the prototype) and **Change scale**; the disabled reason of OK is extended (scale lost / re-tare needed / calibration expired).
7. **Rail**: a done row that was overridden reads "✓ 96.4 g · OVERRIDDEN" so the exception stays visible.
8. **Catalogue**: all new strings and error wording in `i18n/messages.ts` (NFR-13): NOT_AUTHORISED, REASON_REQUIRED, OVERRIDE_NOT_NEEDED, NOTHING_TO_OVERRIDE, SCALE_CAPACITY_INSUFFICIENT, SCALE_CALIBRATION_EXPIRED, SCALE_UNAVAILABLE and the notices above.

### 2. Files to be created / modified

```text
src/web/services/api-client.ts                       + override, scaleOptions, reselectScale                       (modified)
src/web/i18n/messages.ts                             + notices, dialog, surplus panel, error wording               (modified)
src/web/screens/weigh/weigh-model.ts (+ test)        + scaleCondition, overrideKeyState, surplusView, OK reasons    (modified)
src/web/screens/weigh/WeighScreen.tsx                loss/reconnect tracking, dialogs, panel, new keys             (modified)
src/web/screens/weigh/ScaleNotice.tsx                banner for lost / back / expired                              (new)
src/web/screens/weigh/SurplusPanel.tsx               surplus and recovery actions, no table                        (new)
src/web/screens/weigh/SupervisorDialog.tsx           override and change-scale modes                               (new)
src/web/screens/weigh/ActionKeys.tsx, Readout.tsx, RecipeRail.tsx, ToleranceBar.tsx, WeighScreen.module.css  (modified)
src/web/screens/weigh/*.test.tsx                     component tests for each state                                (new / modified)
src/web/test/mock-api.ts                             + scale-options, override, reselect, failing weight           (modified)
```

### 3. APIs involved

Consumed (all existing, no change): `GET /api/scales/:id/weight` (100 ms; 503 `SCALE_UNAVAILABLE` when lost), `GET /api/scales` (2 s; READY / OFFLINE / CAL_EXPIRED), `POST /api/sessions/:id/components/:seq/override` (bolt 012), `GET …/scale-options` and `POST …/scale` (bolt 009), `POST …/retare` (bolt 010). The UI never calls `/ext/*`. The `GET …/evaluation` endpoint is **not** used: the UI judges the live reading it already polls with the same shared functions.

### 4. Technical approach

- **Pure view-model first**: `scaleCondition(history, scaleState, now)`, `overrideKeyState`, `surplusView(weight, spec)` and the extended OK reasons are plain functions (no React, no timers), unit-tested at every boundary.
- **Loss detection** uses the failure timestamp of the existing weight poll plus the scale state from the 2 s list; time comes from `Date.now()` so tests with fake timers can advance it.
- **A reading is never shown stale**: during LOST the readout shows "Scale unavailable", never the last weight.
- **Dialog safety**: modal (`role="dialog"`, focus trapped to the dialog, Escape cancels); submit disabled until badge, PIN and reason are present; a second submit while a request is in flight is ignored; PIN input `type="password"`; the PIN and reason never appear in logs or in the DOM after submit; all errors come from the server's code mapping.
- **Server stays authoritative**: the override key and the OK key only reflect what the shared rules say about the live weight; if the weight changes between the click and the server's own reading, the server's answer (for example `OVERRIDE_NOT_NEEDED`) is shown in the dialog.

### 5. Decisions to confirm (recommended option first)

| # | Question | Recommendation |
|---|----------|----------------|
| D-1 | After the scale comes back, must the operator re-tare before OK works? Story 008 says "asked to re-tare and weighing continues". | **Yes, UI-side: OK stays disabled with "Re-tare after the scale reconnected" until Re-tare succeeds.** A reconnect may have lost the zero; the server rules are unchanged (it would still judge its own reading), so this is a UI safeguard only. |
| D-2 | When is the **Supervisor override** key enabled? | **When the component is unlocked and the live reading is outside the band and above zero** (shared `isOverridable`), even if the reading is still settling; the server then refuses an unstable reading with a clear message. Disabled keys show why. |
| D-3 | Supervisor identification in the dialog | **Badge (typed, or by scanning the badge) + masked PIN**, as the reselection API already requires (domain model O-1). |
| D-4 | **Change scale** dialog contents | **Only scales that fit the requirement are listed**; fitting but unusable scales appear disabled with their state; the current scale is marked. |
| D-5 | Surplus panel visibility | **Shown whenever the live zone is OVER** (stable or settling), hidden otherwise; no compensation table, no recalculation (TD-10). |
| D-6 | Where do the new keys go? | **Supervisor override** at the right end of the action row (as in the prototype), **Change scale** next to Re-tare / Quit; neither has an F-key. |
| D-7 | Overridden components on the rail | **Marked "OVERRIDDEN" next to the actual**, so the exception is visible during the batch. |

### 6. How this will be tested

| Level | Tests |
|-------|-------|
| View-model | `scaleCondition` (ok, failures for 1.9 s vs 2.0 s, reconnect, expired, offline from the list, re-tare clears); `overrideKeyState` for every zone, zero weight, locked and busy; `surplusView` for 96.4 g, 94.6 g, kg; OK reasons order |
| Component — failure states | weight poll answering 503: after 2 s the readout shows "Scale unavailable", OK disabled, banner; scale back → "re-tare to continue", OK disabled; Re-tare → normal; CAL EXPIRED → blocked message and OK disabled; never shows the last weight as current |
| Component — surplus panel | 96.4 g → heading text exactly "Surplus +2.4 g (+2.6%) — over tolerance", OK disabled, recovery text, **no table**; 94.6 g → +0.6 g (+0.6%); back to 94.0 g → panel gone; kg component |
| Component — supervisor dialog | override key enable/disable by zone; opening shows "OVERRIDE REQUESTED — AWAITING SUPERVISOR"; PIN masked; submit disabled until all fields; success → component DONE and rail "OVERRIDDEN"; wrong PIN / empty reason / server refusals shown and nothing changes, PIN cleared; Cancel/Escape make no call; request body has the three fields and **no weight**; change scale lists only fitting scales, disables unusable ones, success shows "manual" |
| Source checks | existing no-scenario-data scan; no PIN in logs (`console.*` forbidden in the dialog) |
| Regression | all 800 tests; typecheck, lint, format, `vite build` |
| Real browser (`npm run dev`, scratch database, Chrome Browser 2) | 96.4 g surplus panel; override with BDG-0901 / 2580 (**training credentials from the seed**); wrong PIN; scale disconnect / reconnect through `_sim/disconnect`, `_sim/reconnect`; calibration expiry through `_sim/calibration`; change scale |

### Acceptance Criteria (bolt level)

- [ ] With no reading for 2 s the readout shows "Scale unavailable", OK is disabled and the strip shows OFFLINE; when the scale returns the operator is asked to re-tare and, after Re-tare, weighing continues
- [ ] CAL EXPIRED shows a message that weighing is blocked on that scale and OK is disabled
- [ ] At 96.4 g on Yellow RGB the panel shows "Surplus +2.4 g (+2.6%) — over tolerance", OK is disabled, only the approved recovery actions are shown and there is no compensation table; it disappears in tolerance or after Re-tare
- [ ] Pressing Supervisor override shows "OVERRIDE REQUESTED — AWAITING SUPERVISOR" and a PIN + reason dialog; a valid supervisor and reason mark the component DONE (overridden); a wrong PIN or empty reason shows the error and changes nothing
- [ ] Change scale offers only scales with enough capacity and the badge then shows "manual"
- [ ] The PIN is masked, never logged and cleared after each attempt; no weight is sent with an override
- [ ] All strings come from the catalogue; all tests, typecheck, lint, format and `vite build` pass; the states have been seen in a real browser

### Notes

- **Deviations from the prototype to record for Step 28**: the surplus panel has no "would become" table (Step 24 decision), the supervisor dialog and Change scale key are additions, the re-tare-after-reconnect notice is new.
- **Evidence this bolt prepares**: `STEP-24-overshoot-ui.png` (the surplus panel at 96.4 g) and screenshots of the supervisor dialog and the "Scale unavailable" state for Step 30.

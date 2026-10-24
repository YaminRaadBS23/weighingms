---
stage: plan
bolt: 011-assisted-weighing-station-ui
created: 2026-10-24T18:09:08Z
---

## Implementation Plan: assisted-weighing-station-ui — 2 · Weigh screen (bolt 11 of 17)

### Objective

Build the operator's **2 · Weigh** screen against the real WeighingMS API, reproducing the prototype's  view (workbook **Steps 20, 21, 22 (UI), 23 and 25 (UI)**): the recipe rail, the component header with the scale badge, the live readout polled from the scale API, the tolerance bar and status line, the scan prompts that unlock a component, and the action keys OK · Confirm (F1), Re-tare (F2) and Quit (F4). The screen decides nothing on its own: the weight comes from `GET /api/scales/:id/weight`, zones from the shared `evaluateZone`, and every action is an API command whose answer (the session) is what is shown. It replaces the interim placeholder of bolt 007.

### Stories and requirements implemented

| Story | Requirements | What it delivers |
|-------|--------------|------------------|
| `004-weigh-screen-layout-and-recipe-rail` | FR-6, FR-11, FR-25 (presentation) | Rail ("Recipe · Teal 4C", batch, "n of 5 components weighed", rows with swatch, name, code, target, state), header "code · LOT · CONTAINER · TARE", scale badge "Scale selected / 3 kg precision / automatic", touch a pending row to activate it |
| `005-live-readout-and-tolerance-bar` | FR-14, FR-15, FR-16, FR-17 (presentation), NFR-1, NFR-11 | Polling every 100 ms; Weighed now (52 px), Still to weigh, Target with units; bar with band, target line and caption "TOLERANCE ±0.5 g (93.5 – 94.5)" / full scale; zone colours and prototype status texts |
| `006-scan-prompts-identity-lot-container` | FR-7, FR-8, FR-9, FR-34 (presentation) | "Scan dyestuff DYE-4471" prompt while locked; scanner and typed codes routed by kind to identity, lot or container; "Wrong dyestuff" and other refusals shown |
| `007-action-keys-confirm-retare-quit` | FR-18, FR-23, FR-24 (presentation), NFR-10, NFR-12 | OK enabled only when unlocked, stable, scale ready and zone OK (reason shown otherwise); Re-tare; Quit with a confirmation; F1 / F2 / F4; keys ≥ 62 × 150 px |

Out of scope: the **surplus panel** and supervisor override (bolt 013), the exception banners for scale / scanner / OrgaTEX failures beyond the minimal "OK disabled — reason" (bolt 013), Confirm & print (bolt 016), Training Panel (bolt 016), Playwright E2E (bolt 017).

---

### 1. What will change

**UI (`src/web`):**

1. **API client** gains the calls of bolts 009–010: `scale(scaleId)` weight, `activate`, `identity`, `lot`, `container`, `confirm`, `retare`, `quit`, `session(id)`.
2. **`screens/weigh/WeighScreen.tsx`** (replaces `WeighPlaceholder`): owns the polling and the actions for the session it is given and reports every new `SessionView` upwards, so `App` always holds the latest server state.
   - **Weight polling**: `GET /api/scales/{assigned scale}/weight` every 100 ms (non-overlapping) while the active component is **unlocked**. The reading is converted exactly into the component's unit for display (a gram component can sit on the kg scale). No weight is ever computed or simulated in the UI.
   - **Session sync**: `GET /api/sessions/:id` every 2 s and `GET /api/scales` every 2 s (scale state: READY / OFFLINE / CAL EXPIRED, capacity and class for the badge), so a change made elsewhere (for example the Training Panel later) shows up.
3. **Rail** (`RecipeRail.tsx`): one button per component — swatch, name, "code · scale" (scale only where known, see decision D-1), target with unit, state text "PENDING" / "WEIGHING" / "✓ actual" (the record's actual, converted to the component's unit). Touching a PENDING row calls `activate`.
4. **Header** (`WeighHeader.tsx`): component name; "DYE-… · LOT … · CONTAINER … · TARE …" from the session's preparation (shows "—" for what is not yet settled); **scale badge** "Scale selected · 3 kg precision · automatic|manual" (or "No suitable scale").
5. **Readout** (`Readout.tsx`): three cells — Weighed now (≥ 52 px, colour by zone), Still to weigh (never negative), Target.
6. **Tolerance bar** (`ToleranceBar.tsx`) and **status line**: fill by weight / full scale (the recipe's `barMax`), band from lower to upper limit, target line, caption "TOLERANCE ±{tol} {unit} ({lo} – {hi})" and the full-scale value, `role="progressbar"` with value text. Status texts exactly as the prototype: "DISPENSE — {x} {unit} REMAINING", "WITHIN TOLERANCE — PRESS OK TO CONFIRM", "OVER TOLERANCE — SURPLUS +{x} {unit}". Colour is never the only signal.
7. **Scan prompt** (`ScanPrompt.tsx` using the existing `ScanEntry`): shown for AWAITING_IDENTITY ("Scan dyestuff DYE-4471"), AWAITING_MATERIAL ("Scan the lot" / "Scan the container") and AWAITING_TARE (the reason, with a **Retry** that submits the dyestuff again — the server retries the tare). Codes from the scanner or the keyboard arrive classified; the screen routes DYESTUFF → `identity`, LOT → `lot`, CONTAINER → `container`, anything else → "That is not a dyestuff, lot or container code". The entry stays available after unlocking so a lot or container can be replaced by scan (TD-3).
8. **Action keys** (`ActionKeys.tsx`): OK · Confirm (F1), Re-tare (F2), Quit (F4); native buttons, ≥ 62 × 150 px; F-keys are window shortcuts (default browser action suppressed) that do exactly what the button does. **OK is enabled only when** the component is unlocked, the reading is connected and **stable**, the scale state is READY, and `evaluateZone` says OK — otherwise it is disabled and the **reason** is written next to it (locked / waiting for a stable reading / scale offline / calibration expired / below / above tolerance). The server remains the authority: if it refuses, its answer is shown ("Weight is OVER: outside tolerance", …).
9. **Quit dialog** (`QuitDialog.tsx`): "Quit this batch? The weighing in progress is abandoned; confirmed components are kept." — Cancel / Quit; Escape cancels. Quit → `POST …/quit` → back to Select batch.
10. **After the last confirmation** the API answers a COMPLETED session; until the Confirm & print screen exists (bolt 016) the app shows a small **"Batch weighed"** interim notice with "Back to Select batch".
11. **Catalogue**: every new string in `i18n/messages.ts` (NFR-13), including a mapping of API error codes to operator wording (WRONG_DYESTUFF → "Wrong dyestuff", LOT_MISMATCH, LOT_NOT_FOUND, CONTAINER_UNKNOWN, CONTAINER_OUT_OF_SERVICE, ORGATEX_UNAVAILABLE, SCALE_*, TOLERANCE_VIOLATION, READING_UNSTABLE …).
12. **Styles**: CSS Modules from the prototype's `.rail`, `.weigh`, `.readout`, `.bar`, `.status-line`, `.actions`, `.key` with the existing `--hmi-*` tokens; reduced-motion respected.

**Server:** no change expected. (If the browser check shows a gap, it is recorded as a deviation.)

### 2. Files to be created / modified

```text
src/web/services/api-client.ts                        + weight, activate, identity, lot, container, confirm, retare, quit, session   (modified)
src/web/i18n/messages.ts, messages.test.ts            + weigh.* strings and error wording                                           (modified)
src/web/App.tsx                                       Weigh screen, completed notice, session updates                               (modified)
src/web/screens/weigh/WeighScreen.tsx (+ .module.css) container: polling, actions, error handling                                  (new)
src/web/screens/weigh/RecipeRail.tsx, WeighHeader.tsx, Readout.tsx, ToleranceBar.tsx, ScanPrompt.tsx,
                      ActionKeys.tsx, QuitDialog.tsx, BatchWeighedNotice.tsx   (+ .module.css)                                     (new)
src/web/screens/weigh/weigh-model.ts                  pure view-model: unit conversion, zone, can-confirm + reason, bar geometry   (new)
src/web/screens/weigh/WeighPlaceholder.*              removed
src/web/screens/weigh/*.test.tsx, weigh-model.test.ts component and model tests                                                    (new)
src/web/test/mock-api.ts                              + weight, scales, session commands, error answers                             (modified)
src/web/no-scenario-data.test.ts                      + "no weight simulation" check                                                (modified)
```

### 3. APIs involved

Consumed (all existing): `GET /api/scales/:scaleId/weight` (100 ms), `GET /api/scales` (2 s), `GET /api/sessions/:id` (2 s), `POST /api/sessions/:id/components/:seq/{activate,identity,lot,container,confirm,retare}`, `POST /api/sessions/:id/quit`, plus the scanner feed and typed entry already used by the shell. The UI never calls `/ext/*`.

### 4. Technical approach

- **One source of truth**: the `SessionView` returned by each command replaces the screen's session; the 2 s sync only corrects drift. The screen derives everything (rail, header, prompts, keys) from that view.
- **Pure view-model** (`weigh-model.ts`): unit conversion of a reading into the component unit, `evaluateZone` / `surplus` from `src/shared/domain/tolerance`, bar percentages, and `canConfirm(...)` → `{ enabled, reason }`. It has no React and no timers, so every zone and key state is unit-tested exhaustively; the components only render it.
- **Polling**: the existing non-overlapping `usePolling`; the weight poll is bound to the assigned scale and the unlocked state and stops on unmount or when the component changes. A failed read shows "—" and the reason "SCALE OFFLINE"; it never keeps showing the last weight as if it were current.
- **Stale reading guard**: a reading is ignored if it belongs to a scale that is no longer the assigned one (component switched while a request was in flight).
- **Keys**: F1 / F2 / F4 handlers on `window`, removed on unmount, ignored while a request is in flight or a dialog is open (double press cannot send two commands; the server would refuse the second anyway, ADR-6).
- **Accessibility**: native `button` elements with visible focus, `aria-live="polite"` status line, `role="progressbar"` with `aria-valuetext`, dialog with `role="alertdialog"` and focus placed on Cancel.
- **No scenario data and no simulated weight** in UI source: the existing source scan is extended to forbid timers that change the displayed weight other than the API poll.

### 5. Decisions to confirm (recommended option first)

| # | Question | Recommendation |
|---|----------|----------------|
| D-1 | The prototype shows "code · 3 kg" on **every** row, including pending ones. The API gives the scale only for the active component (and the record for done ones). | **Show the scale for the active and done rows; pending rows show the code only.** Computing a predicted scale in the UI would copy a server rule that depends on the container and could disagree with the real choice. Recorded as a deviation for the Step 28 comparison. |
| D-2 | While a component is locked (not yet unlocked) there is no meaningful weight. | **Show "—" in Weighed now and do not poll the weight until the component is unlocked.** The prompt explains what to scan. |
| D-3 | Touching a pending row mid-weighing switches component at once (prototype) and the server discards the unconfirmed weighing. | **Keep the prototype behaviour (switch at once)** — switching is the operator's choice (TD-13) and the server keeps confirmed work safe. A confirmation could be added later if FCI asks. |
| D-4 | The **Supervisor override** key of the prototype. | **Not shown in this bolt**; it appears with the supervisor dialog and the surplus panel in bolt 013. Noted for the Step 28 comparison. |
| D-5 | What follows the last confirmation until bolt 016? | **A small "Batch weighed" notice with a button back to Select batch.** The completed session is no longer "current", so a reload also lands on Select batch. |

### 6. How this will be tested

| Level | Tests |
|-------|-------|
| View-model (`weigh-model.test.ts`) | unit conversion (g reading on a kg component and the reverse); zone and status text for Yellow 0 / 50 / 84.6 / 90.0 / 93.4 / 93.5 / 94.0 / 94.5 / 94.6 / 96.4 g and Sodium Sulphate kg boundaries; still-to-weigh never negative; bar fill, band and target positions for 125 g full scale; caption text; `canConfirm` for every blocking reason and for the enabled case |
| Component — Weigh screen (Testing Library, mocked `fetch`, fake timers) | rail content and counts; touching a pending row calls `activate` and re-renders; header text and scale badge (3 kg precision automatic; 32 kg floor and kg units after Sodium Sulphate becomes active; "manual"); readout at 0.0 / 90.0 / 96.4; bar caption "TOLERANCE ±0.5 g (93.5 – 94.5)" and "125 g"; each zone's colour attribute and status text; weight poll cadence (≥ 9 requests per second at 100 ms) and its URL uses the assigned scale; polling stops after unmount; no poll while locked |
| Component — scan prompts | locked: "Scan dyestuff DYE-4471" and OK disabled; correct typed/scanned code → identity call → unlocked; wrong code → "Wrong dyestuff", still locked; lot and container scans call their endpoints; non-matching code kind → hint; AWAITING_TARE shows the reason and Retry resubmits; scanner offline → typed entry still works |
| Component — keys | OK disabled with the reason in under / near / over / unstable / offline / expired / locked; enabled at 93.5, 94.0, 94.5 stable; OK click and F1 call `confirm` once, the rail then shows "✓ 94.2" and the next component active; server refusal text shown; Re-tare click and F2; Quit opens the dialog, Cancel / Escape keep the screen, Quit calls `quit` and shows Select batch; F4 opens the dialog; a second press while busy sends nothing; CSS of keys has min-height 62 px and min-width 150 px |
| App flow | session in progress on load → Weigh screen; full Blue → … → last confirm → "Batch weighed" notice → back to Select batch |
| Source checks | no scenario data (existing); no weight simulation (no timers changing the weight, no `Math.random`) |
| Regression | all 653 tests; typecheck, lint, format; `vite build` |
| Manual / visual (real browser, `npm run dev`) | side by side with `docs/customize-weighing-station.html`: frame, rail, header, readout, bar, status line and keys at the same positions; walk Blue → Soda Ash driving weights with `curl` to `/ext/scale/_sim` (Training Panel comes in bolt 016); Network tab shows `GET /api/scales/scale-3kg/weight` at ~10 Hz and `scale-32kg` for Sodium Sulphate (Step 21); tolerance boundaries 93.4 / 93.5 / 94.5 / 94.6 (Step 22); confirmation and the transaction (Step 25); the five-component run is what `STEP-23-five-component-demo.mp4` would record |

### Acceptance Criteria (bolt level)

- [ ] Rail shows "Recipe · Teal 4C", the batch, "n of 5 components weighed" and a row per component with swatch, name, code, target and state; touching a pending row activates it through the API
- [ ] Header shows "code · LOT · CONTAINER · TARE" and the scale badge; Sodium Sulphate switches the badge to "32 kg floor" and the units to kg
- [ ] The UI polls `GET /api/scales/:id/weight` every 100 ms and shows Weighed now, Still to weigh and Target; no weight is simulated in the UI
- [ ] Bar band, target line, caption and zone colours/status texts match the prototype for under, near, ok and over
- [ ] A locked component shows "Scan dyestuff …" with OK disabled; the right code unlocks and the readout starts at 0.0; a wrong code shows "Wrong dyestuff"; typed entry works for every prompt
- [ ] OK is enabled only in tolerance with a stable, ready scale; otherwise it is disabled with the reason; OK / F1 confirms through the API and the rail shows ✓ actual with the next component active
- [ ] Re-tare / F2 resets the weight to 0.0; Quit / F4 asks for confirmation and returns to Select batch
- [ ] Keys are at least 62 × 150 px; all strings come from the catalogue
- [ ] All tests, typecheck, lint, format and `vite build` pass; the screen has been compared with the prototype in a real browser

### Notes

- **UI additions and deviations to record for Step 28**: scan prompt and typed entry on the Weigh screen, the interim "Batch weighed" notice, pending rows without a scale (D-1), no Supervisor override key yet (D-4), "—" instead of 0.0 while locked (D-2).
- Training weights are driven with `curl` against `/ext/scale/_sim/...` until the Training Panel (bolt 016).
- **Evidence this bolt prepares** (you capture them at the end if you wish): the Weigh screen (Step 20), the 3 kg → 32 kg switch and the weight calls in the Network tab (Step 21), the tolerance boundaries on screen (Step 22), the five-component run (Step 23) and the confirmation (Step 25).

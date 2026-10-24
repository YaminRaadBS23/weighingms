---
stage: implement
bolt: 011-assisted-weighing-station-ui
created: 2026-10-25
---

## Implementation Walkthrough: assisted-weighing-station-ui — the Weigh screen (bolt 11)

### Summary

The `2 · Weigh` screen is live and replaces the interim placeholder. After a batch is selected the operator sees the recipe rail, the active component with its scale, the live reading with tolerance bar, the scan prompt for locked components, and the OK / Re-tare / Quit keys. No server change was needed.

### Completed Work

- [x] `src/web/services/api-client.ts` - session, weight, activate, identity, lot, container, confirm, retare, quit calls
- [x] `src/web/screens/weigh/weigh-model.ts` - pure view-model (zone, remaining, bar geometry, status text, OK-key state, error wording) built on the shared tolerance rules
- [x] `src/web/screens/weigh/WeighScreen.tsx` - polling (weight 100 ms while unlocked; session and scales every 2 s), actions, F1/F2/F4 keys
- [x] `RecipeRail.tsx`, `WeighHeader.tsx`, `Readout.tsx`, `ToleranceBar.tsx`, `ScanPrompt.tsx`, `ActionKeys.tsx`, `QuitDialog.tsx`, `BatchWeighedNotice.tsx`, `WeighScreen.module.css`
- [x] `src/web/i18n/messages.ts` - new strings and error wording; `hasMessage` helper
- [x] `src/web/App.tsx` - mounts the screen; quit or acknowledged batch returns to Select batch
- [x] `src/web/App.test.tsx` - three assertions moved from the placeholder to the Weigh screen
- [x] Removed `WeighPlaceholder.tsx` and its CSS

### Key Decisions (D-1..D-5 as approved)

Pending rows show the code only; a locked component shows "—" and is not polled; touching a pending row switches at once; no supervisor-override key until bolt 013; after the last confirmation a "Batch weighed" notice leads back to Select batch.

Extra: an epoch counter makes a poll that began before an operator action discard its result, so a stale session or reading cannot overwrite a confirm.

### Deviations from Plan

None.

### Developer Notes

Checked in a real browser on a scratch database (typecheck, lint, format clean; 653 existing tests pass): locked state with scan prompt; one scan of DYE-1180 unlocked it using the default lot and container; reading 1150.0 g → amber near zone, "DISPENSE — 90.0 g REMAINING"; 1240.0 g → green, OK enabled; F1 confirmed and advanced to Remazol Red RB; touching Sodium Sulphate switched the badge to "32 kg floor" and the units to kg. Not yet checked: over-tolerance display, unstable reading, wrong-dyestuff text, Quit dialog — these are covered by the tests in Stage 3.

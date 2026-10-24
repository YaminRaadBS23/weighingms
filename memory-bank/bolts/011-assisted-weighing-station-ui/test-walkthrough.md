---
stage: test
bolt: 011-assisted-weighing-station-ui
created: 2026-10-25
---

## Test Walkthrough: assisted-weighing-station-ui — the Weigh screen (bolt 11)

### Summary

44 new tests (24 view-model, 20 component) plus 3 updated `App` assertions. Whole suite: **697 passed** (653 before). Typecheck, lint and format are clean.

### Test Files

- `src/web/screens/weigh/weigh-model.test.ts` — zone boundaries (84.5 / 84.6 / 93.4 / 93.5 / 94.5 / 94.6 g), unit conversion, remaining never below zero, status wording, tolerance caption, bar geometry and clamping, every reason OK can be disabled, error wording
- `src/web/screens/weigh/WeighScreen.test.tsx` — locked component (prompt, no scale polling, OK off with reason), typed code → identity call, API refusal shown in words, non-material codes refused locally, header line and scale badge, the five zones with OK enabled only inside tolerance, unstable reading, scale offline, OK sends confirm with no weight and the screen advances, refused confirm shown, Re-tare, F1/F2/F4, touching a pending row, Quit dialog (Keep / Quit / Escape), Batch weighed notice, no `/ext/` or `_sim` calls

### Acceptance Criteria

| Criterion | Evidence |
| --- | --- |
| Rail shows done / active / pending; touching a pending row activates it | `WeighScreen.test.tsx` rail and confirm tests |
| Live reading from the API only while unlocked, zone colours and status text from the shared rules | zone table test; "does not read the scale" test |
| OK enabled only unlocked ∧ stable ∧ scale ready ∧ in tolerance, reason shown | `okKeyState` tests; component tests |
| Scan prompts route dyestuff / lot / container; refusals shown | scan tests |
| Keys ≥ 62 × 150 px, F1/F2/F4 | CSS `.key`; key tests |
| Server stays authoritative (confirm carries no weight) | "OK sends confirm without a weight" |
| UI never calls `/ext` or the simulator | no-`/ext` test; existing `no-scenario-data` test |

### Verification of the tests

Three deliberate breakages (ignore stability, ignore tolerance zone, poll while locked) were each caught (2, 7 and 1 failing tests), then reverted.

### Not covered here

Pixel comparison with `docs/customize-weighing-station.html` (Step 28), over-tolerance surplus panel and exception banners (bolt 013), the full operator run in Playwright (bolt 017). Sizes of the keys are checked by CSS, not measured in a browser test.

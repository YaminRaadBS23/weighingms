---
id: 011-assisted-weighing-station-ui
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: in-progress
stories:
  - 004-weigh-screen-layout-and-recipe-rail
  - 005-live-readout-and-tolerance-bar
  - 006-scan-prompts-identity-lot-container
  - 007-action-keys-confirm-retare-quit
created: 2026-10-15T12:31:01Z
started: 2026-10-24T18:09:08Z
completed: null
current_stage: implement
stages_completed: []

requires_bolts: [007-assisted-weighing-station-ui, 010-weighing-station]
enables_bolts: [013-assisted-weighing-station-ui, 016-assisted-weighing-station-ui]
requires_units: [004-weighing-station]
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 3
---

# Bolt: 011-assisted-weighing-station-ui

## Overview

Bolt 11 of 17 for intent `001-assisted-weighing-station` · Unit `006-assisted-weighing-station-ui` · Simple Construction Bolt.

## Objective

Build the 2 · Weigh screen: recipe rail, component header, scale badge, live readout with 10 Hz polling, tolerance bar, status line, scan prompts and action keys with F-keys.

## Stories Included

- **004-weigh-screen-layout-and-recipe-rail**: 2 · Weigh screen layout and recipe rail (Must)
- **005-live-readout-and-tolerance-bar**: Live readout and tolerance bar (Must)
- **006-scan-prompts-identity-lot-container**: Scan prompts for dyestuff, lot and container (Must)
- **007-action-keys-confirm-retare-quit**: Action keys: OK, Re-tare, Quit (+ F-keys) (Must)

## Bolt Type

**Type**: Simple Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- [ ] **1. Plan**: Pending → `implementation-plan.md`
- [ ] **2. Implement**: Pending → source code + `implementation-walkthrough.md`
- [ ] **3. Test**: Pending → tests + `test-walkthrough.md`

## Expected Outcome

Weigh screen matching the prototype, driven by `/api/scales/:id/weight` and session APIs; scale switch to 32 kg/kg for Sodium Sulphate; OK enabled only in tolerance; Re-tare, Quit.

## Test Expectations

Component tests per zone and key state; keyboard tests; manual comparison with prototype (Steps 20–22 evidence).

## Dependencies

### Requires
- `007-assisted-weighing-station-ui`
- `010-weighing-station`

### Requires Units (cross-unit)
- `004-weighing-station`

### Enables
- `013-assisted-weighing-station-ui`
- `016-assisted-weighing-station-ui`

## Workbook Steps Served

Steps 20, 21, 22, 23, 25

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

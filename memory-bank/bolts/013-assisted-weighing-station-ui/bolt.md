---
id: 013-assisted-weighing-station-ui
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: in-progress
stories:
  - 008-scale-and-device-failure-states
  - 009-supervisor-dialog
  - 010-surplus-panel
created: 2026-10-15T12:31:01Z
started: 2026-10-26T07:00:00.000Z
completed: null
current_stage: plan
stages_completed: []

requires_bolts: [011-assisted-weighing-station-ui, 012-weighing-station]
enables_bolts: [017-assisted-weighing-station-ui]
requires_units: [004-weighing-station]
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 3
---

# Bolt: 013-assisted-weighing-station-ui

## Overview

Bolt 13 of 17 for intent `001-assisted-weighing-station` · Unit `006-assisted-weighing-station-ui` · Simple Construction Bolt.

## Objective

Add the Weigh screen's exception states: scale/device failure states, the supervisor dialog (override, reselection) and the surplus panel per the Step 24 rule.

## Stories Included

- **008-scale-and-device-failure-states**: Scale and device failure states (Must)
- **009-supervisor-dialog**: Supervisor dialog for override and scale reselection (Must)
- **010-surplus-panel**: Surplus panel (Must)

## Bolt Type

**Type**: Simple Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- [ ] **1. Plan**: Pending → `implementation-plan.md`
- [ ] **2. Implement**: Pending → source code + `implementation-walkthrough.md`
- [ ] **3. Test**: Pending → tests + `test-walkthrough.md`

## Expected Outcome

Scale unavailable / CAL EXPIRED states with OK disabled; PIN + reason dialog; "OVERRIDE REQUESTED — AWAITING SUPERVISOR"; surplus panel "Surplus +2.4 g (+2.6%) — over tolerance" with approved actions only.

## Test Expectations

Component tests for each state; Step 24 UI evidence.

## Dependencies

### Requires
- `011-assisted-weighing-station-ui`
- `012-weighing-station`

### Requires Units (cross-unit)
- `004-weighing-station`

### Enables
- `017-assisted-weighing-station-ui`

## Workbook Steps Served

Steps 24, 30

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

---
id: 013-assisted-weighing-station-ui
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: complete
stories:
  - 008-scale-and-device-failure-states
  - 009-supervisor-dialog
  - 010-surplus-panel
created: 2026-10-15T12:31:01.000Z
started: 2026-10-26T07:00:00.000Z
completed: "2026-10-26T07:36:48Z"
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-10-26T07:05:00.000Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-10-26T07:25:00.000Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: "2026-10-26T07:36:48Z"
    artifact: test-walkthrough.md
requires_bolts:
  - 011-assisted-weighing-station-ui
  - 012-weighing-station
enables_bolts:
  - 017-assisted-weighing-station-ui
requires_units:
  - 004-weighing-station
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

- [x] **1. Plan**: Done → `implementation-plan.md`
- [x] **2. Implement**: Done → source code + `implementation-walkthrough.md`
- [x] **3. Test**: Done → tests + `test-walkthrough.md`

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

- [x] All stories implemented
- [x] All acceptance criteria met
- [x] Tests passing
- [x] Human review complete at each stage checkpoint

## Notes

—

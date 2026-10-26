---
id: 016-assisted-weighing-station-ui
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: in-progress
stories:
  - 011-confirm-and-print-screen
  - 012-training-panel
created: 2026-10-15T12:31:01Z
started: 2026-10-26T14:00:00.000Z
completed: null
current_stage: plan
stages_completed: []

requires_bolts: [011-assisted-weighing-station-ui, 015-completion-and-ticketing]
enables_bolts: [017-assisted-weighing-station-ui]
requires_units: [005-completion-and-ticketing]
blocks: true

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 3
---

# Bolt: 016-assisted-weighing-station-ui

## Overview

Bolt 16 of 17 for intent `001-assisted-weighing-station` · Unit `006-assisted-weighing-station-ui` · Simple Construction Bolt.

## Objective

Build the 3 · Confirm & print screen and the separate Training Panel.

## Stories Included

- **011-confirm-and-print-screen**: 3 · Confirm & print screen (Must)
- **012-training-panel**: Training Panel (Must)

## Bolt Type

**Type**: Simple Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- [ ] **1. Plan**: Written, awaiting approval → `implementation-plan.md`
- [ ] **2. Implement**: Pending → source code + `implementation-walkthrough.md`
- [ ] **3. Test**: Pending → tests + `test-walkthrough.md`

## Expected Outcome

Completion summary, Written to OrgaTEX CONFIRMED/PENDING + Retry, Print ticket F1 with preview, printer error + Retry, Reprint, Next batch F3; Training Panel for all `_sim` controls.

## Test Expectations

Component tests; manual comparison with prototype screen 3 (Step 28 evidence).

## Dependencies

### Requires
- `011-assisted-weighing-station-ui`
- `015-completion-and-ticketing`

### Requires Units (cross-unit)
- `005-completion-and-ticketing`

### Enables
- `017-assisted-weighing-station-ui`

## Workbook Steps Served

Steps 26, 27, 28

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

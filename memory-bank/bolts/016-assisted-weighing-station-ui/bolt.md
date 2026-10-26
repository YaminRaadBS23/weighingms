---
id: 016-assisted-weighing-station-ui
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: complete
stories:
  - 011-confirm-and-print-screen
  - 012-training-panel
created: 2026-10-15T12:31:01.000Z
started: 2026-10-26T14:00:00.000Z
completed: "2026-10-26T09:42:54Z"
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-10-26T08:10:00.000Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-10-26T09:50:00.000Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: "2026-10-26T09:42:54Z"
    artifact: test-walkthrough.md
requires_bolts:
  - 011-assisted-weighing-station-ui
  - 015-completion-and-ticketing
enables_bolts:
  - 017-assisted-weighing-station-ui
requires_units:
  - 005-completion-and-ticketing
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

- [x] **1. Plan**: Approved 2026-10-26 → `implementation-plan.md`
- [x] **2. Implement**: Approved 2026-10-26 → source code + `implementation-walkthrough.md`
- [x] **3. Test**: Approved 2026-10-26 → tests + `test-walkthrough.md`

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

- [x] All stories implemented
- [x] All acceptance criteria met
- [x] Tests passing
- [x] Human review complete at each stage checkpoint

## Notes

—

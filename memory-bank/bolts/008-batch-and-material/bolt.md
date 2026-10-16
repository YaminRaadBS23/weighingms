---
id: 008-batch-and-material
unit: 003-batch-and-material
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: in-progress
stories:
  - 005-validate-dyestuff-lot
  - 006-container-master-and-validation
created: 2026-10-15T12:31:01Z
started: 2026-10-16T12:52:42Z
completed: null
current_stage: implement
stages_completed:
  - name: plan
    completed: 2026-10-16T12:53:51Z
    artifact: implementation-plan.md

requires_bolts: [005-batch-and-material]
enables_bolts: [009-weighing-station]
requires_units: []
blocks: false

complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 008-batch-and-material

## Overview

Bolt 8 of 17 for intent `001-assisted-weighing-station` · Unit `003-batch-and-material` · Simple Construction Bolt.

## Objective

Add dyestuff lot validation and the container master with default container per component.

## Stories Included

- **005-validate-dyestuff-lot**: Validate a dyestuff lot (Must)
- **006-container-master-and-validation**: Container master and validation (Must)

## Bolt Type

**Type**: Simple Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- ✅ **1. Plan**: Complete (approved) → `implementation-plan.md`
- ⏳ **2. Implement**: In Progress → source code + `implementation-walkthrough.md`
- [ ] **3. Test**: Pending → tests + `test-walkthrough.md`

## Expected Outcome

Lot validation via OrgatexPort (LOT_MISMATCH / LOT_NOT_FOUND); container master C-09, C-11, C-12, D-03, D-05 with tares and default mapping; CONTAINER_UNKNOWN / OUT_OF_SERVICE.

## Test Expectations

Unit + API tests; seed test.

## Dependencies

### Requires
- `005-batch-and-material`

### Requires Units (cross-unit)
- None

### Enables
- `009-weighing-station`

## Workbook Steps Served

Steps 20

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

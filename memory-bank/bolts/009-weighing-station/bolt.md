---
id: 009-weighing-station
unit: 004-weighing-station
intent: 001-assisted-weighing-station
type: ddd-construction-bolt
status: in-progress
stories:
  - 004-verify-dyestuff-identity-and-unlock
  - 005-automatic-scale-selection
  - 006-supervisor-scale-reselection
  - 007-calibration-enforcement
created: 2026-10-15T12:31:01Z
started: 2026-10-23T15:14:37Z
completed: null
current_stage: adr
stages_completed:
  - name: model
    completed: 2026-10-23T15:25:23Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-24T11:28:06Z
    artifact: ddd-02-technical-design.md

requires_bolts: [003-device-integration, 006-weighing-station, 008-batch-and-material]
enables_bolts: [010-weighing-station]
requires_units: [002-device-integration, 003-batch-and-material]
blocks: false

complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 009-weighing-station

## Overview

Bolt 9 of 17 for intent `001-assisted-weighing-station` · Unit `004-weighing-station` · DDD Construction Bolt.

## Objective

Model and implement component preparation: automatic scale selection, calibration enforcement, supervisor reselection, and identity/lot/container verification with automatic tare.

## Stories Included

- **004-verify-dyestuff-identity-and-unlock**: Verify dyestuff identity, lot and container, then unlock weighing (Must)
- **005-automatic-scale-selection**: Automatic scale selection (Must)
- **006-supervisor-scale-reselection**: Supervisor scale reselection (Should)
- **007-calibration-enforcement**: Block weighing on an expired scale (Should)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- ✅ **1. Domain Model**: Complete (approved) → `ddd-01-domain-model.md`
- ✅ **2. Technical Design**: Complete (approved) → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis** (optional): Pending → `adr-{n}-{slug}.md`
- [ ] **4. Implement**: Pending → source code
- [ ] **5. Test**: Pending → tests + `ddd-03-test-report.md`

## Expected Outcome

`selectScale` pure rule (3 kg vs 32 kg, inclusive capacity boundary), identity/lot/container endpoints that unlock weighing and tare the scale, SCALE_RESELECT with supervisor PIN, CAL_EXPIRED blocking.

## Test Expectations

Unit tests for `selectScale` incl. boundaries and unavailable scales; aggregate/API tests with fake ports for unlock, wrong dyestuff, reselection authorisation.

## Dependencies

### Requires
- `003-device-integration`
- `006-weighing-station`
- `008-batch-and-material`

### Requires Units (cross-unit)
- `002-device-integration`
- `003-batch-and-material`

### Enables
- `010-weighing-station`

## Workbook Steps Served

Steps 20, 21

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

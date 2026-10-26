---
id: 012-weighing-station
unit: 004-weighing-station
intent: 001-assisted-weighing-station
type: ddd-construction-bolt
status: complete
stories:
  - 013-supervisor-override
  - 014-overshoot-detection-and-recovery
created: 2026-10-15T12:31:01.000Z
started: 2026-10-25T18:00:00.000Z
completed: "2026-10-26T06:43:28Z"
current_stage: null
stages_completed:
  - name: model
    completed: 2026-10-26T09:00:00.000Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-26T09:20:00.000Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-26T09:45:00.000Z
    artifact: adr-9-override-facts-live-on-the-immutable-record.md
  - name: implement
    completed: 2026-10-26T10:30:00.000Z
    artifact: ddd-implementation-walkthrough.md
  - name: test
    completed: "2026-10-26T06:43:28Z"
    artifact: ddd-03-test-report.md
requires_bolts:
  - 010-weighing-station
enables_bolts:
  - 013-assisted-weighing-station-ui
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 3
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 012-weighing-station

## Overview

Bolt 12 of 17 for intent `001-assisted-weighing-station` · Unit `004-weighing-station` · DDD Construction Bolt.

## Objective

Implement the Step 24 overshoot rule (decided 2026-10-26, Option A: block, recover, override, no compensation) and supervisor override.

## Stories Included

- **013-supervisor-override**: Supervisor override of an out-of-tolerance weight (Must)
- **014-overshoot-detection-and-recovery**: Overshoot detection and recovery (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [x] **1. Domain Model**: Done → `ddd-01-domain-model.md`
- [x] **2. Technical Design**: Done → `ddd-02-technical-design.md`
- [x] **3. ADR Analysis** (optional): Done → `adr-{n}-{slug}.md`
- [x] **4. Implement**: Done → source code
- [x] **5. Test**: Done → tests + `ddd-03-test-report.md`

## Expected Outcome

Recorded overshoot decision (`STEP-24-overshoot-decision.md` + TD-10 update); override with PIN + mandatory reason (OVERRIDDEN record, Override, audit); recovery behaviour exactly as decided.

## Test Expectations

Domain tests for override authorisation and for the approved overshoot rule (`STEP-24-overshoot-test`).

## Dependencies

### Requires
- `010-weighing-station`

### Requires Units (cross-unit)
- None

### Enables
- `013-assisted-weighing-station-ui`

## Workbook Steps Served

Steps 24

## Success Criteria

- [x] All stories implemented
- [x] All acceptance criteria met
- [x] Tests passing
- [x] Human review complete at each stage checkpoint

## Notes

**Step 24 decided (2026-10-26, TD-10, `STEP-24-overshoot-decision.md`):** an over-dosed component stays unconfirmed; recovery is removing the excess or Re-tare; a supervisor may override any out-of-tolerance weight > 0 (PIN + mandatory reason, record OVERRIDDEN, surplus kept, OVERRIDE audit); surplus from the target; no recipe recalculation.

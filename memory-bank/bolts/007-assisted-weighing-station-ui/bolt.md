---
id: 007-assisted-weighing-station-ui
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: complete
stories:
  - 001-app-shell-top-bar-and-status-strip
  - 002-sign-in-screen
  - 003-select-batch-screen
created: 2026-10-15T12:31:01.000Z
started: 2026-10-16T09:10:41.000Z
completed: "2026-10-16T12:52:09Z"
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-10-16T09:17:06.000Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-10-16T12:49:09.000Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: 2026-10-16T12:52:09Z
    artifact: test-walkthrough.md
requires_bolts:
  - 002-orgatex-integration
  - 003-device-integration
  - 004-device-integration
  - 005-batch-and-material
  - 006-weighing-station
enables_bolts:
  - 011-assisted-weighing-station-ui
requires_units:
  - 001-orgatex-integration
  - 002-device-integration
  - 003-batch-and-material
  - 004-weighing-station
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 3
---

# Bolt: 007-assisted-weighing-station-ui

## Overview

Bolt 7 of 17 for intent `001-assisted-weighing-station` · Unit `006-assisted-weighing-station-ui` · Simple Construction Bolt.

## Objective

Build the UI shell (tokens, top bar, status strip), the sign-in screen and the 1 · Select batch screen against the real APIs.

## Stories Included

- **001-app-shell-top-bar-and-status-strip**: App shell, top bar and status strip (Must)
- **002-sign-in-screen**: Sign-in screen (Must)
- **003-select-batch-screen**: 1 · Select batch screen (Must)

## Bolt Type

**Type**: Simple Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- ✅ **1. Plan**: Complete (approved) → `implementation-plan.md`
- ✅ **2. Implement**: Complete (approved) → source code + `implementation-walkthrough.md`
- ✅ **3. Test**: Complete (approved, 302/302 tests) → tests + `test-walkthrough.md`

## Expected Outcome

Dark HMI frame, live status strip, sign-in, batch queue from `GET /api/batches`, selection calling `/api/batches/B-24187` then `/recipe`, not-released and OrgaTEX-unavailable states.

## Test Expectations

Component tests with mocked API; manual Network-tab check (Step 19 evidence); no scenario data in UI source (grep check).

## Dependencies

### Requires
- `002-orgatex-integration`
- `003-device-integration`
- `004-device-integration`
- `005-batch-and-material`
- `006-weighing-station`

### Requires Units (cross-unit)
- `001-orgatex-integration`
- `002-device-integration`
- `003-batch-and-material`
- `004-weighing-station`

### Enables
- `011-assisted-weighing-station-ui`

## Workbook Steps Served

Steps 19

## Success Criteria

- [x] All stories implemented
- [x] All acceptance criteria met
- [x] Tests passing
- [x] Human review complete at each stage checkpoint

## Notes

—

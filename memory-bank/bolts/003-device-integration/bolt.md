---
id: 003-device-integration
unit: 002-device-integration
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: in-progress
stories:
  - 001-dummy-scales-and-scale-api
  - 002-live-net-weight-reading
  - 003-tare-command
  - 004-scale-simulation-controls
  - 005-scale-disconnection-detection
created: 2026-10-15T12:31:01Z
started: 2026-10-15T12:57:57Z
completed: null
current_stage: plan
stages_completed: []

requires_bolts: [001-orgatex-integration]
enables_bolts: [007-assisted-weighing-station-ui, 009-weighing-station]
requires_units: [001-orgatex-integration]
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 003-device-integration

## Overview

Bolt 3 of 17 for intent `001-assisted-weighing-station` · Unit `002-device-integration` · Simple Construction Bolt.

## Objective

Build the Dummy Scale and ScalePort with the `/api/scales` facade, live net weight, stability, tare, simulation controls and disconnection detection.

## Stories Included

- **001-dummy-scales-and-scale-api**: Dummy scales and scale listing/status API (Must)
- **002-live-net-weight-reading**: Live net weight with stability (Must)
- **003-tare-command**: Tare the scale with the container in place (Must)
- **004-scale-simulation-controls**: Scale simulation controls (Must)
- **005-scale-disconnection-detection**: Detect scale disconnection (Must)

## Bolt Type

**Type**: Simple Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- ⏳ **1. Plan**: In Progress → `implementation-plan.md`
- [ ] **2. Implement**: Pending → source code + `implementation-walkthrough.md`
- [ ] **3. Test**: Pending → tests + `test-walkthrough.md`

## Expected Outcome

`GET /api/scales`, `/api/scales/:id/status`, `/api/scales/:id/weight` (10 Hz capable), `POST /api/scales/:id/tare`; `/ext/scale/_sim` set weight / dispense / overshoot / container / calibration / disconnect.

## Test Expectations

Contract tests per endpoint; stability timing (fake clock); 10 Hz polling throughput; disconnection ≤ 2 s; exact set-weight values (93.4 … 94.6 g).

## Dependencies

### Requires
- `001-orgatex-integration`

### Requires Units (cross-unit)
- `001-orgatex-integration`

### Enables
- `007-assisted-weighing-station-ui`
- `009-weighing-station`

## Workbook Steps Served

Steps 16, 18, 21

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

---
id: 004-device-integration
unit: 002-device-integration
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: in-progress
stories:
  - 006-dummy-scanner-and-scan-delivery
  - 007-dummy-printer
created: 2026-10-15T12:31:01Z
started: 2026-10-15T13:07:30Z
completed: null
current_stage: implement
stages_completed:
  - name: plan
    completed: 2026-10-15T13:08:32Z
    artifact: implementation-plan.md

requires_bolts: [001-orgatex-integration]
enables_bolts: [007-assisted-weighing-station-ui, 015-completion-and-ticketing]
requires_units: [001-orgatex-integration]
blocks: false

complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 004-device-integration

## Overview

Bolt 4 of 17 for intent `001-assisted-weighing-station` · Unit `002-device-integration` · Simple Construction Bolt.

## Objective

Build the Dummy Scanner and Dummy Printer with their ports and status endpoints.

## Stories Included

- **006-dummy-scanner-and-scan-delivery**: Dummy scanner and scan delivery (Must)
- **007-dummy-printer**: Dummy ticket printer (Must)

## Bolt Type

**Type**: Simple Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- ✅ **1. Plan**: Complete (approved) → `implementation-plan.md`
- ⏳ **2. Implement**: In Progress → source code + `implementation-walkthrough.md`
- [ ] **3. Test**: Pending → tests + `test-walkthrough.md`

## Expected Outcome

Scan injection and delivered-once scan feed, scanner status; printer print/preview/jobs and READY/OFFLINE/OUT_OF_PAPER states; `PrinterPort`, `ScannerPort`.

## Test Expectations

Contract tests for scan kinds, delivery semantics, printer states and `PRINTER_UNAVAILABLE`.

## Dependencies

### Requires
- `001-orgatex-integration`

### Requires Units (cross-unit)
- `001-orgatex-integration`

### Enables
- `007-assisted-weighing-station-ui`
- `015-completion-and-ticketing`

## Workbook Steps Served

Steps 16, 18

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

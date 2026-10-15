---
id: 002-orgatex-integration
unit: 001-orgatex-integration
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: in-progress
stories:
  - 004-dummy-orgatex-accepts-consumption-idempotently
  - 005-orgatex-outage-simulation
created: 2026-10-15T12:31:01Z
started: 2026-10-15T12:48:40Z
completed: null
current_stage: implement
stages_completed:
  - name: plan
    completed: 2026-10-15T12:50:37Z
    artifact: implementation-plan.md

requires_bolts: [001-orgatex-integration]
enables_bolts: [005-batch-and-material, 007-assisted-weighing-station-ui, 014-completion-and-ticketing]
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 002-orgatex-integration

## Overview

Bolt 2 of 17 for intent `001-assisted-weighing-station` · Unit `001-orgatex-integration` · Simple Construction Bolt.

## Objective

Complete Dummy OrgaTEX with idempotent consumption posting, batch status and outage simulation.

## Stories Included

- **004-dummy-orgatex-accepts-consumption-idempotently**: Consumption posting and batch status, idempotent (Must)
- **005-orgatex-outage-simulation**: Simulate OrgaTEX outage and reset scenario (Must)

## Bolt Type

**Type**: Simple Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- ✅ **1. Plan**: Complete (approved) → `implementation-plan.md`
- ⏳ **2. Implement**: In Progress → source code + `implementation-walkthrough.md`
- [ ] **3. Test**: Pending → tests + `test-walkthrough.md`

## Expected Outcome

`POST /ext/orgatex/batches/:id/consumption` with Idempotency-Key, status transitions, stored postings readable, `_sim` offline/online/reset (dev/test only).

## Test Expectations

Contract tests: idempotent repeat, conflicting body, status transitions, offline gating, production gating of `_sim`.

## Dependencies

### Requires
- `001-orgatex-integration`

### Requires Units (cross-unit)
- None

### Enables
- `005-batch-and-material`
- `007-assisted-weighing-station-ui`
- `014-completion-and-ticketing`

## Workbook Steps Served

Steps 16, 18

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

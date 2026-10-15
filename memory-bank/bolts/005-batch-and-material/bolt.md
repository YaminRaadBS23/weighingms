---
id: 005-batch-and-material
unit: 003-batch-and-material
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: planned
stories:
  - 001-station-batch-queue
  - 002-select-batch-with-release-check
  - 003-load-recipe-for-batch
  - 004-orgatex-unavailable-on-load
created: 2026-10-15T12:31:01Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts: [001-orgatex-integration, 002-orgatex-integration]
enables_bolts: [006-weighing-station, 007-assisted-weighing-station-ui, 008-batch-and-material]
requires_units: [001-orgatex-integration]
blocks: true

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 005-batch-and-material

## Overview

Bolt 5 of 17 for intent `001-assisted-weighing-station` · Unit `003-batch-and-material` · Simple Construction Bolt.

## Objective

Expose the station batch queue, batch selection with release check and recipe loading through the WeighingMS facade, with defined OrgaTEX-unavailable behaviour.

## Stories Included

- **001-station-batch-queue**: Station batch queue (Must)
- **002-select-batch-with-release-check**: Select a batch by ID with release check (Must)
- **003-load-recipe-for-batch**: Load the recipe for a batch (Must)
- **004-orgatex-unavailable-on-load**: Defined behaviour when OrgaTEX is unavailable on load (Must)

## Bolt Type

**Type**: Simple Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- [ ] **1. Plan**: Pending → `implementation-plan.md`
- [ ] **2. Implement**: Pending → source code + `implementation-walkthrough.md`
- [ ] **3. Test**: Pending → tests + `test-walkthrough.md`

## Expected Outcome

`GET /api/batches`, `GET /api/batches/:id`, `GET /api/batches/:id/recipe` returning exact seed values; 409 BATCH_NOT_RELEASED; 503 ORGATEX_UNAVAILABLE (never an empty queue).

## Test Expectations

API tests with fake OrgatexPort and with the in-process dummy (online/offline); `curl` checks for Step 18 (`STEP-18-api-tests.txt`).

## Dependencies

### Requires
- `001-orgatex-integration`
- `002-orgatex-integration`

### Requires Units (cross-unit)
- `001-orgatex-integration`

### Enables
- `006-weighing-station`
- `007-assisted-weighing-station-ui`
- `008-batch-and-material`

## Workbook Steps Served

Steps 18, 19

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

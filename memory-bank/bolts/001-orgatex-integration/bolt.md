---
id: 001-orgatex-integration
unit: 001-orgatex-integration
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: planned
stories:
  - 001-project-scaffold
  - 002-dummy-orgatex-serves-batches-and-recipes
  - 003-orgatex-port-read-operations
created: 2026-10-15T12:31:01Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts: []
enables_bolts: [002-orgatex-integration, 003-device-integration, 004-device-integration, 005-batch-and-material]
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 001-orgatex-integration

## Overview

Bolt 1 of 17 for intent `001-assisted-weighing-station` · Unit `001-orgatex-integration` · Simple Construction Bolt.

## Objective

Create the shared project scaffold and the read side of Dummy OrgaTEX with OrgatexPort.

## Stories Included

- **001-project-scaffold**: Runnable project scaffold (Must)
- **002-dummy-orgatex-serves-batches-and-recipes**: Dummy OrgaTEX serves batches, recipes and lots (Must)
- **003-orgatex-port-read-operations**: OrgatexPort read operations via adapter (Must)

## Bolt Type

**Type**: Simple Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- [ ] **1. Plan**: Pending → `implementation-plan.md`
- [ ] **2. Implement**: Pending → source code + `implementation-walkthrough.md`
- [ ] **3. Test**: Pending → tests + `test-walkthrough.md`

## Expected Outcome

Runnable app (`npm run dev`, `npm test`), `/api/health`, `/ext/orgatex` serving the four seeded batches, the Teal 4C recipe and lots; `OrgatexPort` read operations with error translation; seed JSON (Step 17 evidence).

## Test Expectations

Smoke test of app factory; decimal helper tests; contract tests for every `/ext/orgatex` read endpoint; adapter tests incl. 404 and unreachable.

## Dependencies

### Requires
- None (first bolt)

### Requires Units (cross-unit)
- None

### Enables
- `002-orgatex-integration`
- `003-device-integration`
- `004-device-integration`
- `005-batch-and-material`

## Workbook Steps Served

Steps 16, 17, 18

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

First bolt of the project: establishes conventions used by all later bolts.

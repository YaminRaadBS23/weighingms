---
id: 014-completion-and-ticketing
unit: 005-completion-and-ticketing
intent: 001-assisted-weighing-station
type: ddd-construction-bolt
status: in-progress
stories:
  - 001-post-consumption-on-completion
  - 002-hold-and-retry-write-back
  - 003-completion-summary
created: 2026-10-15T12:31:01Z
started: 2026-10-26T08:00:00Z
completed: null
current_stage: test
stages_completed: []

requires_bolts: [002-orgatex-integration, 010-weighing-station]
enables_bolts: [015-completion-and-ticketing]
requires_units: [001-orgatex-integration, 004-weighing-station]
blocks: true

complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 3
  testing_scope: 2
---

# Bolt: 014-completion-and-ticketing

## Overview

Bolt 14 of 17 for intent `001-assisted-weighing-station` · Unit `005-completion-and-ticketing` · DDD Construction Bolt.

## Objective

Model and implement the consumption write-back (idempotent, CONFIRMED/PENDING, retry, pending count) and the completion summary.

## Stories Included

- **001-post-consumption-on-completion**: Post actual consumption to OrgaTEX on completion (Must)
- **002-hold-and-retry-write-back**: Hold write-back as PENDING and retry (Must)
- **003-completion-summary**: Completion summary (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. Domain Model**: Pending → `ddd-01-domain-model.md`
- [ ] **2. Technical Design**: Pending → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis** (optional): Pending → `adr-{n}-{slug}.md`
- [ ] **4. Implement**: Pending → source code
- [ ] **5. Test**: Pending → tests + `ddd-03-test-report.md`

## Expected Outcome

`POST /api/batches/B-24187/consumption` → 200 and one stored posting in Dummy OrgaTEX; PENDING + retry when offline; `GET /api/batches/:id/summary` (5 of 5, YES, 35.322 kg, elapsed, operator).

## Test Expectations

Write-back state-machine tests; idempotency tests; API tests with OrgaTEX offline/online (Step 26 evidence: request, response, stored data).

## Dependencies

### Requires
- `002-orgatex-integration`
- `010-weighing-station`

### Requires Units (cross-unit)
- `001-orgatex-integration`
- `004-weighing-station`

### Enables
- `015-completion-and-ticketing`

## Workbook Steps Served

Steps 26, 30

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

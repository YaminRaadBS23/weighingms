---
id: 006-weighing-station
unit: 004-weighing-station
intent: 001-assisted-weighing-station
type: ddd-construction-bolt
status: in-progress
stories:
  - 001-operator-sign-in
  - 002-start-or-resume-weighing-session
  - 003-component-states-and-activation
  - 015-audit-trail
created: 2026-10-15T12:31:01Z
started: 2026-10-16T08:32:35Z
completed: null
current_stage: implement
stages_completed:
  - name: model
    completed: 2026-10-16T08:34:29Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-16T08:37:23Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-16T08:42:26Z
    artifact: adr-1-audit-immutability-database-triggers.md, adr-2-station-level-operator-sign-in.md, adr-3-one-batch-in-progress-per-station.md

requires_bolts: [005-batch-and-material]
enables_bolts: [007-assisted-weighing-station-ui, 009-weighing-station]
requires_units: [003-batch-and-material]
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 006-weighing-station

## Overview

Bolt 6 of 17 for intent `001-assisted-weighing-station` · Unit `004-weighing-station` · DDD Construction Bolt.

## Objective

Model and implement operator sign-in, the WeighingSession aggregate (start/resume, component states, activation) and the immutable audit trail.

## Stories Included

- **001-operator-sign-in**: Operator sign-in by badge (Must)
- **002-start-or-resume-weighing-session**: Start or resume a weighing session (Must)
- **003-component-states-and-activation**: Component states and activation (Must)
- **015-audit-trail**: Immutable audit trail (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- ✅ **1. Domain Model**: Complete (approved) → `ddd-01-domain-model.md`
- ✅ **2. Technical Design**: Complete (approved) → `ddd-02-technical-design.md`
- ✅ **3. ADR Analysis** (optional): Complete (ADR-1, ADR-2, ADR-3 approved) → `adr-{n}-{slug}.md`
- ⏳ **4. Implement**: In Progress → source code
- [ ] **5. Test**: Pending → tests + `ddd-03-test-report.md`

## Expected Outcome

`POST /api/operators/sign-in`, `POST /api/sessions`, `GET /api/sessions/current`, component activation, `GET /api/sessions/:id/audit`; `weighingms.db` schema; operator/supervisor seed; batch → WEIGHING.

## Test Expectations

Aggregate invariant tests (exactly one ACTIVE, DONE immutable); API tests incl. resume after app restart; audit append-only.

## Dependencies

### Requires
- `005-batch-and-material`

### Requires Units (cross-unit)
- `003-batch-and-material`

### Enables
- `007-assisted-weighing-station-ui`
- `009-weighing-station`

## Workbook Steps Served

Steps 19, 23

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

**Carried over from bolt 005:** story `003-batch-and-material/004-orgatex-unavailable-on-load` criterion — *a session already in progress keeps working when OrgaTEX goes offline (recipe held by the session)* — must be tested in this bolt.

DDD stages: domain model → technical design → ADR (session persistence) → implement → test.

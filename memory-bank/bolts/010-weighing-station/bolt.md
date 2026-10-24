---
id: 010-weighing-station
unit: 004-weighing-station
intent: 001-assisted-weighing-station
type: ddd-construction-bolt
status: in-progress
stories:
  - 008-tolerance-evaluation-rules
  - 009-confirm-weighing-in-tolerance
  - 010-component-progression-and-batch-completion
  - 011-re-tare
  - 012-quit-and-resume
created: 2026-10-15T12:31:01Z
started: 2026-10-24T17:45:55Z
completed: null
current_stage: test
stages_completed:
  - name: model
    completed: 2026-10-24T17:48:03Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-24T17:55:08Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-24T17:55:40Z
    artifact: adr-7-server-measures-confirmation-has-no-weight.md
  - name: implement
    completed: 2026-10-24T18:00:46Z
    artifact: ddd-implementation-walkthrough.md

requires_bolts: [009-weighing-station]
enables_bolts: [011-assisted-weighing-station-ui, 012-weighing-station, 014-completion-and-ticketing]
requires_units: []
blocks: false

complexity:
  avg_complexity: 3
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 010-weighing-station

## Overview

Bolt 10 of 17 for intent `001-assisted-weighing-station` · Unit `004-weighing-station` · DDD Construction Bolt.

## Objective

Model and implement tolerance rules, server-authoritative confirmation with immutable records, component progression, batch completion guard, re-tare and quit/resume.

## Stories Included

- **008-tolerance-evaluation-rules**: Tolerance evaluation and surplus rules (Must)
- **009-confirm-weighing-in-tolerance**: Confirm a weighing inside tolerance (Must)
- **010-component-progression-and-batch-completion**: Component progression and batch completion (Must)
- **011-re-tare**: Re-tare the active component (Must)
- **012-quit-and-resume**: Quit safely and resume later (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- ✅ **1. Domain Model**: Complete (approved) → `ddd-01-domain-model.md`
- ✅ **2. Technical Design**: Complete (approved) → `ddd-02-technical-design.md`
- ✅ **3. ADR Analysis** (optional): Complete (approved, ADR-7..8) → `adr-{n}-{slug}.md`
- ✅ **4. Implement**: Complete (approved) → source code
- [ ] **5. Test**: Pending → tests + `ddd-03-test-report.md`

## Expected Outcome

Shared `evaluateZone`/`surplus` functions; `POST …/confirm` writing snapshotted WeighingRecords; progression Blue → Red → Yellow → Sulphate → Soda Ash; BATCH_INCOMPLETE guard; re-tare; quit with ABANDON audit and resume.

## Test Expectations

Exhaustive boundary tests 93.4/93.5/94.0/94.5/94.6 g and kg equivalents (`STEP-22-tolerance-tests.txt`); crafted-request rejection; durability after restart; full five-component aggregate test; record JSON (`STEP-25-transaction.json`).

## Dependencies

### Requires
- `009-weighing-station`

### Requires Units (cross-unit)
- None

### Enables
- `011-assisted-weighing-station-ui`
- `012-weighing-station`
- `014-completion-and-ticketing`

## Workbook Steps Served

Steps 22, 23, 25

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

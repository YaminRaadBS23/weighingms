---
id: 015-completion-and-ticketing
unit: 005-completion-and-ticketing
intent: 001-assisted-weighing-station
type: ddd-construction-bolt
status: in-progress
stories:
  - 004-generate-and-print-ticket
  - 005-printer-unavailable-retry
  - 006-ticket-reprint
created: 2026-10-15T12:31:01Z
started: 2026-10-26T11:00:00Z
completed: null
current_stage: adr
stages_completed: [model, design]

requires_bolts: [004-device-integration, 014-completion-and-ticketing]
enables_bolts: [016-assisted-weighing-station-ui]
requires_units: [002-device-integration]
blocks: true

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 015-completion-and-ticketing

## Overview

Bolt 15 of 17 for intent `001-assisted-weighing-station` · Unit `005-completion-and-ticketing` · DDD Construction Bolt.

## Objective

Model and implement ticket composition, printing with preview, printer-failure retry and reprint.

## Stories Included

- **004-generate-and-print-ticket**: Generate and print the weighing ticket (Must)
- **005-printer-unavailable-retry**: Printer unavailable: keep ticket and retry (Must)
- **006-ticket-reprint**: Reprint a ticket marked REPRINT (Should)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [x] **1. Domain Model**: Approved 2026-10-26 → `ddd-01-domain-model.md`
- [x] **2. Technical Design**: Approved 2026-10-26 → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis** (optional): ADR-11 written, awaiting approval → `adr-11-ticket-is-a-stored-document-printing-is-a-retryable-step.md`
- [ ] **4. Implement**: Pending → source code
- [ ] **5. Test**: Pending → tests + `ddd-03-test-report.md`

## Expected Outcome

`POST /api/tickets` producing the prototype ticket content with Code 128 barcode B-24187; PRINTED/FAILED; retry print; REPRINT with audit.

## Test Expectations

Ticket composition tests; API tests with printer READY/OFFLINE/OUT_OF_PAPER (Step 27 evidence).

## Dependencies

### Requires
- `004-device-integration`
- `014-completion-and-ticketing`

### Requires Units (cross-unit)
- `002-device-integration`

### Enables
- `016-assisted-weighing-station-ui`

## Workbook Steps Served

Steps 27, 30

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

---
id: 017-assisted-weighing-station-ui
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
type: simple-construction-bolt
status: in-progress
stories:
  - 013-end-to-end-test-suite
created: 2026-10-15T12:31:01Z
started: 2026-10-26T16:00:00.000Z
completed: null
current_stage: test
stages_completed: []

requires_bolts: [013-assisted-weighing-station-ui, 016-assisted-weighing-station-ui]
enables_bolts: []
requires_units: []
blocks: true

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 017-assisted-weighing-station-ui

## Overview

Bolt 17 of 17 for intent `001-assisted-weighing-station` · Unit `006-assisted-weighing-station-ui` · Simple Construction Bolt.

## Objective

Implement the Playwright end-to-end suite for the full B-24187 flow and all failure scenarios.

## Stories Included

- **013-end-to-end-test-suite**: End-to-end and failure test suite (Must)

## Bolt Type

**Type**: Simple Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- [x] **1. Plan**: Approved 2026-10-26 → `implementation-plan.md`
- [x] **2. Implement**: Approved 2026-10-26 → source code + `implementation-walkthrough.md`
- [ ] **3. Test**: Written, awaiting approval → tests + `test-walkthrough.md`

## Expected Outcome

Passing E2E: sign-in → B-24187 → five confirmations → completion → OrgaTEX CONFIRMED → ticket; failure suite (scale, OrgaTEX, printer unavailable; invalid/under/over; re-tare; quit; incomplete batch); HTML report and video.

## Test Expectations

This bolt is the test suite (Steps 29–30 evidence: `STEP-29-playwright-report/`, `STEP-29-e2e-video.mp4`, `STEP-30-failure-tests.md`).

## Dependencies

### Requires
- `013-assisted-weighing-station-ui`
- `016-assisted-weighing-station-ui`

### Requires Units (cross-unit)
- None

### Enables
- None (final bolt)

## Workbook Steps Served

Steps 28, 29, 30

## Success Criteria

- [ ] All stories implemented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Human review complete at each stage checkpoint

## Notes

—

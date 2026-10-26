---
id: 013-end-to-end-test-suite
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 017-assisted-weighing-station-ui
implemented: true
---

# Story: 013-end-to-end-test-suite

**End-to-end and failure test suite** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As a** project team
**I want** Playwright tests for the full B-24187 flow and every failure scenario
**So that** the product's behaviour is proven automatically

## Requirements

Workbook Steps 22, 29, 30; NFR testability

## Acceptance Criteria

- [ ] **Given** a reset scenario, **When** the E2E runs, **Then** sign-in → select B-24187 → five components confirmed in order → completion → OrgaTEX CONFIRMED → ticket printed all pass
- [ ] **Given** the failure suite, **Then** scale unavailable, OrgaTEX unavailable, printer unavailable, invalid weight, over tolerance, under tolerance, re-tare, quit and incomplete batch each pass with the defined behaviour
- [ ] **Given** tolerance UI, **Then** 93.4/93.5/94.0/94.5/94.6 g produce the expected OK enabled/disabled state
- [ ] **Given** a run, **Then** an HTML report and video are produced (Step 29 evidence)

## UI/UX Impact

All screens

## API Dependencies

All `/api`; `/ext/*/_sim` for setup

## Test Expectations

This story is the test suite

## Technical Notes

—

## Dependencies

### Requires
- `011-confirm-and-print-screen` — 3 · Confirm & print screen
- `008-scale-and-device-failure-states` — Scale and device failure states
- `009-supervisor-dialog` — Supervisor dialog for override and scale reselection
- `010-surplus-panel` — Surplus panel
- `012-training-panel` — Training Panel

### Enables
- None

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

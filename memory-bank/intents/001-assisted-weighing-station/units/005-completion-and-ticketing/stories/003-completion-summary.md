---
id: 003-completion-summary
unit: 005-completion-and-ticketing
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 014-completion-and-ticketing
implemented: false
---

# Story: 003-completion-summary

**Completion summary** · Unit `005-completion-and-ticketing` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** a summary of the completed batch
**So that** I can check the result before the container leaves

## Requirements

FR-26 (summary), UI: done view

## Acceptance Criteria

- [ ] **Given** B-24187 completed with the prototype actuals, **When** `GET /api/batches/B-24187/summary` is called, **Then** Components weighed 5 of 5, All within tolerance YES, Total dispensed 35.322 kg (decimal sum), Elapsed (from session start), Operator, write-back status
- [ ] **Given** any OVERRIDDEN record, **Then** All within tolerance NO
- [ ] **Given** an incomplete batch, **Then** 409

## UI/UX Impact

Confirm & print summary block (006)

## API Dependencies

`GET /api/batches/:batchId/summary`

## Test Expectations

Read-model tests incl. total in kg

## Technical Notes

Elapsed definition: session start → completion (ui-analysis Q-UI-14, assumption).

## Dependencies

### Requires
- `001-post-consumption-on-completion` — Post actual consumption to OrgaTEX on completion

### Enables
- `004-generate-and-print-ticket` — Generate and print the weighing ticket

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

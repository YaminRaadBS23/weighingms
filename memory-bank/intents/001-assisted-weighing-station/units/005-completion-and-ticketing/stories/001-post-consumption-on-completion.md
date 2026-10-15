---
id: 001-post-consumption-on-completion
unit: 005-completion-and-ticketing
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 014-completion-and-ticketing
implemented: false
---

# Story: 001-post-consumption-on-completion

**Post actual consumption to OrgaTEX on completion** · Unit `005-completion-and-ticketing` · Priority **Must** · User/system value

## User Story

**As a** store / production planner (via OrgaTEX)
**I want** the actual consumption of a completed batch posted to OrgaTEX
**So that** actual vs theoretical consumption can be reconciled

## Requirements

FR-27, BR-12, IR-05, IR-08, AC-08

## Acceptance Criteria

- [ ] **Given** B-24187 completed, **When** `POST /api/batches/B-24187/consumption` is called with an Idempotency-Key, **Then** 200 and Dummy OrgaTEX stores one posting with five lines (dyestuff, lot, actual + unit, target, result)
- [ ] **Given** success, **When** write-back status is read, **Then** CONFIRMED with time ("Written to OrgaTEX CONFIRMED hh:mm:ss")
- [ ] **Given** the same key again, **Then** same response, still one posting
- [ ] **Given** an incomplete batch, **Then** 422 `BATCH_INCOMPLETE`

## UI/UX Impact

Confirm & print: Written to OrgaTEX CONFIRMED; transport sentence (006)

## API Dependencies

`POST /api/batches/:batchId/consumption`, `GET /api/batches/:batchId/write-back` → `OrgatexPort.postConsumption`

## Test Expectations

Domain + API tests (workbook Step 26 evidence)

## Technical Notes

Key generated and stored before the first send.

## Dependencies

### Requires
- `004-weighing-station/010-component-progression-and-batch-completion` — Component progression and batch completion
- `001-orgatex-integration/004-dummy-orgatex-accepts-consumption-idempotently` — Consumption posting and batch status, idempotent

### Enables
- `002-hold-and-retry-write-back` — Hold write-back as PENDING and retry
- `003-completion-summary` — Completion summary

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

---
id: 010-component-progression-and-batch-completion
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 010-weighing-station
implemented: true
---

# Story: 010-component-progression-and-batch-completion

**Component progression and batch completion** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** the next component to come up automatically and the batch to complete only when all components are done
**So that** I weigh Blue RSPL → Red RB → Yellow RGB → Sodium Sulphate → Soda Ash without skipping anything

## Requirements

FR-25, FR-26, IR-06

## Acceptance Criteria

- [ ] **Given** Blue RSPL confirmed, **When** the session is read, **Then** Red RB is ACTIVE (first pending in sequence)
- [ ] **Given** 4 of 5 done, **When** `POST /api/sessions/:id/complete` is called, **Then** 422 `BATCH_INCOMPLETE`
- [ ] **Given** all 5 done, **When** complete is called (or automatically after the last confirm), **Then** the session is COMPLETED (OrgaTEX status WEIGHED is set by the write-back of bolt 014 — ADR-8), and completion is handed to 005
- [ ] **Given** a completed session, **When** any component action is attempted, **Then** 409 `SESSION_COMPLETED`

## UI/UX Impact

Rail progression; transition to Confirm & print (006)

## API Dependencies

`POST /api/sessions/:id/complete`; `OrgatexPort.setBatchStatus`

## Test Expectations

Aggregate tests for the full 5-component sequence

## Technical Notes

—

## Dependencies

### Requires
- `009-confirm-weighing-in-tolerance` — Confirm a weighing inside tolerance

### Enables
- `005-completion-and-ticketing/001-post-consumption-on-completion` — Post actual consumption to OrgaTEX on completion

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| OrgaTEX offline at completion | Session completes; status update deferred to write-back retry (005) |

## Out of Scope

- Write-back and ticket (005)

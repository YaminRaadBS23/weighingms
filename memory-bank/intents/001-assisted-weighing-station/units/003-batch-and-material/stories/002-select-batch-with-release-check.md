---
id: 002-select-batch-with-release-check
unit: 003-batch-and-material
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 005-batch-and-material
implemented: false
---

# Story: 002-select-batch-with-release-check

**Select a batch by ID with release check** · Unit `003-batch-and-material` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to select a batch by touching it or scanning its card
**So that** I can start weighing the right batch and never one that is not released

## Requirements

FR-3, FR-4, BR-03

## Acceptance Criteria

- [ ] **Given** B-24187 RELEASED, **When** `GET /api/batches/B-24187` is called, **Then** batch detail is returned with `selectable:true`
- [ ] **Given** B-24190 QUEUED, **When** selection is attempted (`POST /api/sessions {batchId}` precondition), **Then** 409 `BATCH_NOT_RELEASED` with reason
- [ ] **Given** scanned `B-99999`, **When** resolved, **Then** 404 `BATCH_NOT_FOUND`
- [ ] **Given** B-24187 WEIGHING (session exists), **When** selected, **Then** it is selectable for resume

## UI/UX Impact

Row touch / scan on Select batch; reason message (006)

## API Dependencies

`GET /api/batches/:batchId`; `resolveBatch` service used by 004

## Test Expectations

Unit tests for selection rule; API tests

## Technical Notes

Rule: selectable ⇔ status ∈ {RELEASED, WEIGHING}.

## Dependencies

### Requires
- `001-station-batch-queue` — Station batch queue

### Enables
- `003-load-recipe-for-batch` — Load the recipe for a batch

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Lower-case scan b-24187 | Normalised to upper case |

## Out of Scope

- Session creation (004)

---
id: 001-station-batch-queue
unit: 003-batch-and-material
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 005-batch-and-material
implemented: true
---

# Story: 001-station-batch-queue

**Station batch queue** · Unit `003-batch-and-material` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to see the batch queue for my station as received from OrgaTEX
**So that** I know which batches are waiting to be weighed

## Requirements

FR-2, IR-01

## Acceptance Criteria

- [ ] **Given** OrgaTEX online, **When** `GET /api/batches` is called, **Then** it returns B-24187, B-24188, B-24190, B-24191 with order, machine, fabric/lot, shade, component count, status, `selectable` and the received time
- [ ] **Given** B-24190 QUEUED, **When** listed, **Then** `selectable:false` with reason "Not released by OrgaTEX"
- [ ] **Given** B-24187 WEIGHED, **When** listed, **Then** `selectable:false` with reason "Already weighed"

## UI/UX Impact

Select batch table and "Queue received from OrgaTEX at hh:mm" (006)

## API Dependencies

`GET /api/batches` → `OrgatexPort.listBatches`

## Test Expectations

API tests with fake port; mapping tests

## Technical Notes

No queue data stored in WeighingMS (C-01).

## Dependencies

### Requires
- `001-orgatex-integration/003-orgatex-port-read-operations` — OrgatexPort read operations via adapter

### Enables
- `002-select-batch-with-release-check` — Select a batch by ID with release check

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty queue | items: [] |

## Out of Scope

- UI table

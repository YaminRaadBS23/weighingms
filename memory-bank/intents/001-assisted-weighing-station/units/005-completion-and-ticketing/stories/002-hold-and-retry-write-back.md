---
id: 002-hold-and-retry-write-back
unit: 005-completion-and-ticketing
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 014-completion-and-ticketing
implemented: false
---

# Story: 002-hold-and-retry-write-back

**Hold write-back as PENDING and retry** · Unit `005-completion-and-ticketing` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** the batch to complete even when OrgaTEX is down, with the write-back held and retryable
**So that** weighing is never blocked and no consumption is lost or duplicated

## Requirements

FR-28, BR-16, BR-17, BR-18, TD-1

## Acceptance Criteria

- [ ] **Given** OrgaTEX offline, **When** B-24187 completes, **Then** write-back is PENDING, nothing is lost, and the pending count is 1
- [ ] **Given** PENDING and OrgaTEX back, **When** `POST /api/batches/B-24187/write-back/retry` is called, **Then** CONFIRMED with exactly one posting in OrgaTEX and a WRITEBACK_RETRY audit event
- [ ] **Given** PENDING, **When** a ticket is printed, **Then** printing is not blocked
- [ ] **Given** `GET /api/write-backs/pending-count`, **Then** the number of PENDING write-backs

## UI/UX Impact

Written to OrgaTEX PENDING + Retry; strip pending count (006)

## API Dependencies

`POST /api/batches/:batchId/write-back/retry`, `GET /api/write-backs/pending-count`

## Test Expectations

Domain + API tests with dummy offline/online

## Technical Notes

No background sync (TD-1).

## Dependencies

### Requires
- `001-post-consumption-on-completion` — Post actual consumption to OrgaTEX on completion
- `001-orgatex-integration/005-orgatex-outage-simulation` — Simulate OrgaTEX outage and reset scenario

### Enables
- `006-assisted-weighing-station-ui/011-confirm-and-print-screen` — 3 · Confirm & print screen

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Retry while still offline | Remains PENDING, attempts incremented |

## Out of Scope

- Automatic background retry

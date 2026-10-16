---
id: 004-orgatex-unavailable-on-load
unit: 003-batch-and-material
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 005-batch-and-material
implemented: true
---

# Story: 004-orgatex-unavailable-on-load

**Defined behaviour when OrgaTEX is unavailable on load** · Unit `003-batch-and-material` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** a clear message and a retry when OrgaTEX cannot be reached while loading the queue or a recipe
**So that** I never act on an empty or stale queue

## Requirements

FR-36, BR-16, A-03, TD-1

## Acceptance Criteria

- [ ] **Given** OrgaTEX offline, **When** `GET /api/batches` is called, **Then** 503 `ORGATEX_UNAVAILABLE` (not an empty list)
- [ ] **Given** OrgaTEX offline, **When** a recipe is requested, **Then** 503 `ORGATEX_UNAVAILABLE`
- [ ] **Given** OrgaTEX back online, **When** retried, **Then** normal responses
- [ ] **Given** a session already in progress, **When** OrgaTEX goes offline, **Then** session endpoints keep working (recipe held by the session)

## UI/UX Impact

"OrgaTEX not reachable" + Retry on Select batch; ORGATEX OFFLINE in strip (006)

## API Dependencies

Batch endpoints error mapping

## Test Expectations

API tests with dummy offline

## Technical Notes

—

## Dependencies

### Requires
- `003-load-recipe-for-batch` — Load the recipe for a batch
- `001-orgatex-integration/005-orgatex-outage-simulation` — Simulate OrgaTEX outage and reset scenario

### Enables
- `006-assisted-weighing-station-ui/003-select-batch-screen` — 1 · Select batch screen

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Write-back outage (005)

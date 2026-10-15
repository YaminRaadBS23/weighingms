---
id: 005-orgatex-outage-simulation
unit: 001-orgatex-integration
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 002-orgatex-integration
implemented: false
---

# Story: 005-orgatex-outage-simulation

**Simulate OrgaTEX outage and reset scenario** · Unit `001-orgatex-integration` · Priority **Must** · User/system value

## User Story

**As a** trainer or automated test
**I want** to take Dummy OrgaTEX offline/online and reset its data
**So that** OrgaTEX-unavailable behaviour can be demonstrated and tested repeatably

## Requirements

DB-6; supports FR-28, FR-36, workbook Step 30

## Acceptance Criteria

- [ ] **Given** dev/test mode, **When** `POST /ext/orgatex/_sim/offline` is called, **Then** every `/ext/orgatex` business endpoint responds 503 and `OrgatexPort` raises `ORGATEX_UNAVAILABLE`
- [ ] **Given** offline, **When** `POST /ext/orgatex/_sim/online` is called, **Then** endpoints respond normally
- [ ] **Given** postings and status changes, **When** `POST /ext/orgatex/_sim/reset` is called, **Then** data equals the seed
- [ ] **Given** production mode, **When** `/ext/orgatex/_sim/*` is called, **Then** 404 (not registered)

## UI/UX Impact

Training Panel controls (006)

## API Dependencies

`/ext/orgatex/_sim/offline|online|reset`

## Test Expectations

API tests for each control and for production gating

## Technical Notes

Never called by WeighingMS application code.

## Dependencies

### Requires
- `004-dummy-orgatex-accepts-consumption-idempotently` — Consumption posting and batch status, idempotent

### Enables
- `003-batch-and-material/004-orgatex-unavailable-on-load` — Defined behaviour when OrgaTEX is unavailable on load
- `005-completion-and-ticketing/002-hold-and-retry-write-back` — Hold write-back as PENDING and retry
- `006-assisted-weighing-station-ui/012-training-panel` — Training Panel

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Offline twice | Idempotent, stays offline |

## Out of Scope

- Latency/partial-failure simulation

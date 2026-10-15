---
id: 003-orgatex-port-read-operations
unit: 001-orgatex-integration
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 001-orgatex-integration
implemented: true
---

# Story: 003-orgatex-port-read-operations

**OrgatexPort read operations via adapter** · Unit `001-orgatex-integration` · Priority **Must** · User/system value

## User Story

**As a** WeighingMS domain module
**I want** to read batches, recipes, lots and OrgaTEX link status through `OrgatexPort` without knowing the OrgaTEX interface
**So that** the real OrgaTEX can later replace the dummy by swapping one adapter

## Requirements

IR-07; supports FR-2, FR-5, FR-8, FR-32

## Acceptance Criteria

- [ ] **Given** the dummy adapter, **When** `listBatches`, `getBatch`, `getRecipe`, `listLots` are called, **Then** they return WeighingMS domain types mapped from `/ext/orgatex` responses
- [ ] **Given** Dummy OrgaTEX returns 404, **When** the adapter is called, **Then** it raises the matching WeighingMS error (`BATCH_NOT_FOUND`, `RECIPE_NOT_FOUND`)
- [ ] **Given** Dummy OrgaTEX is unreachable or slow beyond the timeout, **When** any operation is called, **Then** it raises `ORGATEX_UNAVAILABLE`
- [ ] **Given** successful calls, **When** `getLinkStatus` is called, **Then** it returns ONLINE and the last-contact time
- [ ] **Given** any call, **When** it completes, **Then** a structured log line records operation, batch ID and outcome (IR-09)

## UI/UX Impact

Indirect: ORGATEX · LINKED hh:mm in status strip (via 006)

## API Dependencies

Consumes `/ext/orgatex/...`; exposes `OrgatexPort` (in-process)

## Test Expectations

Adapter tests against the in-process dummy; failure tests with dummy offline

## Technical Notes

Domain modules depend only on the `OrgatexPort` interface; adapter wired in the app factory.

## Dependencies

### Requires
- `002-dummy-orgatex-serves-batches-and-recipes` — Dummy OrgaTEX serves batches, recipes and lots

### Enables
- `004-dummy-orgatex-accepts-consumption-idempotently` — Consumption posting and batch status, idempotent
- `003-batch-and-material/001-station-batch-queue` — Station batch queue

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Malformed dummy payload | ORGATEX_PROTOCOL_ERROR, logged |

## Out of Scope

- Write operations (story 004)

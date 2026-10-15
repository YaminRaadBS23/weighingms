---
id: 004-dummy-orgatex-accepts-consumption-idempotently
unit: 001-orgatex-integration
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 002-orgatex-integration
implemented: true
---

# Story: 004-dummy-orgatex-accepts-consumption-idempotently

**Consumption posting and batch status, idempotent** · Unit `001-orgatex-integration` · Priority **Must** · User/system value

## User Story

**As a** WeighingMS
**I want** to post a batch's actual consumption and set its status in OrgaTEX with an idempotency key
**So that** consumption reaches OrgaTEX exactly once even if a request is retried

## Requirements

DB-1, NFR-7, IR-05, IR-06, IR-08; supports FR-26, FR-27, FR-28

## Acceptance Criteria

- [ ] **Given** B-24187, **When** a consumption posting with key K and five lines is sent, **Then** Dummy OrgaTEX stores one posting and returns 200 with the stored record
- [ ] **Given** posting K already stored, **When** the same key is sent again, **Then** the same response is returned and no second posting exists
- [ ] **Given** the same key with a different body, **When** sent, **Then** 409 `IDEMPOTENCY_CONFLICT`
- [ ] **Given** B-24187 RELEASED, **When** status WEIGHING then WEIGHED is set, **Then** the batch shows that status in the queue
- [ ] **Given** stored postings, **When** `GET /ext/orgatex/batches/B-24187/consumption` is called, **Then** the stored record is returned (Step 26 evidence)

## UI/UX Impact

None directly

## API Dependencies

`POST /ext/orgatex/batches/:id/consumption` (Idempotency-Key), `PATCH /ext/orgatex/batches/:id/status`, `GET …/consumption`; port `postConsumption`, `setBatchStatus`

## Test Expectations

Contract tests incl. idempotent repeat and conflicting body

## Technical Notes

Training contract — brief §10.1 shapes not adopted.

## Dependencies

### Requires
- `003-orgatex-port-read-operations` — OrgatexPort read operations via adapter

### Enables
- `005-orgatex-outage-simulation` — Simulate OrgaTEX outage and reset scenario
- `005-completion-and-ticketing/001-post-consumption-on-completion` — Post actual consumption to OrgaTEX on completion

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Posting for unknown batch | 404 |
| Posting for QUEUED batch | 409 BATCH_NOT_RELEASED |

## Out of Scope

- PENDING/retry orchestration (005)

---
id: 009-confirm-weighing-in-tolerance
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 010-weighing-station
implemented: false
---

# Story: 009-confirm-weighing-in-tolerance

**Confirm a weighing inside tolerance** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to confirm the component when the weight is within tolerance
**So that** the exact weighed quantity is permanently recorded with full traceability

## Requirements

FR-18, FR-19, BR-07, BR-11, NFR-5, NFR-8, NFR-9, TD-9

## Acceptance Criteria

- [ ] **Given** Yellow RGB unlocked and the scale stable at 94.2 g, **When** `POST …/components/3/confirm` is called, **Then** a WeighingRecord is committed with actual 94.2 g, target 94.0, tolMin 93.5, tolMax 94.5, lot 2026-0387, container C-12, tare 214.0 g, scale scale-3kg, operator, timestamp, result IN_TOLERANCE — and the component is DONE
- [ ] **Given** the scale reads 94.6 g, **When** confirm is called (even if the client claims 94.2), **Then** 422 `TOLERANCE_VIOLATION` and nothing is recorded
- [ ] **Given** `stable:false`, **Then** 409 `READING_UNSTABLE`; **Given** disconnected, **Then** 503 `SCALE_UNAVAILABLE`
- [ ] **Given** a record, **When** any update/delete is attempted, **Then** no such endpoint exists (405/404)
- [ ] **Given** `GET /api/sessions/:id/records`, **Then** records are returned (Step 25 `STEP-25-transaction.json`)

## UI/UX Impact

OK · Confirm F1; rail shows ✓ actual (006)

## API Dependencies

`POST /api/sessions/:id/components/:seq/confirm`, `GET /api/sessions/:id/records`; `ScalePort.read` (server-side)

## Test Expectations

Domain + API tests incl. crafted request; durability test (record present after app restart)

## Technical Notes

Synchronous SQLite transaction before response.

## Dependencies

### Requires
- `004-verify-dyestuff-identity-and-unlock` — Verify dyestuff identity, lot and container, then unlock weighing
- `008-tolerance-evaluation-rules` — Tolerance evaluation and surplus rules
- `002-device-integration/002-live-net-weight-reading` — Live net weight with stability

### Enables
- `010-component-progression-and-batch-completion` — Component progression and batch completion
- `013-supervisor-override` — Supervisor override of an out-of-tolerance weight
- `006-assisted-weighing-station-ui/007-action-keys-confirm-retare-quit` — Action keys: OK, Re-tare, Quit (+ F-keys)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Double-click confirm | Second request 409 COMPONENT_ALREADY_DONE |

## Out of Scope

- Override (story 013)

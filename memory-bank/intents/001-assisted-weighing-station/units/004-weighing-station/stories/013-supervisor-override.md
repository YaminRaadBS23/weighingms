---
id: 013-supervisor-override
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 012-weighing-station
implemented: false
---

# Story: 013-supervisor-override

**Supervisor override of an out-of-tolerance weight** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As a** supervisor
**I want** to authorise confirming a weight outside tolerance with my PIN and a reason
**So that** exceptional cases can proceed and are fully accountable

## Requirements

FR-22, BR-13, AC-06, TD-15, FR-37, NFR-14

## Acceptance Criteria

- [ ] **Given** Yellow RGB at 93.0 g (under), **When** `POST …/components/3/override {pin, reason}` with a valid supervisor PIN and non-empty reason, **Then** a record with result OVERRIDDEN, an Override (supervisor, reason, time) and an OVERRIDE audit event are written and the component is DONE
- [ ] **Given** an empty reason, **Then** 400 `REASON_REQUIRED`; **Given** operator/wrong PIN, **Then** 403 `NOT_AUTHORISED`
- [ ] **Given** weight within tolerance, **Then** 409 `OVERRIDE_NOT_NEEDED`
- [ ] **Given** weight 0, **Then** 409 (nothing to override)

## UI/UX Impact

Supervisor override key; "OVERRIDE REQUESTED — AWAITING SUPERVISOR"; dialog (006)

## API Dependencies

`POST /api/sessions/:id/components/:seq/override`

## Test Expectations

Domain + API tests

## Technical Notes

Step 24 (TD-10): override is allowed for any out-of-tolerance weight above zero, over-dosed included; the surplus is kept on the record; nothing is recalculated.

## Dependencies

### Requires
- `009-confirm-weighing-in-tolerance` — Confirm a weighing inside tolerance
- `015-audit-trail` — Immutable audit trail

### Enables
- `014-overshoot-detection-and-recovery` — Overshoot detection and recovery
- `006-assisted-weighing-station-ui/009-supervisor-dialog` — Supervisor dialog for override and scale reselection

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Remote approval

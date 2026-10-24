---
id: 006-supervisor-scale-reselection
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: complete
priority: should
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 009-weighing-station
implemented: true
---

# Story: 006-supervisor-scale-reselection

**Supervisor scale reselection** · Unit `004-weighing-station` · Priority **Should** · User/system value

## User Story

**As a** supervisor
**I want** to override the automatic scale for the active component
**So that** weighing can continue when the preferred scale cannot be used

## Requirements

FR-12, FR-35 (brief), FR-37, NFR-14

## Acceptance Criteria

- [ ] **Given** a valid supervisor PIN and a scale with sufficient capacity, **When** reselection is requested, **Then** the component uses that scale with mode MANUAL and a SCALE_RESELECT audit event is written
- [ ] **Given** an operator PIN or wrong PIN, **Then** 403 `NOT_AUTHORISED`
- [ ] **Given** a scale with insufficient capacity, **Then** 422 `SCALE_CAPACITY_INSUFFICIENT`

## UI/UX Impact

Supervisor dialog; badge shows "manual" (006)

## API Dependencies

`POST /api/sessions/:id/components/:seq/scale`

## Test Expectations

Domain + API tests

## Technical Notes

PIN verified against hash.

## Dependencies

### Requires
- `005-automatic-scale-selection` — Automatic scale selection
- `015-audit-trail` — Immutable audit trail

### Enables
- `006-assisted-weighing-station-ui/009-supervisor-dialog` — Supervisor dialog for override and scale reselection

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Changing scale configuration

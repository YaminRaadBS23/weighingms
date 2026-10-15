---
id: 009-supervisor-dialog
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 013-assisted-weighing-station-ui
implemented: false
---

# Story: 009-supervisor-dialog

**Supervisor dialog for override and scale reselection** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As a** supervisor
**I want** a dialog to enter my PIN and reason (override) or choose another scale
**So that** I can authorise exceptions at the station

## Requirements

FR-22, FR-12 (presentation)

## Acceptance Criteria

- [ ] **Given** out of tolerance, **When** Supervisor override is pressed, **Then** the status shows "OVERRIDE REQUESTED — AWAITING SUPERVISOR" and a PIN + reason dialog opens
- [ ] **Given** valid PIN and reason, **Then** the component is DONE (overridden)
- [ ] **Given** invalid PIN or empty reason, **Then** the error is shown and nothing changes
- [ ] **Given** scale reselection, **Then** only scales with sufficient capacity are offered and the badge shows "manual"

## UI/UX Impact

Prototype `#btn-override` + new dialog

## API Dependencies

override and scale endpoints

## Test Expectations

Component tests; E2E

## Technical Notes

PIN input masked; never logged.

## Dependencies

### Requires
- `007-action-keys-confirm-retare-quit` — Action keys: OK, Re-tare, Quit (+ F-keys)
- `004-weighing-station/013-supervisor-override` — Supervisor override of an out-of-tolerance weight
- `004-weighing-station/006-supervisor-scale-reselection` — Supervisor scale reselection

### Enables
- `013-end-to-end-test-suite` — End-to-end and failure test suite

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

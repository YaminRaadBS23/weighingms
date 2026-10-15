---
id: 008-scale-and-device-failure-states
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 013-assisted-weighing-station-ui
implemented: false
---

# Story: 008-scale-and-device-failure-states

**Scale and device failure states** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** a clear, safe screen state when the scale is unavailable or out of calibration
**So that** I never confirm a weight that cannot be trusted

## Requirements

FR-33, FR-13 (presentation), NFR-3

## Acceptance Criteria

- [ ] **Given** no successful reading for 2 s, **Then** the readout shows "Scale unavailable", OK is disabled and the strip shows OFFLINE
- [ ] **Given** the scale returns, **Then** the operator is asked to re-tare and weighing continues
- [ ] **Given** CAL EXPIRED, **Then** a message explains weighing is blocked on that scale

## UI/UX Impact

New states on prototype readout/strip

## API Dependencies

weight/status endpoints

## Test Expectations

Component tests; E2E failure suite

## Technical Notes

—

## Dependencies

### Requires
- `007-action-keys-confirm-retare-quit` — Action keys: OK, Re-tare, Quit (+ F-keys)
- `002-device-integration/005-scale-disconnection-detection` — Detect scale disconnection

### Enables
- `013-end-to-end-test-suite` — End-to-end and failure test suite

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

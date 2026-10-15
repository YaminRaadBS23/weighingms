---
id: 007-calibration-enforcement
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: draft
priority: should
created: 2026-10-15T12:25:00Z
assigned_bolt: 009-weighing-station
implemented: false
---

# Story: 007-calibration-enforcement

**Block weighing on an expired scale** · Unit `004-weighing-station` · Priority **Should** · User/system value

## User Story

**As a** supervisor
**I want** weighing prevented on a scale whose calibration has expired
**So that** no batch is weighed on an untrustworthy scale

## Requirements

FR-13, BR-24, AC-14

## Acceptance Criteria

- [ ] **Given** `scale-3kg` calibration expired, **When** Yellow RGB is activated, **Then** automatic selection skips it (or returns `NO_SUITABLE_SCALE` with reason)
- [ ] **Given** a component already on a scale that expires, **When** confirm is attempted, **Then** 422 `SCALE_CALIBRATION_EXPIRED`
- [ ] **Given** valid calibration, **Then** no effect

## UI/UX Impact

CAL EXPIRED in strip; message on Weigh (006)

## API Dependencies

Uses `ScalePort.status`

## Test Expectations

Domain tests with fake port

## Technical Notes

—

## Dependencies

### Requires
- `005-automatic-scale-selection` — Automatic scale selection

### Enables
- None

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Calibration management UI

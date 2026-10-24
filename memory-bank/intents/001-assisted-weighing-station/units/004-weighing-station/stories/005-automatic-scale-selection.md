---
id: 005-automatic-scale-selection
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 009-weighing-station
implemented: true
---

# Story: 005-automatic-scale-selection

**Automatic scale selection** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** the system to choose the right scale for each component
**So that** small dye quantities are weighed precisely and bulk auxiliaries fit the scale

## Requirements

FR-11, BR-05, AC-02, TD-2

## Acceptance Criteria

- [ ] **Given** scales 3 kg and 32 kg, **When** `selectScale` evaluates Blue (1240.0 g + 6.0 + 214 tare), Red, Yellow, **Then** `scale-3kg`
- [ ] **Given** Sodium Sulphate (24.000 kg + 0.120 + 1.850) and Soda Ash, **Then** `scale-32kg`
- [ ] **Given** a requirement exactly equal to the 3 kg capacity, **Then** `scale-3kg` (inclusive); just above → `scale-32kg`
- [ ] **Given** the smaller scale is calibration-expired or disconnected, **Then** the next suitable scale is chosen; if none, `NO_SUITABLE_SCALE`
- [ ] **Given** an active component, **When** read, **Then** it carries the selected scale and selection mode AUTO

## UI/UX Impact

Scale badge "Scale selected / 3 kg precision / automatic"; switch to 32 kg floor and kg units for Sodium Sulphate (006)

## API Dependencies

Pure rule in `src/shared/domain`; uses `ScalePort.list/status`

## Test Expectations

Unit tests incl. boundary and unavailable cases

## Technical Notes

Units converted via shared helper before comparison.

## Dependencies

### Requires
- `002-device-integration/001-dummy-scales-and-scale-api` — Dummy scales and scale listing/status API

### Enables
- `004-verify-dyestuff-identity-and-unlock` — Verify dyestuff identity, lot and container, then unlock weighing
- `006-supervisor-scale-reselection` — Supervisor scale reselection
- `007-calibration-enforcement` — Block weighing on an expired scale

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Mixed units g vs kg capacity | Converted exactly with decimal |

## Out of Scope

- Manual reselection (story 006)

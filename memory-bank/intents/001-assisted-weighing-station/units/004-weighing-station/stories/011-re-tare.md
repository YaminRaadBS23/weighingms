---
id: 011-re-tare
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 010-weighing-station
implemented: true
---

# Story: 011-re-tare

**Re-tare the active component** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to re-zero the scale with my container and restart the component
**So that** I can recover from a spill or wrong container without recording anything

## Requirements

FR-23, IR-12

## Acceptance Criteria

- [ ] **Given** Yellow RGB at 50.0 g, **When** `POST …/components/3/retare` is called, **Then** the scale is tared, net reads 0.0 g and still-to-weigh equals 94.0 g
- [ ] **Given** an over state, **When** re-tared, **Then** the over/surplus state clears
- [ ] **Given** re-tare, **Then** the new tare is the one recorded at confirmation and no record is written
- [ ] **Given** a DONE component, **Then** re-tare is not allowed (409)

## UI/UX Impact

Re-tare F2 (006)

## API Dependencies

`POST /api/sessions/:id/components/:seq/retare` → `ScalePort.tare`

## Test Expectations

Domain + API tests

## Technical Notes

—

## Dependencies

### Requires
- `004-verify-dyestuff-identity-and-unlock` — Verify dyestuff identity, lot and container, then unlock weighing

### Enables
- `014-overshoot-detection-and-recovery` — Overshoot detection and recovery
- `006-assisted-weighing-station-ui/007-action-keys-confirm-retare-quit` — Action keys: OK, Re-tare, Quit (+ F-keys)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Scale unavailable | 503, state unchanged |

## Out of Scope

- Implementation tasks (defined in bolts)

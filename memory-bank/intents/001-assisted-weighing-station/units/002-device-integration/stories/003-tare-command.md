---
id: 003-tare-command
unit: 002-device-integration
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 003-device-integration
implemented: true
---

# Story: 003-tare-command

**Tare the scale with the container in place** · Unit `002-device-integration` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** the scale tared with my container on it
**So that** Weighed now shows only the dyestuff

## Requirements

FR-10, IR-12

## Acceptance Criteria

- [ ] **Given** container C-12 (214 g) on `scale-3kg`, **When** `POST /api/scales/scale-3kg/tare` is called, **Then** the net reading becomes 0.0 g and the response returns the applied tare `{ value: "214.0", unit: "g" }`
- [ ] **Given** the scale is disconnected, **When** tare is requested, **Then** 503 `SCALE_UNAVAILABLE`
- [ ] **Given** a second tare, **When** issued, **Then** the new tare replaces the old

## UI/UX Impact

Re-tare F2 and automatic tare on unlock (004/006)

## API Dependencies

`POST /ext/scale/scales/:id/tare`; `POST /api/scales/:scaleId/tare`; `ScalePort.tare`

## Test Expectations

Contract tests incl. disconnected

## Technical Notes

Tare value is recorded by 004 at confirmation.

## Dependencies

### Requires
- `002-live-net-weight-reading` — Live net weight with stability

### Enables
- `004-scale-simulation-controls` — Scale simulation controls
- `004-weighing-station/004-verify-dyestuff-identity-and-unlock` — Verify dyestuff identity, lot and container, then unlock weighing

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Tare on unstable reading | Allowed; tare equals current gross |

## Out of Scope

- Container master tare check

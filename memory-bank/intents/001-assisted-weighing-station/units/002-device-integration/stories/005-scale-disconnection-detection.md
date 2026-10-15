---
id: 005-scale-disconnection-detection
unit: 002-device-integration
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 003-device-integration
implemented: true
---

# Story: 005-scale-disconnection-detection

**Detect scale disconnection** · Unit `002-device-integration` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to be told immediately when the scale stops responding
**So that** I never confirm a weight the system cannot actually read

## Requirements

FR-33, NFR-3, IR-13

## Acceptance Criteria

- [ ] **Given** `…/_sim/scale-3kg/disconnect`, **When** weight is read, **Then** `/api/scales/scale-3kg/weight` returns 503 `SCALE_UNAVAILABLE` (or `connected:false`) within 2 s
- [ ] **Given** disconnected, **When** status is read, **Then** OFFLINE
- [ ] **Given** `…/reconnect`, **When** read, **Then** readings resume
- [ ] **Given** the other scale, **When** one is disconnected, **Then** the other is unaffected

## UI/UX Impact

Scale-unavailable state on Weigh screen and status strip (006)

## API Dependencies

`/ext/scale/_sim/:id/disconnect|reconnect`; weight/status endpoints

## Test Expectations

Contract tests; timing test ≤ 2 s

## Technical Notes

Domain blocking of confirmation is in 004 (story 009).

## Dependencies

### Requires
- `004-scale-simulation-controls` — Scale simulation controls

### Enables
- `006-assisted-weighing-station-ui/008-scale-and-device-failure-states` — Scale and device failure states

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Disconnect during tare | 503, tare unchanged |

## Out of Scope

- UI rendering

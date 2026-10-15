---
id: 004-scale-simulation-controls
unit: 002-device-integration
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 003-device-integration
implemented: false
---

# Story: 004-scale-simulation-controls

**Scale simulation controls** · Unit `002-device-integration` · Priority **Must** · User/system value

## User Story

**As a** trainer or automated test
**I want** to set exact weights, simulate dispense and overshoot, place a container and expire calibration on the dummy scales
**So that** every weighing situation (including 93.4/93.5/94.0/94.5/94.6 g) can be shown and tested

## Requirements

DB-6, DB-2

## Acceptance Criteria

- [ ] **Given** dev/test mode, **When** `POST /ext/scale/_sim/scale-3kg/weight {net:"93.4"}` is called, **Then** the next reading is exactly 93.4 g
- [ ] **Given** Yellow RGB active, **When** `…/dispense {landing: "94.2"}` is called, **Then** the weight eases from current to 94.2 g (fast then slowing) and then becomes stable
- [ ] **Given** `…/dispense {landing: "96.4"}` (overshoot, target + 4.8 × tol), **Then** the weight ends over tolerance
- [ ] **Given** `…/container {tare:"214.0"}`, **Then** gross includes the container
- [ ] **Given** `…/calibration {expired:true}`, **Then** status reports CAL_EXPIRED
- [ ] **Given** production mode, **Then** `/ext/scale/_sim/*` returns 404

## UI/UX Impact

Training Panel (006)

## API Dependencies

`/ext/scale/_sim/:scaleId/weight|dispense|container|calibration|reset`

## Test Expectations

API tests per control; dispense curve reaches landing exactly

## Technical Notes

Easing curve inspired by prototype `run()` (step = max(0.4 % target, 5.5 % remaining)); implemented server-side, not copied.

## Dependencies

### Requires
- `003-tare-command` — Tare the scale with the container in place

### Enables
- `005-scale-disconnection-detection` — Detect scale disconnection
- `006-assisted-weighing-station-ui/012-training-panel` — Training Panel

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Landing above capacity | 400 VALIDATION_ERROR |

## Out of Scope

- Noise/jitter simulation

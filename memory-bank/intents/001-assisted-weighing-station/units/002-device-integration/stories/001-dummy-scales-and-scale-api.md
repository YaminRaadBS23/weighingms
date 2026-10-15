---
id: 001-dummy-scales-and-scale-api
unit: 002-device-integration
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 003-device-integration
implemented: false
---

# Story: 001-dummy-scales-and-scale-api

**Dummy scales and scale listing/status API** · Unit `002-device-integration` · Priority **Must** · User/system value

## User Story

**As a** WeighingMS
**I want** to list the station's scales with capacity, resolution, calibration due date and status
**So that** the right scale can be chosen and its state shown

## Requirements

DB-2; supports FR-11, FR-13, FR-32

## Acceptance Criteria

- [ ] **Given** the seed, **When** `GET /api/scales` is called, **Then** it returns `scale-3kg` (PRECISION, 3 kg) and `scale-32kg` (FLOOR, 32 kg) with resolution and calibration due dates in the future
- [ ] **Given** a scale, **When** `GET /api/scales/:scaleId/status` is called, **Then** it returns connected, calibration state (VALID/EXPIRED) and READY/OFFLINE/CAL_EXPIRED
- [ ] **Given** an unknown scale ID, **When** requested, **Then** 404 `SCALE_NOT_FOUND`
- [ ] **Given** the request, **When** handled, **Then** WeighingMS reads via `ScalePort` from `/ext/scale` (never directly)

## UI/UX Impact

Status strip SCALE 3 kg / 32 kg (006); scale badge capacity (006)

## API Dependencies

`/ext/scale/scales…`; `GET /api/scales`, `GET /api/scales/:scaleId/status`; `ScalePort.list/status`

## Test Expectations

Contract tests for dummy and facade

## Technical Notes

Device state in memory (data-stack).

## Dependencies

### Requires
- `001-orgatex-integration/001-project-scaffold` — Runnable project scaffold

### Enables
- `002-live-net-weight-reading` — Live net weight with stability
- `004-weighing-station/005-automatic-scale-selection` — Automatic scale selection

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Weight reading (story 002)

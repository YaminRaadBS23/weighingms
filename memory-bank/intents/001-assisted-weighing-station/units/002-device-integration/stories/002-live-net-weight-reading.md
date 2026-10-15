---
id: 002-live-net-weight-reading
unit: 002-device-integration
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 003-device-integration
implemented: false
---

# Story: 002-live-net-weight-reading

**Live net weight with stability** · Unit `002-device-integration` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** the current net weight of the selected scale, updated continuously, with stability information
**So that** I can dispense accurately against the target

## Requirements

FR-14, NFR-1, IR-10, IR-11, TD-9

## Acceptance Criteria

- [ ] **Given** the dummy gross weight is 214.0 g and tare 214.0 g, **When** `GET /api/scales/scale-3kg/weight` is called, **Then** it returns `{ weight: { value: "0.0", unit: "g" }, stable, connected: true, at }`
- [ ] **Given** the weight changes, **When** polled every 100 ms, **Then** each response reflects the dummy state at that moment (≤ 200 ms lag)
- [ ] **Given** the weight unchanged for ≥ 500 ms, **When** read, **Then** `stable: true`; while changing, `stable: false`
- [ ] **Given** `scale-32kg`, **When** read, **Then** values are in kg at 3-decimal precision
- [ ] **Given** 20 consecutive reads at 100 ms, **When** measured, **Then** all succeed within the interval locally

## UI/UX Impact

Weighed now readout (006)

## API Dependencies

`GET /ext/scale/scales/:id/reading`; `GET /api/scales/:scaleId/weight`; `ScalePort.read`

## Test Expectations

Contract tests; stability timing test with fake clock; polling throughput test

## Technical Notes

Precision follows TD-12 (g 1 dp, kg 3 dp); values as decimal strings.

## Dependencies

### Requires
- `001-dummy-scales-and-scale-api` — Dummy scales and scale listing/status API

### Enables
- `003-tare-command` — Tare the scale with the container in place
- `004-weighing-station/009-confirm-weighing-in-tolerance` — Confirm a weighing inside tolerance
- `006-assisted-weighing-station-ui/005-live-readout-and-tolerance-bar` — Live readout and tolerance bar

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Negative net (container removed) | Returned as negative value; domain treats < 0 as under |

## Out of Scope

- Disconnection (story 005)

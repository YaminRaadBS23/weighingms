---
id: 012-training-panel
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 016-assisted-weighing-station-ui
implemented: true
---

# Story: 012-training-panel

**Training Panel** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As a** trainer
**I want** a separate page to simulate dispense, overshoot, exact weights and outages
**So that** I can demonstrate every scenario without touching code

## Requirements

DB-7, DB-6

## Acceptance Criteria

- [ ] **Given** dev mode, **When** `/training` opens, **Then** controls exist for: simulate dispense, simulate overshoot, set exact weight, place container, disconnect/reconnect scale, expire calibration, scanner/printer/OrgaTEX offline, inject scan, reset scenario
- [ ] **Given** a control is used, **Then** the operator screen reflects it only through the normal APIs
- [ ] **Given** the operator screen, **Then** no training control is visible on it

## UI/UX Impact

Replaces the prototype `.controls` bar; uses `--page-*` tokens to look distinct

## API Dependencies

`/ext/*/_sim/...`

## Test Expectations

Component tests; used by E2E

## Technical Notes

—

## Dependencies

### Requires
- `001-app-shell-top-bar-and-status-strip` — App shell, top bar and status strip
- `002-device-integration/004-scale-simulation-controls` — Scale simulation controls
- `001-orgatex-integration/005-orgatex-outage-simulation` — Simulate OrgaTEX outage and reset scenario

### Enables
- `013-end-to-end-test-suite` — End-to-end and failure test suite

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

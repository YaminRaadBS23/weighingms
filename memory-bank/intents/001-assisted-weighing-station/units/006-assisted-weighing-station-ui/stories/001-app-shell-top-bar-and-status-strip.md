---
id: 001-app-shell-top-bar-and-status-strip
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 007-assisted-weighing-station-ui
implemented: true
---

# Story: 001-app-shell-top-bar-and-status-strip

**App shell, top bar and status strip** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** the station frame with top bar and live status strip
**So that** I always see the station, batch, operator and whether devices and OrgaTEX are working

## Requirements

FR-32, NFR-13, ux-guide tokens

## Acceptance Criteria

- [ ] **Given** the app loads, **Then** the dark HMI frame with "WeighingMS STATION 01", crumb and operator chip is shown using the prototype tokens
- [ ] **Given** device/OrgaTEX states, **Then** the strip shows SCALE 3 kg · READY, SCALE 32 kg · READY, SCANNER, PRINTER, ORGATEX · LINKED hh:mm (+ pending count), EN and a live clock; changes appear within 2 s
- [ ] **Given** a non-ready state, **Then** text (OFFLINE / CAL EXPIRED / OUT OF PAPER) accompanies the dot colour
- [ ] **Given** any UI string, **Then** it comes from the English message catalogue

## UI/UX Impact

Prototype `.topbar`, `.strip`

## API Dependencies

`GET /api/scales`, `/api/scales/:id/status`, `/api/scanner/status`, `/api/printer/status`, OrgaTEX link status, `/api/write-backs/pending-count`, `/api/operators/current`

## Test Expectations

Component tests; visual check vs prototype (Step 28)

## Technical Notes

—

## Dependencies

### Requires
- `001-orgatex-integration/001-project-scaffold` — Runnable project scaffold

### Enables
- `002-sign-in-screen` — Sign-in screen
- `012-training-panel` — Training Panel

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

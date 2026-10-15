---
id: 005-live-readout-and-tolerance-bar
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 011-assisted-weighing-station-ui
implemented: false
---

# Story: 005-live-readout-and-tolerance-bar

**Live readout and tolerance bar** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to see weighed now, still to weigh, target and a progress bar with the tolerance band, updating live
**So that** I can pour accurately and see when I am within tolerance

## Requirements

FR-14, FR-15, FR-16, FR-17 (presentation), NFR-1, NFR-11

## Acceptance Criteria

- [ ] **Given** the Weigh screen, **Then** the UI polls `GET /api/scales/:id/weight` every 100 ms and shows Weighed now (≥ 52 px), Still to weigh and Target with units
- [ ] **Given** 90.0 g on Yellow RGB, **Then** Still to weigh 4.0 g; above target it shows 0.0
- [ ] **Given** the bar, **Then** the band spans 93.5–94.5, the target line is at 94.0 and the caption reads "TOLERANCE ±0.5 g (93.5 – 94.5)" and "125 g"
- [ ] **Given** zones, **Then** colours and status texts match the prototype (DISPENSE — x REMAINING / WITHIN TOLERANCE — PRESS OK TO CONFIRM / OVER TOLERANCE — SURPLUS +x)
- [ ] **Given** the UI source, **Then** no weight is simulated in the UI

## UI/UX Impact

Prototype `.readout`, `#bar`, `.bar-caption`, `#status`

## API Dependencies

`GET /api/scales/:scaleId/weight`; shared `evaluateZone`

## Test Expectations

Component tests per zone; E2E

## Technical Notes

—

## Dependencies

### Requires
- `004-weigh-screen-layout-and-recipe-rail` — 2 · Weigh screen layout and recipe rail
- `002-device-integration/002-live-net-weight-reading` — Live net weight with stability
- `004-weighing-station/008-tolerance-evaluation-rules` — Tolerance evaluation and surplus rules

### Enables
- `007-action-keys-confirm-retare-quit` — Action keys: OK, Re-tare, Quit (+ F-keys)
- `010-surplus-panel` — Surplus panel

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

---
id: 004-weigh-screen-layout-and-recipe-rail
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 011-assisted-weighing-station-ui
implemented: true
---

# Story: 004-weigh-screen-layout-and-recipe-rail

**2 · Weigh screen layout and recipe rail** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** the Weigh screen with the recipe rail, component header and scale badge
**So that** I see the whole recipe and exactly which component, lot, container and scale I am using

## Requirements

FR-6, FR-11 (presentation), FR-25 (presentation)

## Acceptance Criteria

- [ ] **Given** a session, **Then** the rail shows "Recipe · Teal 4C", B-24187, "n of 5 components weighed" and rows with swatch, name, code · scale, target and state
- [ ] **Given** a pending row is touched, **Then** it becomes active via the API
- [ ] **Given** the active component, **Then** the header shows name and "code · LOT · CONTAINER · TARE" and the badge "Scale selected / 3 kg precision / automatic"
- [ ] **Given** Sodium Sulphate becomes active, **Then** the badge shows 32 kg floor and units switch to kg

## UI/UX Impact

Prototype `#v-weigh`: `.rail`, `.weigh-head`, `.scale-badge`

## API Dependencies

Session endpoints

## Test Expectations

Component tests; E2E

## Technical Notes

—

## Dependencies

### Requires
- `003-select-batch-screen` — 1 · Select batch screen
- `004-weighing-station/003-component-states-and-activation` — Component states and activation

### Enables
- `005-live-readout-and-tolerance-bar` — Live readout and tolerance bar
- `006-scan-prompts-identity-lot-container` — Scan prompts for dyestuff, lot and container

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

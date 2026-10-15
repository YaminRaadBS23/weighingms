---
id: 006-scan-prompts-identity-lot-container
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 011-assisted-weighing-station-ui
implemented: false
---

# Story: 006-scan-prompts-identity-lot-container

**Scan prompts for dyestuff, lot and container** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to be prompted to scan the dyestuff (and optionally lot and container), or type them
**So that** weighing unlocks only for the right material

## Requirements

FR-7, FR-8, FR-9, FR-34 (presentation)

## Acceptance Criteria

- [ ] **Given** a locked component, **Then** a prompt "Scan dyestuff DYE-4471" is shown and OK is disabled
- [ ] **Given** the correct scan or typed code, **Then** weighing unlocks and the readout starts at 0.0
- [ ] **Given** a wrong code, **Then** "Wrong dyestuff" is shown
- [ ] **Given** the scanner offline, **Then** typed entry works for every prompt

## UI/UX Impact

New prompt within prototype `.weigh-head` area

## API Dependencies

identity/lot/container endpoints; scan delivery

## Test Expectations

Component tests; E2E

## Technical Notes

—

## Dependencies

### Requires
- `004-weigh-screen-layout-and-recipe-rail` — 2 · Weigh screen layout and recipe rail
- `004-weighing-station/004-verify-dyestuff-identity-and-unlock` — Verify dyestuff identity, lot and container, then unlock weighing
- `002-device-integration/006-dummy-scanner-and-scan-delivery` — Dummy scanner and scan delivery

### Enables
- None

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

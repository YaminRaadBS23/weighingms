---
id: 005-validate-dyestuff-lot
unit: 003-batch-and-material
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 008-batch-and-material
implemented: true
---

# Story: 005-validate-dyestuff-lot

**Validate a dyestuff lot** · Unit `003-batch-and-material` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** the lot I scan checked against the component's dyestuff
**So that** the recorded lot is really the material I am using

## Requirements

FR-8, A-09, Q28

## Acceptance Criteria

- [ ] **Given** Yellow RGB (DYE-4471), **When** lot `2026-0387` is validated, **Then** ok
- [ ] **Given** Yellow RGB, **When** lot `2026-0341` (Blue's lot) is validated, **Then** 422 `LOT_MISMATCH`
- [ ] **Given** unknown lot, **When** validated, **Then** 404 `LOT_NOT_FOUND`
- [ ] **Given** a component, **When** no lot is scanned, **Then** the suggested lot is the default

## UI/UX Impact

LOT value in component header; lot scan prompt (006)

## API Dependencies

`POST /api/materials/lots/validate` (or service used by 004) → `OrgatexPort.listLots`

## Test Expectations

Unit + API tests

## Technical Notes

—

## Dependencies

### Requires
- `003-load-recipe-for-batch` — Load the recipe for a batch

### Enables
- `004-weighing-station/004-verify-dyestuff-identity-and-unlock` — Verify dyestuff identity, lot and container, then unlock weighing

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Lot scanned with whitespace | Trimmed |

## Out of Scope

- Lot stock levels

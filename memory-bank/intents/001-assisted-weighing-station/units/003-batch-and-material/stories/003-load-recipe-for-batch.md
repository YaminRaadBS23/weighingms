---
id: 003-load-recipe-for-batch
unit: 003-batch-and-material
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 005-batch-and-material
implemented: true
---

# Story: 003-load-recipe-for-batch

**Load the recipe for a batch** · Unit `003-batch-and-material` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** the recipe and its components loaded when I select a batch
**So that** I can see exactly what to weigh, in which order, with targets and tolerances

## Requirements

FR-5, NFR-2, IR-02

## Acceptance Criteria

- [ ] **Given** B-24187, **When** `GET /api/batches/B-24187/recipe` is called, **Then** shade Teal 4C and five components in sequence with dyestuff (code, name, colour, short name), target, tolerance, unit, bar full-scale and suggested lot are returned
- [ ] **Given** the response, **When** values are compared to the seed, **Then** they match exactly (decimal strings)
- [ ] **Given** OrgaTEX online, **When** measured, **Then** the response time is ≤ 3 s (locally ≪ 1 s)

## UI/UX Impact

Recipe rail header and rows (006)

## API Dependencies

`GET /api/batches/:batchId/recipe` → `OrgatexPort.getRecipe`

## Test Expectations

API tests; mapping tests

## Technical Notes

Recipe snapshot is taken into the session by 004.

## Dependencies

### Requires
- `002-select-batch-with-release-check` — Select a batch by ID with release check

### Enables
- `004-orgatex-unavailable-on-load` — Defined behaviour when OrgaTEX is unavailable on load
- `005-validate-dyestuff-lot` — Validate a dyestuff lot
- `004-weighing-station/002-start-or-resume-weighing-session` — Start or resume a weighing session

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Batch without recipe | 404 RECIPE_NOT_FOUND |

## Out of Scope

- Component states

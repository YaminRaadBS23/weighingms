---
id: 003-component-states-and-activation
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 006-weighing-station
implemented: false
---

# Story: 003-component-states-and-activation

**Component states and activation** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to see each component as done, active or pending and to choose which pending component to weigh
**So that** I always know where I am in the recipe

## Requirements

FR-6, TD-13

## Acceptance Criteria

- [ ] **Given** a new session, **When** read, **Then** component 1 is ACTIVE and 2–5 PENDING
- [ ] **Given** Yellow RGB pending, **When** `POST /api/sessions/:id/components/3/activate` is called, **Then** it becomes ACTIVE and the previously active component returns to PENDING with its unconfirmed weighing discarded
- [ ] **Given** a DONE component, **When** activation is requested, **Then** 409 `COMPONENT_ALREADY_DONE`
- [ ] **Given** any session state, **When** read, **Then** exactly one component is ACTIVE while IN_PROGRESS

## UI/UX Impact

Recipe rail states (✓ actual / WEIGHING / PENDING) and header count (006)

## API Dependencies

`POST /api/sessions/:id/components/:seq/activate`

## Test Expectations

Aggregate tests for invariants

## Technical Notes

—

## Dependencies

### Requires
- `002-start-or-resume-weighing-session` — Start or resume a weighing session

### Enables
- `004-verify-dyestuff-identity-and-unlock` — Verify dyestuff identity, lot and container, then unlock weighing
- `006-assisted-weighing-station-ui/004-weigh-screen-layout-and-recipe-rail` — 2 · Weigh screen layout and recipe rail

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Activate already-active | No-op |

## Out of Scope

- Identity verification

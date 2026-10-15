---
id: 002-sign-in-screen
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 007-assisted-weighing-station-ui
implemented: false
---

# Story: 002-sign-in-screen

**Sign-in screen** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to sign in by scanning or typing my badge
**So that** I can start work

## Requirements

FR-1 (presentation)

## Acceptance Criteria

- [ ] **Given** no operator, **Then** a sign-in prompt is shown and other screens are inaccessible
- [ ] **Given** a valid badge (scanned or typed), **Then** the operator chip shows "Operator R. Karim · Shift A" and Select batch opens
- [ ] **Given** an unknown badge, **Then** an error message is shown

## UI/UX Impact

New screen (not in prototype) styled per ux-guide

## API Dependencies

`POST /api/operators/sign-in`, scan delivery

## Test Expectations

Component test; E2E step

## Technical Notes

—

## Dependencies

### Requires
- `001-app-shell-top-bar-and-status-strip` — App shell, top bar and status strip
- `004-weighing-station/001-operator-sign-in` — Operator sign-in by badge

### Enables
- `003-select-batch-screen` — 1 · Select batch screen

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

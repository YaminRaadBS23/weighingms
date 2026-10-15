---
id: 014-overshoot-detection-and-recovery
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 012-weighing-station
implemented: false
---

# Story: 014-overshoot-detection-and-recovery

**Overshoot detection and recovery** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** over-dosing detected with the surplus shown and a defined way to recover
**So that** an over-dosed component never silently enters the batch

## Requirements

FR-20, FR-21, BR-08, A-08, TD-10 (**rule pending workbook Step 24**)

## Acceptance Criteria

- [ ] **Given** Yellow RGB at 96.4 g, **When** the component state is read, **Then** zone OVER, surplus +2.4 g (+2.6 %), confirm not allowed
- [ ] **Given** OVER, **When** re-tare or override is used, **Then** the existing rules apply (stories 011, 013)
- [ ] **Given** the Step 24 decision, **Then** its acceptance criteria are added here before implementation (placeholder — do not implement compensation before the decision)

## UI/UX Impact

Surplus panel (006, story 010)

## API Dependencies

Recovery endpoint(s) defined after Step 24

## Test Expectations

Tests defined with the Step 24 decision (`STEP-24-overshoot-test`)

## Technical Notes

Prototype's compensation proposal is not adopted (ui-analysis Q-UI-3, Q-UI-4).

## Dependencies

### Requires
- `008-tolerance-evaluation-rules` — Tolerance evaluation and surplus rules
- `011-re-tare` — Re-tare the active component
- `013-supervisor-override` — Supervisor override of an out-of-tolerance weight

### Enables
- `006-assisted-weighing-station-ui/010-surplus-panel` — Surplus panel

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Any recovery not approved at Step 24

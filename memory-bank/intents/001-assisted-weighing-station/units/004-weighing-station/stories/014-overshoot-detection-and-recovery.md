---
id: 014-overshoot-detection-and-recovery
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 012-weighing-station
implemented: true
---

# Story: 014-overshoot-detection-and-recovery

**Overshoot detection and recovery** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** over-dosing detected with the surplus shown and a defined way to recover
**So that** an over-dosed component never silently enters the batch

## Requirements

FR-20, FR-21, BR-08, A-08, TD-10 (**rule decided at workbook Step 24: Option A**)

## Acceptance Criteria

- [ ] **Given** Yellow RGB at 96.4 g, **When** the component state is read, **Then** zone OVER, surplus +2.4 g (+2.6 %), confirm not allowed
- [ ] **Given** OVER, **When** re-tare or override is used, **Then** the existing rules apply (stories 011, 013)
- [ ] **Given** an over-dosed component, **Then** the remaining components' targets and the recipe snapshot are unchanged (no compensation — TD-10)
- [ ] **Given** an over-dosed weight, **When** the operator removes the excess until it is within tolerance, **Then** the zone turns OK and confirm is allowed
- [ ] **Given** 96.4 g and a supervisor override with PIN and reason, **Then** the record is OVERRIDDEN, stores the surplus +2.4 g (+2.6 %), and an OVERRIDE audit event is written
- [ ] **Given** the surplus, **Then** it is weight − target and percent of target, one decimal (the brief's "above the maximum" wording is not used)

## UI/UX Impact

Surplus panel (006, story 010)

## API Dependencies

No recovery endpoint is added: recovery is Re-tare (exists) and supervisor override (story 013)

## Test Expectations

Surplus values, no recipe change after an overdose, override of an over-dose (`STEP-24-overshoot-test`)

## Technical Notes

Prototype's compensation proposal is not adopted (TD-10, `STEP-24-overshoot-decision.md`).

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

- Any recovery not approved at Step 24, including proportional compensation of remaining components

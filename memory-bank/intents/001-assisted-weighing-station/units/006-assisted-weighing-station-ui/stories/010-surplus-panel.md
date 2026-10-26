---
id: 010-surplus-panel
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 013-assisted-weighing-station-ui
implemented: false
---

# Story: 010-surplus-panel

**Surplus panel** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to see the surplus and the approved recovery options when I over-dose
**So that** I know what to do next

## Requirements

FR-20, FR-21 (presentation), TD-10 (decided at Step 24: Option A)

## Acceptance Criteria

- [ ] **Given** 96.4 g on Yellow RGB, **Then** the panel shows "Surplus +2.4 g (+2.6%) — over tolerance" and OK is disabled
- [ ] **Given** the weight returns within tolerance or re-tare, **Then** the panel disappears
- [ ] **Given** the Step 24 decision, **Then** the panel shows the surplus and the approved recovery actions only (remove the excess, Re-tare, Supervisor override) and **no** "would become" compensation table

## UI/UX Impact

Prototype `#surplus` without the compensation table (not adopted — TD-10)

## API Dependencies

session state and live reading; no recovery endpoint

## Test Expectations

Component tests; Step 24 evidence

## Technical Notes

—

## Dependencies

### Requires
- `005-live-readout-and-tolerance-bar` — Live readout and tolerance bar
- `004-weighing-station/014-overshoot-detection-and-recovery` — Overshoot detection and recovery

### Enables
- `013-end-to-end-test-suite` — End-to-end and failure test suite

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

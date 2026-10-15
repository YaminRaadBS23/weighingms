---
id: 008-tolerance-evaluation-rules
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 010-weighing-station
implemented: false
---

# Story: 008-tolerance-evaluation-rules

**Tolerance evaluation and surplus rules** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** the weight classified as under, near, within or over tolerance consistently on screen and on the server
**So that** I get instant guidance and the system enforces exactly the same rule

## Requirements

FR-17, FR-20 (surplus), TD-5, NFR-4

## Acceptance Criteria

- [ ] **Given** Yellow RGB 94.0 g ±0.5 g, **When** evaluated, **Then** 93.4 → UNDER/NEAR (not confirmable), 93.5 → OK, 94.0 → OK, 94.5 → OK, 94.6 → OVER
- [ ] **Given** Yellow RGB, **Then** 84.6 g (= 90 % of target) is NEAR and 84.5 g is UNDER
- [ ] **Given** Sodium Sulphate 24.000 ±0.120 kg, **Then** 23.879 UNDER/NEAR, 23.880 OK, 24.120 OK, 24.121 OVER
- [ ] **Given** 96.4 g, **When** surplus is computed, **Then** +2.4 g and +2.6 % (one decimal)
- [ ] **Given** any inputs, **Then** arithmetic uses decimal (no float artefacts)

## UI/UX Impact

Readout colour, bar zone, status line texts (006)

## API Dependencies

Pure functions `evaluateZone`, `surplus` in `src/shared/domain` (used by UI and server)

## Test Expectations

Exhaustive unit tests at boundaries (workbook Step 22 evidence `STEP-22-tolerance-tests.txt`)

## Technical Notes

Surplus reference point (target vs upper limit, Q-UI-3) may change at Step 24; implement behind one function.

## Dependencies

### Requires
- `001-orgatex-integration/001-project-scaffold` — Runnable project scaffold

### Enables
- `009-confirm-weighing-in-tolerance` — Confirm a weighing inside tolerance
- `014-overshoot-detection-and-recovery` — Overshoot detection and recovery
- `006-assisted-weighing-station-ui/005-live-readout-and-tolerance-bar` — Live readout and tolerance bar

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Weight 0 | UNDER |
| Negative weight | UNDER |

## Out of Scope

- Recovery behaviour

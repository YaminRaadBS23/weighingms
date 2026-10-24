---
id: 007-action-keys-confirm-retare-quit
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 011-assisted-weighing-station-ui
implemented: true
---

# Story: 007-action-keys-confirm-retare-quit

**Action keys: OK, Re-tare, Quit (+ F-keys)** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As an** operator wearing gloves
**I want** large keys and function keys for OK (F1), Re-tare (F2) and Quit (F4)
**So that** I can operate the station quickly without precise touches

## Requirements

FR-18, FR-23, FR-24 (presentation), NFR-10, NFR-12

## Acceptance Criteria

- [ ] **Given** a zone other than OK or an unstable/unavailable scale, **Then** OK is disabled with the reason shown; inside tolerance and stable it is enabled
- [ ] **Given** OK (or F1), **Then** confirm is called and the rail shows ✓ actual, next component active
- [ ] **Given** Re-tare (or F2), **Then** weight resets to 0.0
- [ ] **Given** Quit (or F4), **Then** a confirmation is asked and the operator returns to Select batch
- [ ] **Given** the keys, **Then** each is ≥ 62 × 150 px

## UI/UX Impact

Prototype `.actions`, `.key`

## API Dependencies

confirm, retare, quit endpoints

## Test Expectations

Component tests incl. keyboard; E2E

## Technical Notes

—

## Dependencies

### Requires
- `005-live-readout-and-tolerance-bar` — Live readout and tolerance bar
- `004-weighing-station/009-confirm-weighing-in-tolerance` — Confirm a weighing inside tolerance
- `004-weighing-station/011-re-tare` — Re-tare the active component
- `004-weighing-station/012-quit-and-resume` — Quit safely and resume later

### Enables
- `008-scale-and-device-failure-states` — Scale and device failure states
- `009-supervisor-dialog` — Supervisor dialog for override and scale reselection
- `011-confirm-and-print-screen` — 3 · Confirm & print screen

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

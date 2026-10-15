---
id: 007-dummy-printer
unit: 002-device-integration
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 004-device-integration
implemented: true
---

# Story: 007-dummy-printer

**Dummy ticket printer** · Unit `002-device-integration` · Priority **Must** · User/system value

## User Story

**As a** WeighingMS
**I want** to send a ticket to a printer and get a preview and the printer's state
**So that** tickets can be printed and printer failures handled

## Requirements

DB-4; supports FR-29, FR-30, FR-35

## Acceptance Criteria

- [ ] **Given** READY, **When** `PrinterPort.print(ticket)` is called, **Then** the Dummy Printer stores it and returns PRINTED with a preview
- [ ] **Given** `…/_sim/state {OFFLINE|OUT_OF_PAPER}`, **When** print is called, **Then** `PRINTER_UNAVAILABLE` with the state
- [ ] **Given** any state, **When** `GET /api/printer/status` is called, **Then** READY/OFFLINE/OUT_OF_PAPER
- [ ] **Given** stored tickets, **When** `GET /ext/printer/jobs` is called, **Then** printed jobs are listed (Step 27 evidence)

## UI/UX Impact

Status strip PRINTER; ticket preview (006)

## API Dependencies

`/ext/printer/jobs`, `/ext/printer/_sim/state`; `GET /api/printer/status`; `PrinterPort`

## Test Expectations

Contract tests per state

## Technical Notes

Ticket content is composed by 005.

## Dependencies

### Requires
- `001-orgatex-integration/001-project-scaffold` — Runnable project scaffold

### Enables
- `005-completion-and-ticketing/004-generate-and-print-ticket` — Generate and print the weighing ticket

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Ticket layout

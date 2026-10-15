---
id: 005-printer-unavailable-retry
unit: 005-completion-and-ticketing
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 015-completion-and-ticketing
implemented: false
---

# Story: 005-printer-unavailable-retry

**Printer unavailable: keep ticket and retry** · Unit `005-completion-and-ticketing` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** the ticket kept and a retry offered when the printer fails
**So that** the batch is not held up by a printer problem

## Requirements

FR-35, IR-18

## Acceptance Criteria

- [ ] **Given** printer OFFLINE, **When** a ticket is printed, **Then** the ticket is stored, print status FAILED, 503 `PRINTER_UNAVAILABLE` with state, preview still available
- [ ] **Given** printer READY again, **When** `POST /api/tickets/:id/print` is called, **Then** PRINTED (not marked REPRINT)
- [ ] **Given** a printer failure, **Then** session, records and write-back are unchanged

## UI/UX Impact

"Printer unavailable" + Retry (006)

## API Dependencies

`POST /api/tickets/:id/print`

## Test Expectations

API tests with dummy printer states

## Technical Notes

—

## Dependencies

### Requires
- `004-generate-and-print-ticket` — Generate and print the weighing ticket

### Enables
- `006-assisted-weighing-station-ui/011-confirm-and-print-screen` — 3 · Confirm & print screen

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| OUT_OF_PAPER | Same as OFFLINE with state shown |

## Out of Scope

- Implementation tasks (defined in bolts)

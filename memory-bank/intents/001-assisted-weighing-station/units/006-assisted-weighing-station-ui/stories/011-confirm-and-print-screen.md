---
id: 011-confirm-and-print-screen
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 016-assisted-weighing-station-ui
implemented: false
---

# Story: 011-confirm-and-print-screen

**3 · Confirm & print screen** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** the completion summary, write-back status, ticket printing and next batch
**So that** I can finish the batch and send the container on

## Requirements

FR-26, FR-27, FR-28, FR-29, FR-30, FR-31, FR-35 (presentation)

## Acceptance Criteria

- [ ] **Given** completion, **Then** "Batch B-24187 weighed" with Components weighed, All within tolerance, Total dispensed, Elapsed, Operator and "Written to OrgaTEX CONFIRMED hh:mm:ss" are shown
- [ ] **Given** write-back PENDING, **Then** PENDING + Retry is shown
- [ ] **Given** Print ticket (F1), **Then** `POST /api/tickets` is called and the ticket preview matches the prototype layout with barcode; printer failure shows error + Retry; Reprint is available
- [ ] **Given** Next batch (F3), **Then** the queue is re-fetched and B-24187 shows WEIGHED

## UI/UX Impact

Prototype `#v-done`, `.ticket`

## API Dependencies

summary, consumption, write-back retry, tickets endpoints

## Test Expectations

Component tests; E2E

## Technical Notes

—

## Dependencies

### Requires
- `007-action-keys-confirm-retare-quit` — Action keys: OK, Re-tare, Quit (+ F-keys)
- `005-completion-and-ticketing/002-hold-and-retry-write-back` — Hold write-back as PENDING and retry
- `005-completion-and-ticketing/005-printer-unavailable-retry` — Printer unavailable: keep ticket and retry
- `005-completion-and-ticketing/006-ticket-reprint` — Reprint a ticket marked REPRINT

### Enables
- `013-end-to-end-test-suite` — End-to-end and failure test suite

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

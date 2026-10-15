---
id: 006-ticket-reprint
unit: 005-completion-and-ticketing
intent: 001-assisted-weighing-station
status: draft
priority: should
created: 2026-10-15T12:25:00Z
assigned_bolt: 015-completion-and-ticketing
implemented: false
---

# Story: 006-ticket-reprint

**Reprint a ticket marked REPRINT** · Unit `005-completion-and-ticketing` · Priority **Should** · User/system value

## User Story

**As an** operator
**I want** to reprint a ticket
**So that** a lost or damaged ticket can be replaced without ambiguity

## Requirements

FR-30

## Acceptance Criteria

- [ ] **Given** a PRINTED ticket, **When** `POST /api/tickets/:id/reprint` is called, **Then** a new ticket with identical content plus "REPRINT" is printed and a REPRINT audit event is written
- [ ] **Given** no original ticket, **Then** 404

## UI/UX Impact

Reprint action on Confirm & print (006)

## API Dependencies

`POST /api/tickets/:id/reprint`

## Test Expectations

API tests

## Technical Notes

—

## Dependencies

### Requires
- `004-generate-and-print-ticket` — Generate and print the weighing ticket
- `004-weighing-station/015-audit-trail` — Immutable audit trail

### Enables
- `006-assisted-weighing-station-ui/011-confirm-and-print-screen` — 3 · Confirm & print screen

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

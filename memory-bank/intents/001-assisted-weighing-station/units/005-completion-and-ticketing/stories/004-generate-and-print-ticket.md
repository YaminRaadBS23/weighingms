---
id: 004-generate-and-print-ticket
unit: 005-completion-and-ticketing
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 015-completion-and-ticketing
implemented: true
---

# Story: 004-generate-and-print-ticket

**Generate and print the weighing ticket** · Unit `005-completion-and-ticketing` · Priority **Must** · User/system value

## User Story

**As a** worker carrying the container
**I want** a printed ticket with the batch and what was weighed
**So that** the dyeing machine receives the right container with its record

## Requirements

FR-29, BR-15, IR-16

## Acceptance Criteria

- [ ] **Given** B-24187 completed, **When** `POST /api/tickets {batchId}` is called, **Then** a ticket is stored with "FCI DYEING — WEIGHING TICKET", BATCH, ORDER, MACHINE, SHADE, DATE, OPER., five lines (short name, TGT, ACT, unit), verdict "ALL WITHIN TOLERANCE" (or exceptions), barcode value B-24187, and sent to the printer
- [ ] **Given** printer READY, **Then** print status PRINTED and a preview (with Code 128 barcode SVG) is returned
- [ ] **Given** `GET /api/tickets/:id/preview`, **Then** the same content

## UI/UX Impact

Print ticket F1; ticket preview (006)

## API Dependencies

`POST /api/tickets`, `GET /api/tickets/:id`, `GET /api/tickets/:id/preview` → `PrinterPort.print`

## Test Expectations

Ticket composition tests; API tests (workbook Step 27)

## Technical Notes

Label content is invented (Q18 open).

## Dependencies

### Requires
- `003-completion-summary` — Completion summary
- `002-device-integration/007-dummy-printer` — Dummy ticket printer

### Enables
- `005-printer-unavailable-retry` — Printer unavailable: keep ticket and retry
- `006-ticket-reprint` — Reprint a ticket marked REPRINT

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Label layout configuration

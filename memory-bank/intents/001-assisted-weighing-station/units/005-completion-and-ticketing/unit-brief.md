---
unit: 005-completion-and-ticketing
intent: 001-assisted-weighing-station
phase: inception
status: complete
unit_type: backend
default_bolt_type: ddd-construction-bolt
created: 2026-10-15T12:21:05.000Z
updated: 2026-10-15T12:24:22.000Z
---

# Unit Brief: Completion and Ticketing

## Purpose

Deliver the two outputs of a completed batch reliably: the **actual consumption** reaches OrgaTEX exactly once (even across outages), and a **weighing ticket** accompanies the container (even across printer failures).

## Scope

### In Scope
- **Consumption write-back**: build posting from the session's weighing records (dyestuff, lot, actual + unit, target, result); stable idempotency key per batch completion; post via `OrgatexPort`; state CONFIRMED (with time) / PENDING; manual retry (same key); pending count; batch status WEIGHED; WRITEBACK_RETRY audit
- `POST /api/batches/:batchId/consumption` (Idempotency-Key header), write-back status endpoint
- **Ticket**: compose from session + records (title, batch, order, machine, shade, date, operator, component short name / TGT / ACT / unit, tolerance verdict, barcode of batch ID — Code 128, REPRINT marker); persist; print via `PrinterPort`; preview; printer failure → stored + retry; reprint (REPRINT + audit)
- `POST /api/tickets` (+ reprint, retry print), ticket preview endpoint
- Completion summary data for the Confirm & print screen (components n of n, all within tolerance, total dispensed in kg, elapsed, operator, write-back status)

### Out of Scope
- Deciding the batch is complete (→ 004); printer device (→ 002); OrgaTEX storage (→ 001); presentation (→ 006)

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-27 | OrgaTEX consumption write-back | Must |
| FR-28 | Write-back hold and retry | Must |
| FR-29 | Ticket generation and print / preview | Must |
| FR-30 | Ticket reprint | Should |
| FR-35 | Printer unavailable | Must |

---

## Domain Concepts

### Key Entities
| Entity | Description | Attributes |
|--------|-------------|------------|
| ConsumptionWriteBack (aggregate) | Delivery of a completed batch's consumption | batchId, sessionId, idempotencyKey, lines[], status (PENDING/CONFIRMED), attempts, lastError, confirmedAt |
| Ticket (aggregate) | Printed record that travels with the container | ticketId, batchId, content, barcodeValue, isReprint, printStatus (PRINTED/FAILED/NOT_SENT), printedAt |
| CompletionSummary (read model) | Data for the done screen | n of n, allWithinTolerance, totalDispensedKg, elapsed, operator, writeBack |

### Key Operations
| Operation | Inputs | Outputs |
|-----------|--------|---------|
| postConsumption | completed session | CONFIRMED / PENDING |
| retryWriteBack | batchId | CONFIRMED / PENDING (same key) |
| pendingCount | — | number |
| generateAndPrintTicket | batchId | Ticket + print result |
| retryPrint | ticketId | print result |
| reprintTicket | batchId, operator | Ticket (REPRINT) + audit |
| getSummary | batchId | CompletionSummary |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 6 |
| Must Have | 5 |
| Should Have | 1 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 001-post-consumption-on-completion | Post actual consumption to OrgaTEX on completion | Must | Planned |
| 002-hold-and-retry-write-back | Hold write-back as PENDING and retry | Must | Planned |
| 003-completion-summary | Completion summary | Must | Planned |
| 004-generate-and-print-ticket | Generate and print the weighing ticket | Must | Planned |
| 005-printer-unavailable-retry | Printer unavailable: keep ticket and retry | Must | Planned |
| 006-ticket-reprint | Reprint a ticket marked REPRINT | Should | Planned |

---

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| 001-orgatex-integration | `OrgatexPort.postConsumption`, `setBatchStatus` |
| 002-device-integration | `PrinterPort` |
| 004-weighing-station | Completed session, weighing records, audit |

### Depended By
| Unit | Reason |
|------|--------|
| 006-assisted-weighing-station-ui | Confirm & print screen |

### External Dependencies
None directly (through 001/002).

---

## Technical Context

### Suggested Technology
`modules/completion`; Drizzle tables for write-backs and tickets in `weighingms.db`; `decimal.js` for totals; barcode rendered as SVG (Code 128) for preview.

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| 001, 002, 004 | Ports / services | in-process |
| UI | consumption, tickets, summary | REST/JSON |

### Data Storage
| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Write-backs, tickets | SQLite `weighingms.db` | per batch | append/update status only |

---

## Constraints

- Posting must be idempotent end-to-end (key stored before first send).
- Ticket printing never blocked by a PENDING write-back, and vice versa.

---

## Success Criteria

### Functional
- [ ] Completing B-24187 → `POST /api/batches/B-24187/consumption` 200, Dummy OrgaTEX stores one record with 5 lines
- [ ] OrgaTEX offline → PENDING + count; back online → Retry → CONFIRMED, still one record
- [ ] Ticket for B-24187 lists 5 components TGT/ACT, operator, date, verdict, barcode = B-24187
- [ ] Printer offline → error + retry; preview available; reprint marked REPRINT and audited

### Quality
- [ ] Domain tests for write-back state machine and ticket composition; API tests with fake ports; all acceptance criteria met

---

## Bolt Plan

Planned in workbook Step 12 (`memory-bank/bolts/`).

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| 014-completion-and-ticketing | DDD | 001, 002, 003 | Model and implement the consumption write-back (idempotent, CONFIRMED/PENDING, retry, pending count) and the completion summary. |
| 015-completion-and-ticketing | DDD | 004, 005, 006 | Model and implement ticket composition, printing with preview, printer-failure retry and reprint. |

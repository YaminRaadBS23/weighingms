---
id: 015-audit-trail
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 006-weighing-station
implemented: false
---

# Story: 015-audit-trail

**Immutable audit trail** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As a** supervisor or QA
**I want** every privileged or exceptional action recorded immutably
**So that** any batch can be reconstructed and accountability is clear

## Requirements

FR-37, NFR-8, BR-13, BR-14

## Acceptance Criteria

- [ ] **Given** an override, scale reselection, quit, reprint or write-back retry, **When** it happens, **Then** exactly one audit event (type, actor, detail, timestamp, session) is written
- [ ] **Given** `GET /api/sessions/:id/audit`, **Then** events are returned in order
- [ ] **Given** any attempt, **Then** no endpoint updates or deletes audit events

## UI/UX Impact

None (evidence via API)

## API Dependencies

`GET /api/sessions/:id/audit`; `AuditLog` service used by 004 and 005

## Test Expectations

Domain + API tests

## Technical Notes

—

## Dependencies

### Requires
- `002-start-or-resume-weighing-session` — Start or resume a weighing session

### Enables
- `006-supervisor-scale-reselection` — Supervisor scale reselection
- `012-quit-and-resume` — Quit safely and resume later
- `013-supervisor-override` — Supervisor override of an out-of-tolerance weight
- `005-completion-and-ticketing/006-ticket-reprint` — Reprint a ticket marked REPRINT

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Audit reporting UI (deferred, TD-4)

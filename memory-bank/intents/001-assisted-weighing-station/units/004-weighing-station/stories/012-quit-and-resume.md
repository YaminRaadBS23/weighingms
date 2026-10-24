---
id: 012-quit-and-resume
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 010-weighing-station
implemented: true
---

# Story: 012-quit-and-resume

**Quit safely and resume later** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to quit the batch I am weighing and come back to it later
**So that** I can leave the station safely without losing confirmed work

## Requirements

FR-24, NFR-6, TD-14

## Acceptance Criteria

- [ ] **Given** Yellow RGB unlocked at 50.0 g with Blue/Red done, **When** `POST /api/sessions/:id/quit` is called, **Then** the unconfirmed weighing is abandoned, an ABANDON audit event is written, the session is SUSPENDED and the batch stays WEIGHING
- [ ] **Given** a suspended session, **When** the batch is selected again, **Then** Blue and Red are DONE with their records and Yellow is ACTIVE (locked)
- [ ] **Given** the browser reloads mid-batch, **When** `GET /api/sessions/current` is called, **Then** the in-progress session is resumed

## UI/UX Impact

Quit F4 with confirmation → Select batch (006)

## API Dependencies

`POST /api/sessions/:id/quit`

## Test Expectations

Aggregate + API tests

## Technical Notes

Quit ≠ Re-tare (ui-analysis Q-UI-10).

## Dependencies

### Requires
- `002-start-or-resume-weighing-session` — Start or resume a weighing session
- `015-audit-trail` — Immutable audit trail

### Enables
- `006-assisted-weighing-station-ui/007-action-keys-confirm-retare-quit` — Action keys: OK, Re-tare, Quit (+ F-keys)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Quit with nothing weighed | Allowed; audit records no weight |

## Out of Scope

- Implementation tasks (defined in bolts)

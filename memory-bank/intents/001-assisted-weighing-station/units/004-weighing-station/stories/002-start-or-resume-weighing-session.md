---
id: 002-start-or-resume-weighing-session
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 006-weighing-station
implemented: false
---

# Story: 002-start-or-resume-weighing-session

**Start or resume a weighing session** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** selecting a released batch to start its weighing session, or resume it if one exists
**So that** work on a batch is never lost or duplicated

## Requirements

FR-24 (resume), NFR-6, FR-4, IR-06

## Acceptance Criteria

- [ ] **Given** B-24187 RELEASED and signed in, **When** `POST /api/sessions {batchId}` is called, **Then** a session IN_PROGRESS is created with a recipe snapshot, all components PENDING except the first ACTIVE, and OrgaTEX status becomes WEIGHING
- [ ] **Given** a session already IN_PROGRESS for B-24187, **When** started again, **Then** the existing session is returned (no duplicate)
- [ ] **Given** the server restarts, **When** `GET /api/sessions/current` is called, **Then** the session is returned with the same component states
- [ ] **Given** B-24190 QUEUED, **When** started, **Then** 409 `BATCH_NOT_RELEASED`

## UI/UX Impact

Transition Select batch → Weigh; crumb BATCH · ORDER · MACHINE (006)

## API Dependencies

`POST /api/sessions`, `GET /api/sessions/current`, `GET /api/sessions/:id`; uses 003 services and `OrgatexPort.setBatchStatus`

## Test Expectations

Aggregate tests; API tests incl. restart (fresh app on same DB)

## Technical Notes

WeighingSession is the aggregate root.

## Dependencies

### Requires
- `001-operator-sign-in` — Operator sign-in by badge
- `003-batch-and-material/003-load-recipe-for-batch` — Load the recipe for a batch

### Enables
- `003-component-states-and-activation` — Component states and activation
- `012-quit-and-resume` — Quit safely and resume later
- `015-audit-trail` — Immutable audit trail
- `006-assisted-weighing-station-ui/003-select-batch-screen` — 1 · Select batch screen

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| OrgaTEX offline when setting WEIGHING | Session starts; status update retried later (logged) |

## Out of Scope

- Completion

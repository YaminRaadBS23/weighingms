---
id: 001-operator-sign-in
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 006-weighing-station
implemented: false
---

# Story: 001-operator-sign-in

**Operator sign-in by badge** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to identify myself by scanning or typing my badge
**So that** every weighing I perform is attributed to me

## Requirements

FR-1, BR-19, DB-5, TD-6

## Acceptance Criteria

- [ ] **Given** seeded operator R. Karim (Shift A), **When** his badge ID is submitted to `POST /api/operators/sign-in`, **Then** the operator (name, shift, role) is returned and becomes the station operator
- [ ] **Given** an unknown or inactive badge, **When** submitted, **Then** 401 `OPERATOR_UNKNOWN`
- [ ] **Given** no operator signed in, **When** a session is started, **Then** 401 `NOT_SIGNED_IN`
- [ ] **Given** signed in, **When** `GET /api/operators/current` is called, **Then** the operator is returned

## UI/UX Impact

Sign-in screen; operator chip "Operator R. Karim · Shift A" (006)

## API Dependencies

`POST /api/operators/sign-in`, `GET /api/operators/current`, `POST /api/operators/sign-out`

## Test Expectations

Domain + API tests

## Technical Notes

Seed: operator R. Karim, one supervisor with hashed PIN.

## Dependencies

### Requires
- `001-orgatex-integration/001-project-scaffold` — Runnable project scaffold

### Enables
- `002-start-or-resume-weighing-session` — Start or resume a weighing session
- `006-assisted-weighing-station-ui/002-sign-in-screen` — Sign-in screen

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Supervisor badge at sign-in | Allowed; role SUPERVISOR shown |

## Out of Scope

- Password/SSO

---
unit: 004-weighing-station
bolt: 006-weighing-station
stage: test
status: complete
updated: 2026-10-16T08:57:53Z
---

# Test Report - Weighing Station (bolt 6: operator, session, component states, audit)

## Test Summary

| Category | Passed | Failed | Skipped | Coverage |
|----------|--------|--------|---------|----------|
| Unit (domain aggregate) | 11 | 0 | 0 | not measured |
| Unit / integration (infrastructure: repositories, triggers, PIN hashing, seed) | 10 | 0 | 0 | not measured |
| Integration (application use cases with fake batch service and OrgaTEX port) | 15 | 0 | 0 | not measured |
| API (Fastify inject, in-process Dummy OrgaTEX, restart with real files) | 17 | 0 | 0 | not measured |
| **New in this bolt** | **53** | 0 | 0 | |
| Regression (bolts 001–005) | 200 | 0 | 0 | |
| **Total** | **253** | **0** | **0** | — |

Quality gates: `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run format:check` ✅. Full suite run three times in a row: 253/253 each time.

Coverage percentage is not measured — the project standard (`coding-standards.md`) uses a critical-path list instead of a coverage gate; every acceptance criterion and every aggregate invariant below has a test.

## Acceptance Criteria Validation

| Story | Criteria | Status |
|-------|----------|--------|
| 001-operator-sign-in | R. Karim's badge → operator (name, shift, role) becomes station operator | ✅ |
| 001-operator-sign-in | Unknown or inactive badge → 401 `OPERATOR_UNKNOWN` | ✅ |
| 001-operator-sign-in | No operator → 401 `NOT_SIGNED_IN` on session start | ✅ |
| 001-operator-sign-in | `GET /api/operators/current` returns the operator | ✅ |
| 002-start-or-resume-weighing-session | B-24187: session IN_PROGRESS, recipe snapshot, component 1 ACTIVE, others PENDING, OrgaTEX WEIGHING | ✅ |
| 002-start-or-resume-weighing-session | Started again → same session, no duplicate | ✅ |
| 002-start-or-resume-weighing-session | After server restart → same session and component states | ✅ (real database files, fresh app) |
| 002-start-or-resume-weighing-session | B-24190 QUEUED → 409 `BATCH_NOT_RELEASED` | ✅ |
| 003-component-states-and-activation | New session: component 1 ACTIVE, 2–5 PENDING | ✅ |
| 003-component-states-and-activation | Activate 3 → ACTIVE, previous back to PENDING, unconfirmed data discarded | ✅ |
| 003-component-states-and-activation | DONE component → 409 `COMPONENT_ALREADY_DONE` | ✅ |
| 003-component-states-and-activation | Exactly one ACTIVE while IN_PROGRESS | ✅ (incl. arbitrary activation sequences) |
| 015-audit-trail | Exactly one audit event per recorded action | ✅ (service level; the actions that record events arrive in bolts 009–015) |
| 015-audit-trail | Events listed in order | ✅ (incl. same-timestamp regression) |
| 015-audit-trail | No endpoint or code path updates or deletes audit events | ✅ (no endpoints, no repository methods, database triggers) |
| 003-batch-and-material/004 (carried from bolt 005) | Session in progress keeps working while OrgaTEX is offline | ✅ (resume, read, activate with OrgaTEX offline) |

## Unit Tests

`domain/weighing-session.test.ts` (11): start state; refusal of recipes with no components or gaps; activation moves ACTIVE and discards the previous component's data; activating the active component is a no-op; DONE cannot be activated and is never touched by activation; unknown sequence; actions refused unless IN_PROGRESS; exactly one ACTIVE after arbitrary activation sequences; snapshots are copies and the recipe never changes; OrgaTEX status deferral.

## Integration Tests

- `infrastructure/infrastructure.test.ts` (10): PIN hash format, verification, random salt, documented training PIN; seed loads R. Karim, the supervisor and the inactive badge once; station current operator set/clear; session aggregate round-trip; **database refuses a second open session for a batch**; audit append/list; **UPDATE and DELETE aborted by triggers (ADR-1)**, also via raw SQL; same-timestamp ordering; audit repository exposes only `append` and `listBySession`.
- `application/application.test.ts` (15): sign-in normalisation, refusals, replacement; SessionStarter decision order (NOT_SIGNED_IN before any OrgaTEX call; new start with snapshot and WEIGHING; resume without OrgaTEX; `SESSION_IN_PROGRESS`; `BATCH_NOT_RELEASED` creates nothing; OrgaTEX unreachable → session starts, `DEFERRED`); **two concurrent starts of the same batch → one session, the other resumes**; activation persistence; audit ordering.
- `routes.test.ts` (17): every story criterion through HTTP, the **restart test** and the **OrgaTEX-offline resume test**; OrgaTEX offline blocks only *new* starts (503).

## Security Tests

| Test | Result |
|------|--------|
| Supervisor PIN stored only as scrypt hash; clear PIN absent from hash | ✅ |
| Wrong / missing / malformed hash → verification false | ✅ |
| Inactive badge cannot sign in | ✅ |
| Audit events immutable (repository, API and database levels) | ✅ |

## Performance Tests

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Session start / activation / read | not specified (local, single aggregate) | single-digit milliseconds per request in tests | ✅ |

## Coverage Report

Not measured (see summary). Layers covered: domain (all seven invariants), application (all use cases and decision branches), infrastructure (all repositories, triggers, seed, hashing), presentation (all endpoints, success and error responses).

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| Audit events recorded in the same millisecond were listed in random order (ties broken by random UUID) — violated "events listed in order" | Medium | **Fixed**: ties now broken by insertion order (`rowid`); regression test added |
| Raw-SQL errors are wrapped by Drizzle, hiding the trigger message in `cause` | Low (test harness) | Fixed in the test helper |

## Ready for Operations

- [x] All acceptance criteria met (incl. the criterion carried from bolt 005)
- [ ] Code coverage > 80% — not measured by project standard (critical-path list used instead)
- [x] No critical/high severity issues open
- [x] Performance targets met (none specified beyond local responsiveness)
- [x] Security tests passing

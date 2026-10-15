---
id: 001-project-scaffold
unit: 001-orgatex-integration
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 001-orgatex-integration
implemented: false
---

# Story: 001-project-scaffold

**Runnable project scaffold** · Unit `001-orgatex-integration` · Priority **Must** · Technical enabler

## User Story

**As a** member of the project team
**I want** a runnable TypeScript workspace with the Fastify app factory, Vite UI shell, shared contract types, decimal helpers, central error handler and test runners
**So that** every unit is built, run and tested the same way from the first bolt

## Requirements

Standards: tech-stack, data-stack, coding-standards, api-conventions, system-architecture

## Acceptance Criteria

- [ ] **Given** a fresh clone, **When** `npm install` and `npm run dev` are run, **Then** the server listens on 127.0.0.1 and the UI shell loads in the browser
- [ ] **Given** the server is running, **When** `GET /api/health` is called, **Then** it returns 200 `{ "status": "ok" }`
- [ ] **Given** a route throws a `DomainError`, **When** the request completes, **Then** the response is `{ error: { code, message } }` with the mapped HTTP status
- [ ] **Given** the repository, **When** `npm test`, `npm run lint` and `npm run format:check` are run, **Then** all pass
- [ ] **Given** `src/shared`, **When** a quantity helper adds `"0.1"` and `"0.2"` g, **Then** the result is exactly `"0.3"` g (decimal, not float)

## UI/UX Impact

UI shell only (empty page with design tokens loaded); no prototype screen yet

## API Dependencies

Provides `GET /api/health`; establishes `/api` and `/ext` route prefixes

## Test Expectations

Vitest smoke test of app factory via `fastify.inject`; unit tests for decimal helpers and error handler

## Technical Notes

Technical enabler story (no end-user value on its own) — required because all units share one process (system-architecture). `_sim` route registration gated by environment.

## Dependencies

### Requires
- None

### Enables
- `002-dummy-orgatex-serves-batches-and-recipes` — Dummy OrgaTEX serves batches, recipes and lots
- `002-device-integration/001-dummy-scales-and-scale-api` — Dummy scales and scale listing/status API
- `002-device-integration/006-dummy-scanner-and-scan-delivery` — Dummy scanner and scan delivery
- `002-device-integration/007-dummy-printer` — Dummy ticket printer
- `003-batch-and-material/006-container-master-and-validation` — Container master and validation
- `004-weighing-station/001-operator-sign-in` — Operator sign-in by badge
- `004-weighing-station/008-tolerance-evaluation-rules` — Tolerance evaluation and surplus rules
- `006-assisted-weighing-station-ui/001-app-shell-top-bar-and-status-strip` — App shell, top bar and status strip

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Port already in use | Server exits with a clear message |
| Unknown route | 404 in standard error format |

## Out of Scope

- Any business endpoint

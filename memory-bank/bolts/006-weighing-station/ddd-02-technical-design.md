---
unit: 004-weighing-station
bolt: 006-weighing-station
stage: design
status: complete
updated: 2026-10-16T08:35:06Z
---

# Technical Design - Weighing Station (bolt 6: operator, session, component states, audit)

Implements the approved static model (`ddd-01-domain-model.md`) within the project standards (`tech-stack.md`, `data-stack.md`, `coding-standards.md`, `api-conventions.md`, `system-architecture.md`).

## Architecture Pattern

**Hexagonal (ports & adapters) inside the WeighingMS modular monolith**, as fixed in `system-architecture.md`. The weighing module gets an explicit DDD layering because it is the core domain:

- **Domain** — pure TypeScript: the `WeighingSession` aggregate (with `ComponentWeighing` entities and invariants), `Operator`, `AuditEvent`, value objects, domain errors, repository **interfaces**. No Fastify, no Drizzle, no I/O.
- **Application** — use cases orchestrating the domain: `OperatorIdentification`, `SessionStarter`, `ComponentActivation`, `AuditLog`. Depend on repository interfaces, `BatchService` (batch context) and `OrgatexPort`, plus an injected clock and ID generator.
- **Infrastructure** — Drizzle/SQLite repositories on `weighingms.db`, the seed loader, PIN hashing.
- **Presentation** — Fastify routes under `/api/operators` and `/api/sessions`, mapping to shared contract types.

## Layer Structure

```text
┌──────────────────────────────────────────────────────────────┐
│ Presentation   modules/weighing/routes.ts                    │  /api/operators, /api/sessions
├──────────────────────────────────────────────────────────────┤
│ Application    modules/weighing/application/                 │  OperatorIdentification,
│                                                              │  SessionStarter, ComponentActivation,
│                                                              │  AuditLog
├──────────────────────────────────────────────────────────────┤
│ Domain         modules/weighing/domain/                      │  WeighingSession (aggregate),
│                                                              │  ComponentWeighing, Operator,
│                                                              │  AuditEvent, value objects, errors,
│                                                              │  repository interfaces
├──────────────────────────────────────────────────────────────┤
│ Infrastructure modules/weighing/infrastructure/ + server/db/ │  Drizzle repositories, schema,
│                                                              │  migrations, seed, PIN hashing
└──────────────────────────────────────────────────────────────┘
        ▲ uses BatchService (modules/batches) and OrgatexPort (integrations/orgatex)
```

Files (indicative):

```text
src/shared/weighing.ts                                  API contract types (SessionView, OperatorView, …)
src/server/db/weighingms/schema.ts, migrations/, db.ts  weighingms.db schema, migrations, open/migrate
src/server/modules/weighing/domain/                     weighing-session.ts, operator.ts, audit.ts,
                                                        errors.ts, repositories.ts
src/server/modules/weighing/application/                operator-identification.ts, session-starter.ts,
                                                        component-activation.ts, audit-log.ts
src/server/modules/weighing/infrastructure/             drizzle-*-repository.ts, seed.ts, pin-hash.ts
src/server/modules/weighing/routes.ts
data/seed/station-seed.json                             operators (pin hashes), station
drizzle.weighingms.config.ts                            second Drizzle Kit config
```

## API Design

All bodies JSON; errors use the standard body (`api-conventions.md`).

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/operators/sign-in` | POST | `{ badge: string }` (scanned or typed) | 200 `OperatorView { operatorId, badgeId, name, shift, role }` · 401 `OPERATOR_UNKNOWN` · 400 `VALIDATION_ERROR` |
| `/api/operators/current` | GET | — | 200 `{ operator: OperatorView \| null }` |
| `/api/operators/sign-out` | POST | — | 200 `{ operator: null }` |
| `/api/sessions` | POST | `{ batchId: string }` | **201** `SessionView` (started) · **200** `SessionView` (resumed) · 401 `NOT_SIGNED_IN` · 409 `BATCH_NOT_RELEASED` · 409 `SESSION_IN_PROGRESS` · 404 `BATCH_NOT_FOUND` · 503 `ORGATEX_UNAVAILABLE` (only for a *new* start) |
| `/api/sessions/current` | GET | — | 200 `{ session: SessionView \| null }` — the station's in-progress session |
| `/api/sessions/:sessionId` | GET | — | 200 `SessionView` · 404 `SESSION_NOT_FOUND` |
| `/api/sessions/:sessionId/components/:sequence/activate` | POST | — | 200 `SessionView` · 409 `COMPONENT_ALREADY_DONE` · 409 `SESSION_NOT_IN_PROGRESS` · 404 `COMPONENT_NOT_FOUND` / `SESSION_NOT_FOUND` |
| `/api/sessions/:sessionId/audit` | GET | — | 200 `{ items: AuditEventView[] }` chronological · 404 `SESSION_NOT_FOUND` |

`SessionView`:

```text
{ sessionId, batchId, stationId, status: IN_PROGRESS|SUSPENDED|COMPLETED,
  startedBy: { operatorId, name }, startedAt, updatedAt,
  recipe: { recipeId, version, shade },
  componentCount, doneCount, activeSequence: number|null,
  components: [{ sequence, state: PENDING|ACTIVE|DONE,
                 dyestuff: { code, name, shortName, colourHex, type },
                 target, tolerance, barMax, suggestedLotId }],
  orgatexStatusSync: SYNCED|DEFERRED }
```

`AuditEventView`: `{ eventId, sessionId, type, actor: { operatorId, name }, detail, occurredAt }`.

No update or delete endpoint exists for sessions' history or audit events. `AuditLog.record` is an in-process service; its callers (override, reselection, quit, reprint, write-back retry) arrive in later bolts.

## Data Persistence

New SQLite file **`data/weighingms.db`** (WeighingMS-owned, separate from `orgatex.db`, `data-stack.md`), WAL journal, `synchronous = FULL`, foreign keys on, Drizzle schema + migrations (second Drizzle Kit config).

| Table | Columns | Relationships |
|-------|---------|---------------|
| `operators` | operator_id PK, badge_id UNIQUE, name, shift, role, active (bool), pin_hash (nullable) | — |
| `station_state` | station_id PK, current_operator_id (nullable), signed_in_at (nullable) | current_operator_id → operators |
| `weighing_sessions` | session_id PK (UUID), batch_id, station_id, started_by, status, recipe_snapshot (JSON text), orgatex_status_sync, started_at, updated_at, completed_at (nullable) | started_by → operators; **partial unique index on batch_id WHERE status IN ('IN_PROGRESS','SUSPENDED')** (one open session per batch) |
| `component_weighings` | session_id, sequence, state, activated_at (nullable) — PK (session_id, sequence) | session_id → weighing_sessions |
| `audit_events` | event_id PK (UUID), session_id (nullable), type, actor_id, detail (JSON text), occurred_at | session_id → weighing_sessions; actor_id → operators; **triggers abort any UPDATE or DELETE** |

- The recipe snapshot is stored as JSON in the session row: it is an immutable value object read and written as a whole; quantities inside stay decimal strings.
- `component_weighings` will gain columns in later bolts (identity, lot, container, scale, tare); weighing records get their own table in bolt 010.
- Saving the aggregate = one SQLite transaction updating the session row and all component rows.
- Seed `data/seed/station-seed.json`: station `STN-01`; operators BDG-0417 R. Karim (OPERATOR, Shift A), BDG-0901 Shift Supervisor A (SUPERVISOR, PIN hash), BDG-0999 inactive. Loaded only when `operators` is empty.

## Security Design

| Concern | Approach |
|---------|----------|
| Authentication | Operator identification by badge (training, TD-6). Single station: the signed-in operator is server-side `station_state`, not a browser token — the station UI is the only client and the server binds to 127.0.0.1 (`system-architecture.md`). Starting a session requires a signed-in operator. |
| Authorization | Role carried on the operator (OPERATOR / SUPERVISOR). Supervisor-only actions are verified with a PIN in later bolts; this bolt provides the PIN hash and verification function. |
| Secrets | Supervisor PIN stored as **scrypt** hash with per-record salt (`node:crypto`, no new dependency), compared in constant time. Training PIN documented in the README training section; never logged. |
| Data integrity | Audit events immutable at three levels: no repository method, no endpoint, and database triggers that abort UPDATE/DELETE (NFR-8). |

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| NFR-5 Durability | Aggregate saved in a synchronous SQLite transaction with WAL + `synchronous = FULL` before the response is sent. |
| NFR-6 Resume | Sessions and component states persisted; `GET /api/sessions/current` rebuilds the aggregate from the database after restart. |
| NFR-8 Immutability | Audit triggers + no update/delete paths. |
| NFR-14 Privileged actions | Hashed PIN, constant-time compare, never logged. |
| Offline continuity (FR-36, TD-1, carried criterion) | Resume uses only `weighingms.db` (recipe snapshot) — no OrgaTEX call; OrgaTEX WEIGHING update failure marks `orgatex_status_sync = DEFERRED` and does not block the start. |
| Performance | All operations are single-row/aggregate SQLite reads/writes (sub-millisecond); no N+1 beyond five component rows. |
| Testability | Clock and ID generator injected; tests use `:memory:` databases and, for the restart test, a temporary file reopened by a fresh app. |

## Error Handling

| Error Type | Code | Response |
|------------|------|----------|
| Unknown / inactive badge | `OPERATOR_UNKNOWN` | 401 |
| No operator signed in at session start | `NOT_SIGNED_IN` | 401 |
| Batch not weighable (QUEUED / WEIGHED / no recipe) | `BATCH_NOT_RELEASED` | 409 (existing) |
| Another batch in progress at the station | `SESSION_IN_PROGRESS` | 409, details: `{ sessionId, batchId }` |
| Session unknown | `SESSION_NOT_FOUND` | 404 |
| Session not in progress | `SESSION_NOT_IN_PROGRESS` | 409 |
| Component sequence unknown | `COMPONENT_NOT_FOUND` | 404 |
| Component already done | `COMPONENT_ALREADY_DONE` | 409 |
| OrgaTEX unreachable for a new start (release check) | `ORGATEX_UNAVAILABLE` | 503 (existing) |
| Malformed request | `VALIDATION_ERROR` | 400 |

Domain errors are `DomainError` subclasses in the weighing domain; the central handler maps them.

## External Dependencies

| Service | Purpose | Integration |
|---------|---------|-------------|
| `BatchService` (batch context) | release check, recipe for the snapshot | in-process |
| `OrgatexPort` | batch status WEIGHING at session start | in-process port → Dummy OrgaTEX HTTP |
| `weighingms.db` | persistence | Drizzle + better-sqlite3 |

## ADR candidates (for Stage 3)

1. Recipe snapshot stored as one JSON column instead of normalised rows.
2. Audit immutability enforced by database triggers (beyond application code).
3. Station-level server-side sign-in state instead of per-client tokens.
4. Supervisor PIN hashing with Node's built-in scrypt.
5. "One batch in progress per station" invariant (affects UI flow until Quit exists).

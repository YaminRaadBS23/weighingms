---
unit: 004-weighing-station
bolt: 010-weighing-station
stage: design
status: complete
updated: 2026-10-24T17:48:03Z
---

# Technical Design - Weighing Station (bolt 10: tolerance, confirmation, progression, re-tare, quit)

Implements the approved static model (`ddd-01-domain-model.md`) within the project standards (`tech-stack.md`, `data-stack.md`, `coding-standards.md`, `api-conventions.md`, `system-architecture.md`) and the decisions ADR-1..6. It extends the layering of bolts 006 and 009; no new module.

## Architecture Pattern

Same hexagonal DDD layering. What is new, layer by layer:

- **Shared, pure rule** — `src/shared/domain/tolerance.ts`: `toleranceBand`, `evaluateZone`, `surplus`, `isConfirmable`. Exact decimals, no I/O, used by the server (decides) and later by the UI (displays) — the two can never disagree. The surplus reference point is one function (Step 24 may change it).
- **Domain** — `WeighingSession` gains `confirm`, `complete`, `retare`, `suspend`, `resume`; new `WeighingRecord` (own immutable aggregate with a builder) and errors. The aggregate is still pure: it receives the measured reading as an argument.
- **Application** — new `ComponentConfirmation` (confirm, complete), `ComponentReTare`, `SessionSuspension` (quit); `SessionStarter` also resumes a suspended session. Ports: `ScalePort` (scale info, one fresh `read`, `tare`), `ComponentPreparation` (scale for the next component), `AuditLog`.
- **Infrastructure** — migration `0004`: `weighing_records` with immutability triggers (same technique as ADR-1); `DrizzleWeighingRecordRepository`.
- **Presentation** — five new endpoints; `SessionView` gains per-component `confirmed` and `completedAt`.

```text
Presentation   routes.ts ─ confirm | retare | quit | complete | records
Application    ComponentConfirmation ── ScalePort.getScale / read
               ComponentReTare       ── ScalePort.getScale / tare
               SessionSuspension     ── AuditLog (ABANDON), best-effort ScalePort.read
               SessionStarter (resume), ComponentPreparation.assignScale (next component)
Domain         WeighingSession.confirm / complete / retare / suspend / resume
               WeighingRecord + builder, errors, WeighingRecordRepository (interface, no update/delete)
Shared         tolerance.ts (pure)
Infrastructure drizzle record repository, migration 0004 (+ triggers)
```

Files (indicative):

```text
src/shared/domain/tolerance.ts (+ .test.ts)               pure rule
src/shared/weighing.ts                                    + WeighingRecordView, ToleranceZone, ConfirmResponse,
                                                            component.confirmed, session.completedAt
src/shared/errors.ts, src/server/modules/weighing/domain/errors.ts
                                                          + TOLERANCE_VIOLATION, READING_UNSTABLE,
                                                            BATCH_INCOMPLETE, SESSION_COMPLETED
src/server/modules/weighing/domain/weighing-record.ts     record + builder
src/server/modules/weighing/domain/weighing-session.ts    confirm / complete / retare / suspend / resume
src/server/modules/weighing/domain/repositories.ts        + WeighingRecordRepository
src/server/modules/weighing/application/component-confirmation.ts, component-retare.ts, session-suspension.ts
src/server/modules/weighing/application/session-starter.ts   (resume)
src/server/modules/weighing/application/context.ts, module.ts, routes.ts
src/server/modules/weighing/infrastructure/drizzle-repositories.ts
src/server/db/weighingms/schema.ts, migrations/0004_weighing_records.sql
```

## API Design

All bodies JSON; errors use the standard body. As in ADR-5, a call is either **refused** (HTTP error, nothing changed) or **accepted** (200). None of the new commands takes a weight.

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/sessions/:id/components/:seq/confirm` | POST | none | 200 `ConfirmResponse { record, session }` · 409 `COMPONENT_ALREADY_DONE` / `COMPONENT_NOT_ACTIVE` / `IDENTITY_NOT_VERIFIED` / `READING_UNSTABLE` / `SESSION_COMPLETED` / `SESSION_NOT_IN_PROGRESS` · 422 `TOLERANCE_VIOLATION` / `SCALE_CALIBRATION_EXPIRED` · 503 `SCALE_UNAVAILABLE` · 401 `NOT_SIGNED_IN` · 404 · 400 |
| `/api/sessions/:id/components/:seq/retare` | POST | none | 200 `SessionView` (new `tareApplied`) · 409 `COMPONENT_ALREADY_DONE` / `COMPONENT_NOT_ACTIVE` / `IDENTITY_NOT_VERIFIED` / `SESSION_COMPLETED` · 422 `SCALE_CALIBRATION_EXPIRED` · 503 `SCALE_UNAVAILABLE` (state unchanged) |
| `/api/sessions/:id/quit` | POST | none | 200 `SessionView` (status SUSPENDED) · 409 `SESSION_NOT_IN_PROGRESS` / `SESSION_COMPLETED` · 401 `NOT_SIGNED_IN` · 404 |
| `/api/sessions/:id/complete` | POST | none | 200 `SessionView` (COMPLETED; idempotent) · 422 `BATCH_INCOMPLETE` (details: done / total) · 409 `SESSION_NOT_IN_PROGRESS` (suspended) · 404 |
| `/api/sessions/:id/records` | GET | — | 200 `{ items: WeighingRecordView[] }` in component order · 404 |
| `/api/sessions` | POST | `{ batchId }` | unchanged contract; a SUSPENDED session of the batch is now **resumed**: 200, status IN_PROGRESS, lowest unfinished component ACTIVE and locked · 409 `SESSION_IN_PROGRESS` if another batch is in progress |

`WeighingRecordView`:

```text
{ recordId, sessionId, batchId, sequence,
  dyestuff: { code, name },
  actual: Quantity            as measured, in the scale's unit
  target, toleranceLower, toleranceUpper: Quantity     in the recipe's unit (snapshot)
  lotId, containerId, tare: Quantity, scaleId,
  operator: { operatorId, name },
  confirmedAt, result: IN_TOLERANCE,
  surplus: { amount: Quantity, percent: string } | null }
```

`SessionView` additions: `completedAt: string | null`; per component `confirmed: { recordId, actual: Quantity, result, confirmedAt } | null` (the rail's "✓ 94.2"). There is no endpoint that updates or deletes a record (a PUT/PATCH/DELETE answers 404/405).

`TOLERANCE_VIOLATION` details: `{ zone, weight, lower, upper }`, so the UI can show why without re-reading.

### Flows

**Confirm** (under the per-session lock, ADR-6): signed-in operator → load session → active, unlocked component → scale usable → **one** `ScalePort.read` → stable? → zone OK? → build record (actual = the reading as returned) → mark DONE, activate the next pending component or complete the session → assign the next component's scale (`ComponentPreparation.assignScale`, in memory) → **one transaction**: append record + save session → respond. If anything before the transaction fails, nothing was written.

**Re-tare**: signed-in operator (as for every component action) → active, unlocked component → scale usable → `tare` (no container hint: the operator has emptied the container, O-4) → replace `tareApplied` → save.

**Quit**: signed-in operator → in-progress session → best-effort scale read for the audit detail (failure or locked component → `weight: null`) → `suspend` (active component back to PENDING, preparation and scale cleared) → **one transaction**: save session + audit `ABANDON`.

**Resume** (inside start): suspended session found → ADR-3 check → `resume` → assign the scale of the lowest pending component → save → 200.

## Data Persistence

Migration `0004_weighing_records.sql` adds:

| Table | Columns | Notes |
|-------|---------|-------|
| `weighing_records` | record_id PK (UUID), session_id → weighing_sessions, batch_id, sequence, dyestuff_code, dyestuff_name, actual_value/unit, target_value/unit, tol_lower_value/unit, tol_upper_value/unit, lot_id, container_id, tare_value/unit, scale_id, operator_id → operators, confirmed_at, result, surplus_value/unit/percent (nullable, filled from bolt 012) | **unique (session_id, sequence)** — a second record for a component is impossible even by a bug; **triggers abort any UPDATE or DELETE** (as ADR-1 for audit events) |

- All quantities are decimal text with a unit; no REAL columns.
- `weighing_sessions.completed_at` already exists and is now set.
- Saving a confirmation = one SQLite transaction (record insert + session row + component rows), WAL, `synchronous = FULL`: durable before the response is sent (NFR-5).
- A confirmed component's preparation and scale columns are cleared (its facts live in the record); the component row keeps state DONE.
- Existing databases need no data change (no component was ever DONE before this bolt).

## Security Design

| Concern | Approach |
|---------|----------|
| Client-supplied weight (BR-07, AC-04) | There is no weight parameter anywhere. The decision uses the server's own scale reading; a crafted request cannot change it. |
| Immutability (NFR-8) | No repository method, no endpoint, and database triggers; unique (session, sequence). |
| Attribution (NFR-9) | The record stores the operator signed in at confirmation (ADR-2) and the scale used; `NOT_SIGNED_IN` blocks confirm, quit. |
| Replays / double clicks | Confirm is serialised per session (ADR-6); the second request meets a DONE component → 409. |
| Information in errors | `TOLERANCE_VIOLATION` reveals only the weight, zone and limits the operator already sees. |

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| NFR-4 Exact arithmetic | Band, zone and surplus with `decimal.js` after unit conversion; boundary tests in g and kg. |
| NFR-5 Durability | Single transaction with record + state; the response is sent after commit; restart test with real files. |
| NFR-6 Resume | Suspended and completed sessions persist; reload uses `/sessions/current` (in progress) or starting the batch again (suspended). |
| TD-9 Stable confirm | `stable` of the same reading that is judged; unstable → 409, the UI retries. |
| TD-1 Offline | Confirm, re-tare, quit, resume and completion make **no OrgaTEX call**; they work with OrgaTEX offline. |
| Performance | Confirm = scale info + one read + one transaction (< 50 ms with the dummies). |
| Observability (IR-09) | Log events `component-confirmed`, `confirmation-refused` (with reason), `batch-completed`, `component-retared`, `weighing-abandoned`, `session-suspended`, `session-resumed`; never a PIN, weights and ids only. |
| Testability | Clock, ids and scale injected; Dummy Scale with `_sim/weight` places exact weights; `ManualClock` controls stability. |

## Error Handling

| Error Type | Code | HTTP |
|------------|------|------|
| Weight outside the OK zone | `TOLERANCE_VIOLATION` | 422 (details: zone, weight, limits) |
| Reading not stable yet | `READING_UNSTABLE` | 409 |
| Scale not connected | `SCALE_UNAVAILABLE` | 503 (existing) |
| Scale calibration expired | `SCALE_CALIBRATION_EXPIRED` | 422 (existing) |
| Component locked | `IDENTITY_NOT_VERIFIED` | 409 (existing) |
| Component not active / already done | `COMPONENT_NOT_ACTIVE` / `COMPONENT_ALREADY_DONE` | 409 |
| Components still open at completion | `BATCH_INCOMPLETE` | 422 (details: done, total) |
| Action on a completed session | `SESSION_COMPLETED` | 409 |
| Session not in progress (suspended) | `SESSION_NOT_IN_PROGRESS` | 409 (existing) |

## Decisions that need an ADR (Stage 3)

- **A — The server measures: confirmation is a command without a weight.** The weight that is judged and recorded is a fresh server-side scale reading; the record stores it as measured (the scale's unit and resolution), while target and limits are snapshotted in the recipe's unit. *Alternatives:* accept the UI's displayed weight (rejected: trivially forged, violates FR-18); accept it and compare with a server reading within a margin (rejected: two truths, flaky at 10 Hz).
- **B — Completion is automatic at the last confirmation and makes no OrgaTEX call; WEIGHED is set by the write-back (bolt 014).** Approved as O-1/O-2 in the model; recorded so bolts 014 and 011 build on it. *Alternatives:* a separate operator "complete" step; setting WEIGHED at completion (both rejected, see model).
- Records follow ADR-1 (triggers) and need no new ADR.

## Testing approach (feeds the Test stage)

| Level | What |
|-------|------|
| Pure rule | `evaluateZone` at every boundary: 93.4 / 93.5 / 94.0 / 94.5 / 94.6 g; 84.5 (UNDER) / 84.6 (NEAR); 23.879 / 23.880 / 24.120 / 24.121 kg; 0, negative; mixed g/kg; `surplus` 96.4 g → +2.4 g, +2.6 %; decimal exactness (0.1 + 0.2 cases); output saved as `STEP-22-tolerance-tests.txt` |
| Aggregate | confirm → DONE, next ACTIVE; last confirm → COMPLETED; DONE not re-confirmable; complete with open components → `BATCH_INCOMPLETE`; completed refuses everything; retare replaces tare; suspend/resume states; full five-component run |
| Application (fake scale) | decision order of confirm; each refusal writes nothing; record fields from the reading and the snapshot; client cannot influence weight; atomicity (record insert failure rolls back the state change; audit failure rolls back the quit); double confirm under the lock; quit weight best-effort; resume ADR-3 check |
| Repository | record round-trip as decimal text; unique (session, sequence); UPDATE/DELETE aborted by the triggers; list order |
| API (real dummies) | Yellow 94.2 g confirm → record with all fields, `GET …/records` (`STEP-25-transaction.json`); 93.4 / 94.6 refused; 93.5 / 94.5 accepted; unstable (`_sim` just-changed weight) → 409; scale offline → 503; locked → 409; expired → 422; five-component progression Blue → Red → Yellow → Sodium → Soda Ash with correct scales; `BATCH_INCOMPLETE` at 4/5; auto completion; `SESSION_COMPLETED`; re-tare (50.0 g → net 0.0 g); quit/resume with Blue and Red DONE; restart durability with real files; OrgaTEX offline throughout |
| Regression | all 505 tests; typecheck, lint, format |

## Out of scope in this bolt

Overshoot recovery and supervisor override (bolt 012 — everything outside zone OK is refused here), OrgaTEX write-back, WEIGHED status, summary (bolt 014), ticket (bolt 015), the Weigh screen, confirmation button and Quit dialog (bolt 011 and later).

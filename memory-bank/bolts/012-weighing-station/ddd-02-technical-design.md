---
unit: 004-weighing-station
bolt: 012-weighing-station
stage: design
status: complete
updated: 2026-10-26T09:00:00Z
---

# Technical Design - Weighing Station (bolt 12: supervisor override and the Step 24 overshoot rule)

Implements the approved static model (`ddd-01-domain-model.md`) within the project standards and the decisions ADR-1..8. It extends the layering of bolts 006, 009 and 010; no new module, no new port.

## Architecture Pattern

Same hexagonal DDD layering. What is new, layer by layer:

- **Shared, pure rule** — `src/shared/domain/tolerance.ts` gains `isOverridable(zone, weight)` (zone ≠ OK and weight > 0). `surplus()` is reused unchanged (reference = target, TD-10).
- **Domain** — `WeighingRecord` gains an optional `override` (supervisor, reason, zone, time); `buildRecord` accepts it and then sets `result = OVERRIDDEN` and the surplus (only for an OVER weight). Three new errors. `WeighingSession` needs **no change**: an overridden confirmation uses the existing `confirm()`.
- **Application** — a small new `ComponentMeasurement` takes the steps that confirm, override and evaluation all share (signed-in check aside): active and unlocked component, scale usable, **one fresh reading**. `ComponentConfirmation` is refactored to use it (behaviour unchanged, its tests are the safety net). New `ComponentOverride` and read-only `ComponentEvaluation`.
- **Infrastructure** — migration `0006`: four nullable override columns on `weighing_records`; migration `0007`: an insert-time consistency trigger. The existing immutability triggers already cover the new columns.
- **Presentation** — two new endpoints; `WeighingRecordView` gains `override`.

```text
Presentation   routes.ts ─ override | evaluation
Application    ComponentOverride    ── SupervisorAuthorisationService, ComponentMeasurement, AuditLog (OVERRIDE)
               ComponentEvaluation  ── ComponentMeasurement (read-only)
               ComponentConfirmation ─ ComponentMeasurement   (refactor)
Domain         WeighingRecord.override + buildRecord(override?)   errors: REASON_REQUIRED,
               OVERRIDE_NOT_NEEDED, NOTHING_TO_OVERRIDE
Shared         tolerance.ts: isOverridable (pure)
Infrastructure drizzle record repository (override columns), migrations 0006 + 0007
```

Files (indicative):

```text
src/shared/domain/tolerance.ts (+ test)                   isOverridable
src/shared/weighing.ts                                    RecordResult + OVERRIDDEN, OverrideView, OverrideRequest,
                                                          ComponentEvaluationResponse, WeighingRecordView.override
src/shared/errors.ts, domain/errors.ts                    + REASON_REQUIRED, OVERRIDE_NOT_NEEDED, NOTHING_TO_OVERRIDE
domain/weighing-record.ts                                 override + buildRecord
application/component-measurement.ts                      shared measuring steps
application/component-override.ts, component-evaluation.ts
application/component-confirmation.ts                     uses ComponentMeasurement
module.ts, routes.ts                                      wiring, endpoints, toRecordView
src/server/db/weighingms/schema.ts, migrations/0006_*.sql, 0007_*.sql
infrastructure/drizzle-repositories.ts                    map override columns
```

## API Design

As in ADR-5/ADR-7: a call is either **refused** (HTTP error, nothing changed) or **accepted** (200). No command carries a weight.

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/sessions/:id/components/:seq/override` | POST | `{ supervisorBadge, pin, reason }` | 200 `ConfirmResponse { record (OVERRIDDEN), session }` · 400 `VALIDATION_ERROR` (missing badge/PIN, reason over 500) / `REASON_REQUIRED` · 401 `NOT_SIGNED_IN` · 403 `NOT_AUTHORISED` · 409 `OVERRIDE_NOT_NEEDED` / `NOTHING_TO_OVERRIDE` / `READING_UNSTABLE` / `IDENTITY_NOT_VERIFIED` / `COMPONENT_NOT_ACTIVE` / `COMPONENT_ALREADY_DONE` / `SESSION_COMPLETED` / `SESSION_NOT_IN_PROGRESS` · 422 `SCALE_CALIBRATION_EXPIRED` · 503 `SCALE_UNAVAILABLE` · 404 |
| `/api/sessions/:id/components/:seq/evaluation` | GET | — | 200 `ComponentEvaluationResponse` · 409 `IDENTITY_NOT_VERIFIED` / `COMPONENT_NOT_ACTIVE` / `COMPONENT_ALREADY_DONE` / `SESSION_*` · 422 `SCALE_CALIBRATION_EXPIRED` · 503 `SCALE_UNAVAILABLE` · 404 |

```text
ComponentEvaluationResponse = {
  weight: Quantity, stable: boolean,
  zone: 'UNDER' | 'NEAR' | 'OK' | 'OVER',
  lower: Quantity, upper: Quantity,                  the band, in the recipe's unit
  surplus: { amount: Quantity, percent: string } | null,     only when zone is OVER
  confirmable: boolean,      stable ∧ zone OK
  overridable: boolean       stable ∧ weight > 0 ∧ zone ≠ OK
}
OverrideView = { supervisor: { operatorId, name }, reason, zone: 'UNDER'|'NEAR'|'OVER', authorisedAt }
WeighingRecordView.override: OverrideView | null          (null ⇔ result IN_TOLERANCE)
```

The evaluation does **not** require a signed-in operator (it is a read, like the weight endpoint and `GET /sessions/:id`); the override does. Evaluation of a locked component answers `IDENTITY_NOT_VERIFIED`: before the tare, a reading means nothing.

### Flows

**Override** — shape check (`supervisorBadge`, `pin`, non-blank `reason`, reason ≤ 500) → signed-in operator → **supervisor authorised** (outside the session lock; no scale access has happened) → under the per-session lock (ADR-6): load → `ComponentMeasurement.measure` (in progress, active, unlocked, scale usable, one fresh reading, connected) → unstable → `READING_UNSTABLE` → weight ≤ 0 → `NOTHING_TO_OVERRIDE` → zone OK → `OVERRIDE_NOT_NEEDED` → build the OVERRIDDEN record (surplus if OVER) → `session.confirm()` → next component's scale assigned → **one transaction**: append record + save session + audit `OVERRIDE`.

**Evaluation** — load → measure (same steps) → zone, surplus, `confirmable`, `overridable`. No lock needed beyond a plain read; nothing is written.

**Recovery (Step 24)** — no code: the operator removes the excess (the live weight changes, the zone follows) or uses the existing Re-tare.

## Data Persistence

Migration `0006` (generated by drizzle-kit) adds to `weighing_records`:

| Column | Type | Notes |
|--------|------|-------|
| `override_supervisor_id` | text → operators, **nullable** | set ⇔ the record is OVERRIDDEN |
| `override_reason` | text, nullable | trimmed text as entered |
| `override_zone` | text, nullable | UNDER \| NEAR \| OVER at the time of the override |
| `override_at` | text, nullable | ISO timestamp (equals the confirmation time) |

Migration `0007` (custom SQL, like 0001 and 0005) adds a `BEFORE INSERT` trigger that aborts an insert unless `(result = 'OVERRIDDEN') = (override_supervisor_id IS NOT NULL)` and, for an override, the reason is non-empty and the zone is one of the three. SQLite cannot add a CHECK to an existing table, so a trigger is the equivalent. The immutability triggers of `0005` apply to every column, new ones included. Existing databases need no data change (all existing rows are IN_TOLERANCE with null override columns).

## Security Design

| Concern | Approach |
|---------|----------|
| Who may override (BR-13, AC-06, TD-6) | `SupervisorAuthorisationService` (bolt 009): active supervisor badge **and** correct PIN; one `NOT_AUTHORISED` for every failure; PIN hashed with scrypt and verified even for an unknown badge. An operator's own PIN is not accepted unless that operator holds the supervisor role. |
| No weight from the client (BR-07) | The override carries only credentials and a reason; the weight is a server-side reading (ADR-7). |
| Authorise before measuring | A failed authorisation never causes a scale access, so the response says nothing about the scale. |
| PIN handling | Never logged, never stored, never echoed; request bodies are not logged. The reason is not logged either (free text); it is in the audit event and the record. |
| Immutability (NFR-8) | Override facts are part of the immutable record; the `OVERRIDE` audit event is append-only (ADR-1). |
| Brute force | No lock-out (known gap, O-7); each failure is logged with the badge entered. |
| Input validation | Reason trimmed, 1–500 characters; badge and PIN must be non-empty strings. |

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| NFR-4 Exact arithmetic | Surplus and zone use the existing decimal functions; boundaries tested in g and kg. |
| NFR-5 Durability | Record, session and audit event in one SQLite transaction; response after commit. |
| FR-37 / NFR-14 Audit | `OVERRIDE` event: actor = supervisor; detail = `{ sequence, dyestuffCode, recordId, actual, target, zone, surplus, reason, operatorId }`. |
| TD-1 Offline | Override and evaluation make **no OrgaTEX call**. |
| Observability (IR-09) | Log events `override-authorised` (ids, zone, no reason), `override-refused` (reason code), `supervisor-authorisation-failed` (existing). |
| Performance | Authorisation (scrypt, tens of ms) + scale info + one read + one transaction. |
| Testability | Clock, ids, PIN verifier and scale injected; Dummy Scale `_sim/weight` places exact weights; training supervisor BDG-0901 / PIN 2580. |

## Error Handling

| Error Type | Code | HTTP |
|------------|------|------|
| Empty or whitespace-only reason | `REASON_REQUIRED` | 400 |
| Bad credentials, not a supervisor, inactive | `NOT_AUTHORISED` | 403 (existing) |
| Weight within the band | `OVERRIDE_NOT_NEEDED` | 409 (details: zone, weight, limits) |
| Weight zero or negative | `NOTHING_TO_OVERRIDE` | 409 |
| Reading not stable | `READING_UNSTABLE` | 409 (existing) |
| Scale not connected / expired | `SCALE_UNAVAILABLE` / `SCALE_CALIBRATION_EXPIRED` | 503 / 422 (existing) |
| Component locked / not active / done; session state | existing codes | 409 |

## Decisions that need an ADR (Stage 3)

- **ADR-9 — Override facts live on the immutable weighing record (nullable columns), with a consistency trigger.** *Alternatives:* a separate `overrides` table joined to the record (more tables and joins; the record would not be self-contained for the ticket and write-back); keeping the facts only in the audit event (the audit trail is for investigation — records must stand on their own and the audit detail is free-form JSON); a JSON text column (not queryable, not constrained). *Consequences:* a self-contained record, a simple trigger instead of a CHECK, four more columns.
- Not an ADR: the Step 24 rule itself is TD-10 (`STEP-24-overshoot-decision.md`); `ComponentMeasurement` is an internal refactor; the evaluation endpoint is read-only and follows ADR-7.

## Testing approach (feeds the Test stage)

| Level | What |
|-------|------|
| Pure rule | `isOverridable`: UNDER/NEAR/OVER → true when weight > 0, OK → false, weight 0 or negative → false; `surplus` at 96.4 g (+2.4 g, +2.6 %), in kg; output saved as `STEP-24-overshoot-test.txt` |
| Domain | `buildRecord` with an override → OVERRIDDEN, surplus only for OVER, limits snapshot unchanged; without → as before |
| Application (fake scale, fake PIN verifier) | decision order; each refusal writes nothing (no record, no audit, session unchanged); every reason code; supervisor checked **before** the scale is read; unstable → refused; weight 0 → refused; OK → `OVERRIDE_NOT_NEEDED`; under, near and over each accepted; atomicity (audit failure rolls back the record and state); no other component's target changes; evaluation values for 0, 93.4, 94.0, 96.4 g; the refactored confirm behaves as before |
| Repository | override round-trip; trigger rejects OVERRIDDEN without override and an override on IN_TOLERANCE; UPDATE/DELETE still aborted |
| API (real dummies) | Yellow 93.0 g with BDG-0901 / 2580 and a reason → record + audit + DONE + next ACTIVE; 96.4 g → surplus +2.4 g (+2.6 %); empty reason 400; wrong PIN and operator badge 403; 94.0 g 409; 0 g 409; unstable 409; evaluation at 96.4 g; recipe/targets unchanged afterwards; `GET …/records` and `GET …/audit` show the facts; restart durability; OrgaTEX offline |
| Regression | all 697 tests; typecheck, lint, format |

## Out of scope in this bolt

The supervisor dialog, the "OVERRIDE REQUESTED" state, the surplus panel and the exception banners (bolt 013); OrgaTEX write-back of the OVERRIDDEN flag and the ticket (bolts 014, 015); PIN lock-out (hardening).

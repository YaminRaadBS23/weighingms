---
unit: 004-weighing-station
bolt: 009-weighing-station
stage: design
status: complete
updated: 2026-10-23T15:26:40Z
---

# Technical Design - Weighing Station (bolt 9: component preparation)

Implements the approved static model (`ddd-01-domain-model.md`) within the project standards (`tech-stack.md`, `data-stack.md`, `coding-standards.md`, `api-conventions.md`, `system-architecture.md`). It extends the layering of bolt 006 — domain, application, infrastructure, presentation — and adds no new module.

## Architecture Pattern

Same hexagonal DDD layering as bolt 006. What is new, layer by layer:

- **Shared, pure rule** — `src/shared/domain/scale-selection.ts`: `scaleRequirement`, `isScaleUsable`, `selectScale`, `fitsCapacity`. No I/O, usable by server and UI, unit-tested at the boundaries (story 005 asks for a pure rule there). The calibration test currently inside `modules/scales/routes.ts` moves into this file and the routes import it, so there is exactly one definition of "expired".
- **Domain** — `WeighingSession` / `ComponentWeighing` gain scale assignment and preparation data with the operations of the model (invariants 8–15). The aggregate takes **decisions as arguments** (the chosen scale, the validated lot, the tare value the scale reported); it never calls a port. New errors and the `requireUnlocked` / `requireScaleUsable` guards that bolt 010's confirm will call unchanged.
- **Application** — new `ComponentPreparation` (identity, lot, container, reselection, scale options) and `SupervisorAuthorisationService`; `ComponentActivation` and `SessionStarter` also assign the scale. Ports used: `ScalePort`, `MaterialService` (bolt 008), `AuditLog`.
- **Infrastructure** — migration `0003` adds the preparation columns; the session repository saves and loads them; a `PinVerifier` adapter wraps the existing scrypt `verifyPin`.
- **Presentation** — five new endpoints under `/api/sessions/:sessionId/components/:sequence/`; `SessionView` gains per-component `scale` and `preparation`.

```text
Presentation   routes.ts ─ identity | lot | container | scale | scale-options
Application    ComponentPreparation ── ScalePort (list, tare)
               SupervisorAuthorisationService     MaterialService (bolt 008)
               ComponentActivation / SessionStarter → assign scale     AuditLog
Domain         WeighingSession + ComponentWeighing (ScaleAssignment, Preparation)
               errors, PinVerifier (interface), guards requireUnlocked / requireScaleUsable
Shared         scale-selection.ts (pure)
Infrastructure drizzle session repo (+columns), scrypt PinVerifier, migration 0003
```

Files (indicative):

```text
src/shared/domain/scale-selection.ts (+ .test.ts)       pure rule
src/shared/weighing.ts                                  + ScaleAssignmentView, PreparationView, requests
src/shared/errors.ts                                    + WRONG_DYESTUFF, COMPONENT_NOT_ACTIVE, IDENTITY_NOT_VERIFIED,
                                                          NO_SUITABLE_SCALE, SCALE_CAPACITY_INSUFFICIENT,
                                                          SCALE_CALIBRATION_EXPIRED, NOT_AUTHORISED
src/server/errors.ts + modules/weighing/domain/errors.ts  matching error classes
src/server/modules/weighing/domain/weighing-session.ts  extended aggregate
src/server/modules/weighing/domain/preparation.ts       ScaleAssignment, Preparation, derived state
src/server/modules/weighing/application/component-preparation.ts, supervisor-authorisation.ts, session-lock.ts
src/server/modules/weighing/application/component-activation.ts, session-starter.ts   (assign scale)
src/server/modules/weighing/module.ts, routes.ts, context.ts     wiring, endpoints, atomically()
src/server/modules/weighing/infrastructure/drizzle-repositories.ts, pin-verifier.ts
src/server/db/weighingms/schema.ts, migrations/0003_component_preparation.sql
src/server/integrations/scale/scale-port.ts, http-scale-adapter.ts, dummy/routes.ts   tare hint (ADR candidate A)
src/server/modules/scales/routes.ts                     imports shared calibration rule
```

## API Design

All bodies JSON; errors use the standard body. A call that is **refused** returns an error and changes nothing. A call that is **accepted** returns `200 SessionView` — including when a later step (tare) could not yet be done; that is visible as the component's `preparation.state` and `preparation.issue` (ADR candidate B).

| Endpoint | Request | Success | Refusals |
|----------|---------|---------|----------|
| `POST …/components/:seq/identity` | `{ code }` scanned or typed | 200 `SessionView` (UNLOCKED, or AWAITING_MATERIAL / AWAITING_TARE with `issue`) | 422 `WRONG_DYESTUFF` · 409 `COMPONENT_NOT_ACTIVE` / `COMPONENT_ALREADY_DONE` / `SESSION_NOT_IN_PROGRESS` · 404 `SESSION_NOT_FOUND` / `COMPONENT_NOT_FOUND` · 400 |
| `POST …/components/:seq/lot` | `{ code }` | 200 `SessionView` (lot replaced, source SCANNED) | 404 `LOT_NOT_FOUND` · 422 `LOT_MISMATCH` · 503 `ORGATEX_UNAVAILABLE` · 409 `COMPONENT_NOT_ACTIVE` … |
| `POST …/components/:seq/container` | `{ code }` | 200 `SessionView` (container replaced; re-tared if unlocked) | 404 `CONTAINER_UNKNOWN` · 422 `CONTAINER_OUT_OF_SERVICE` · 422 `SCALE_CAPACITY_INSUFFICIENT` (manual scale too small) · 503 `SCALE_UNAVAILABLE` / 422 `SCALE_CALIBRATION_EXPIRED` (re-tare impossible, nothing changed) |
| `POST …/components/:seq/scale` | `{ scaleId, supervisorBadge, pin }` | 200 `SessionView` (mode MANUAL, SCALE_RESELECT written; tared if identity verified) | 403 `NOT_AUTHORISED` · 404 `SCALE_NOT_FOUND` · 422 `SCALE_CAPACITY_INSUFFICIENT` · 422 `SCALE_CALIBRATION_EXPIRED` · 503 `SCALE_UNAVAILABLE` |
| `GET …/components/:seq/scale-options` | — | 200 `{ requirement, items: [{ scaleId, capacity, fits, usable, state, selected }] }` — lets the supervisor dialog offer only scales with sufficient capacity (FR-12) | 404 |

Conventions: `:seq` is a positive integer (else 400). Codes are normalised (trim, upper-case) by the existing shared helper. Identity is submitted as a single code; the API does not need to know whether it was scanned or typed (TD-3). Existing endpoints `…/activate`, `/sessions`, `/sessions/current` now also return scale and preparation. The PIN is only ever in the request body (never URL, query or log); error bodies for `NOT_AUTHORISED` carry no detail.

`SessionView.components[]` gains (for the ACTIVE component; `null` for others):

```text
scale:       { scaleId: string|null, mode: AUTO|MANUAL, reason?: NO_SUITABLE_SCALE } | null
requirement: Quantity | null              target + tolerance + container tare (the load the scale must carry)
preparation: { state: AWAITING_IDENTITY|AWAITING_MATERIAL|AWAITING_TARE|UNLOCKED,
               identityVerified: boolean,
               lot:       { lotId, source: DEFAULT|SCANNED } | null,
               container: { containerId, tare: Quantity, source: DEFAULT|SCANNED } | null,
               tareApplied: Quantity | null,
               issue?: { code, message } } | null
```

`issue` is present only for AWAITING_MATERIAL (which of lot or container is missing) and AWAITING_TARE (`NO_SUITABLE_SCALE`, `SCALE_CALIBRATION_EXPIRED`, `SCALE_UNAVAILABLE`).

### Selection and unlock flow

1. **Activation** (also session start for component 1): list the scales (a failure of the list counts as "no scales"); requirement = target + tolerance + tare of the dyestuff's default container (0 if none); `selectScale`; store `ScaleAssignment` (AUTO). Never fails.
2. **Identity**: steps of the model (match → defaults → re-run selection if needed → tare). Tare call is `ScalePort.tare(scaleId, { containerTare })`; the value returned is stored as `tareApplied`.
3. **Lot / container** at any time while ACTIVE; container change on an UNLOCKED component: tare first, apply only if it succeeded.
4. **Reselect**: authorise supervisor → validate scale (exists, fits, usable) → if identity verified, tare on the new scale → apply assignment MANUAL → write audit event, all in one atomic save.

## Data Persistence

Migration `0003_component_preparation.sql` adds nullable columns to `component_weighings` (existing rows and databases from earlier bolts remain valid):

| Column | Type | Meaning |
|--------|------|---------|
| scale_id | TEXT null | assigned scale |
| scale_mode | TEXT null | AUTO \| MANUAL |
| scale_reason | TEXT null | `NO_SUITABLE_SCALE` when no scale |
| identity_verified_at | TEXT null | set when the dyestuff matched |
| lot_id, lot_source | TEXT null | lot in force and DEFAULT \| SCANNED |
| container_id, container_source | TEXT null | container in force and DEFAULT \| SCANNED |
| container_tare_value, container_tare_unit | TEXT null | tare of the container master at the time (decimal text) |
| tare_value, tare_unit | TEXT null | tare applied by the scale (decimal text) |
| unlocked_at | TEXT null | set when the tare succeeded with everything settled |

- Quantities are decimal text with a unit (`data-stack.md`); no REAL columns.
- Deactivating a component clears all of these columns in the same save as the state change (model: nothing unconfirmed survives).
- The preparation state (AWAITING_…, UNLOCKED) is **derived on load**, not stored, so it cannot disagree with its inputs.
- A session saved before this bolt and still in progress loads with "no scale / awaiting identity" for its active component; the first identity submission re-runs automatic selection (invariant 13), so no manual data repair is needed.
- Reselection and its `SCALE_RESELECT` audit event are written in **one transaction** (`ctx.atomically(fn)` wraps the single better-sqlite3 connection's transaction; repository saves inside it join it).
- No new table. Weighing records (confirmed actuals) arrive in bolt 010.

## Security Design

| Concern | Approach |
|---------|----------|
| Supervisor authorisation (TD-6, NFR-14) | Badge + PIN in the request body. `SupervisorAuthorisationService` finds the operator by badge; if it is missing, inactive or not a SUPERVISOR it **still verifies the PIN against a fixed dummy hash**, so timing does not reveal which part failed; all failures give the same `403 NOT_AUTHORISED` without detail. Verification reuses the scrypt, constant-time `verifyPin`. The PIN is never stored, logged, echoed or placed in audit detail. |
| No lock-out | Repeated failures are not rate-limited (single local station, training). Recorded as a known gap; failures are logged as `supervisor-authorisation-failed` with the badge only. |
| Operator rights | Lot, container and identity endpoints require a signed-in operator through the existing station state (`NOT_SIGNED_IN`). |
| Input safety | Codes normalised and length-limited by the shared scan-code helpers; sequence parsed as integer; unknown fields ignored. |
| Audit | `SCALE_RESELECT` goes through the existing immutable audit path (ADR-1). Detail: `{ sequence, dyestuffCode, fromScaleId, fromMode, toScaleId, requirement }`; actor = the supervisor. |

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| NFR-4 Exact arithmetic | Requirement and capacity compared with `decimal.js` after conversion to one unit; no floating point anywhere in the rule. |
| Lost-update protection | Handlers load → modify → save around `await`s (scale, OrgaTEX). A small per-session async lock (`session-lock.ts`, promise chain keyed by session ID) serialises the preparation operations of one session, so a double scan cannot interleave. |
| Offline continuity (TD-1, FR-36) | Default lot and default container need no OrgaTEX call; activation, identity with defaults and unlock work with OrgaTEX offline. Only a **scanned** lot needs OrgaTEX (503 with the suggested lot still usable). |
| Scale outage | Scale listing failure → "no suitable scale" at activation; tare failure → AWAITING_TARE (never a lost identity); mid-flight changes are all-or-nothing. |
| Performance | Activation = one list call + one SQLite write; identity = one tare call; all well inside the 2 s UI refresh budget. |
| Observability (IR-09) | One structured log line per operation: `component-scale-assigned`, `identity-verified`, `identity-rejected`, `component-unlocked`, `component-retared`, `scale-reselected`, `scale-not-usable`, with session, sequence and scale (never the PIN). |
| Testability | Clock and IDs injected as in bolt 006; `ScalePort` and `MaterialService` are faked in application tests; API tests use the real Dummy Scale with a `ManualClock`. |

## Error Handling

| Error Type | Code | HTTP |
|------------|------|------|
| Scanned dyestuff differs from the component's | `WRONG_DYESTUFF` | 422 |
| Action on a component that is not ACTIVE | `COMPONENT_NOT_ACTIVE` | 409 |
| Weighing/confirm attempted before unlock (guard for bolt 010) | `IDENTITY_NOT_VERIFIED` | 409 |
| No usable scale can carry the requirement | `NO_SUITABLE_SCALE` | 422 (as state `issue` on identity; as error where an operation needs a scale) |
| Chosen scale too small | `SCALE_CAPACITY_INSUFFICIENT` | 422 |
| Assigned/chosen scale calibration expired | `SCALE_CALIBRATION_EXPIRED` | 422 |
| Scale not connected | `SCALE_UNAVAILABLE` | 503 (existing) |
| Scale unknown | `SCALE_NOT_FOUND` | 404 (existing) |
| Not a supervisor, or wrong PIN | `NOT_AUTHORISED` | 403 |
| Lot / container problems | `LOT_NOT_FOUND`, `LOT_MISMATCH`, `CONTAINER_UNKNOWN`, `CONTAINER_OUT_OF_SERVICE`, `ORGATEX_UNAVAILABLE` | as bolt 008 |

## Decisions that need an ADR (Stage 3)

- **A — Container placement on the Dummy Scale (model point M-1).** Recommended: `ScalePort.tare(scaleId, { containerTare })`. The Dummy Scale's tare endpoint accepts an optional `containerWeight`; **only if the platform is empty** it places that container itself, then tares (documented training behaviour, so the flow works without the Training Panel; if a container is already on, nothing changes). A real adapter would not place anything and may compare the tare it reads with `containerTare`. A difference between expected and applied tare is logged, not blocking. *Alternatives:* the app calls `_sim` (rejected: `_sim` is Training-Panel-only); an extra manual "place container" step in the UI (rejected: not in the prototype flow).
- **B — Unlock outcome is state, not error.** A refused action is an HTTP error; an accepted action whose follow-up (tare) cannot be completed returns 200 with `preparation.state = AWAITING_TARE` and an `issue`, because identity really was verified and is persisted. *Alternative:* a 503 after changing state (rejected: error responses that change state mislead clients).
- **C — Per-session serialisation** of preparation operations (lock in the application layer) rather than optimistic version columns; one process, one station.

## Testing approach (feeds the Test stage)

| Level | What |
|-------|------|
| Pure rule | `selectScale` table: Blue/Red/Yellow → 3 kg, Sodium Sulphate/Soda Ash → 32 kg; requirement **exactly** 3000 g → 3 kg, 3000.1 g → 32 kg; kg/g mixing; expired or disconnected small scale → 32 kg; both unusable → none; equal capacities → lowest ID |
| Aggregate | assignment on start/activation; deactivation clears preparation; wrong dyestuff changes nothing; defaults; lot/container replacement; states AWAITING_*/UNLOCKED; re-tare on container change; reselect resets; guards `requireUnlocked`, `requireScaleUsable`; invariants 8–15 |
| Application (fake ports) | decision order of `verifyIdentity`; no OrgaTEX call for defaults; scale failure leaves AWAITING_TARE; all-or-nothing container change and reselection; supervisor authorisation (operator badge, unknown badge, wrong PIN → same error); SCALE_RESELECT written atomically with the change |
| Repository | new columns round-trip; old rows load; clearing on deactivation; atomic reselect + audit |
| API (real dummies, ManualClock) | Yellow + `DYE-4471` → lot 2026-0387, C-12, tare 214.0 g, net 0.0 g on `scale-3kg`; `DYE-2204` → 422; Sodium Sulphate → `scale-32kg`, tare 1.850 kg; calibration expiry via `_sim`; scale offline at unlock; supervisor reselect with BDG-0901 / 2580 → MANUAL + audit; operator badge → 403; 32 kg → 3 kg too small → 422; scale-options |
| Regression | all 356 existing tests; typecheck, lint, format |

## Out of scope in this bolt

Confirmation, tolerance evaluation, re-tare button, quit (bolt 010); overshoot and override (012); the UI for all of this (bolts 011, 013, 016). `requireUnlocked` and `requireScaleUsable` are delivered and unit-tested here but first used by bolt 010.

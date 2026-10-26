---
unit: 004-weighing-station
bolt: 012-weighing-station
stage: model
status: complete
updated: 2026-10-25T18:00:00Z
---

# Static Model - Weighing Station (bolt 12: supervisor override and the Step 24 overshoot rule)

Scope of this model: how a **supervisor authorises a weight outside tolerance**, what the **record** and the **audit trail** then hold, and how the **overshoot rule decided at Step 24 (TD-10, Option A)** shows up in the domain. It extends the models of bolts 006, 009 and 010; everything there stays valid. The surplus panel and the supervisor dialog (bolt 013) are named only where the boundary needs to be clear, and marked *(later)*.

Stories covered: `013-supervisor-override`, `014-overshoot-detection-and-recovery`. Requirements: FR-20, FR-21, FR-22, BR-07, BR-08, BR-13, AC-06, TD-6, TD-9, TD-10, TD-15, NFR-8, NFR-14, FR-37.

## The Step 24 rule in domain terms (TD-10, Option A)

1. An **over-dosed** component is simply a component whose live weight is in zone OVER. **Nothing is stored for "over"**: it follows the live weight, so it disappears when the operator removes the excess or re-tares. There is no recovery state, no recovery command and no new component state.
2. **Confirm (bolt 010) keeps refusing every zone but OK.** This does not change.
3. **Override** is the only way to record a weight outside the band, and it is allowed for **any** out-of-tolerance weight above zero (under, near, over — TD-15).
4. **Surplus is weight − target**, one decimal percent of the target. It is kept on the record **only** when the overridden weight is OVER.
5. **No recipe recalculation exists in the domain.** Overriding or recording a surplus never changes any other component's target or the recipe snapshot.

## Bounded Context

Same **Weighing (station) context**. New relationships:

| Neighbour | Relationship | What crosses the boundary |
|-----------|--------------|---------------------------|
| Device context (`ScalePort`) | Customer → supplier | **a fresh reading** at the moment of the override (the server measures — ADR-7); no weight is ever supplied by the client |
| Operators (badge + PIN) | Internal | verify that the badge and PIN are an **active supervisor's** (`SupervisorAuthorisationService`, bolt 009) |
| Audit | Internal | one `OVERRIDE` event, in the same unit as the record |
| Completion context (bolts 014, 015) | Downstream | records with result `OVERRIDDEN` are posted and printed like any other, flagged |
| Station UI | Client | supplies supervisor badge, PIN and reason only |

## Domain Entities

| Entity | Properties (new in this bolt marked ✚) | Business Rules |
|--------|-----------------------------------------|----------------|
| **WeighingRecord** *(append-only)* | as bolt 010; `result` now IN_TOLERANCE \| **OVERRIDDEN**; `surplus` filled for an overridden OVER weight; ✚ **override** (nullable) | A record is OVERRIDDEN **iff** it carries an override. Still written once, never changed (NFR-8). |
| ✚ **Override** *(part of the record)* | supervisorId, reason, **zone** at the time (UNDER \| NEAR \| OVER), authorisedAt | Exactly the facts FR-22 asks for: who authorised, why, when, and which weight (the record's `actual`). The **operator** field of the record stays the operator signed in at the station (ADR-2). |
| **AuditEvent** `OVERRIDE` | as bolt 006 (type already exists) | actor = the **supervisor**; sessionId; detail: sequence, dyestuff code, recordId, actual, target, zone, surplus (if over), reason, operatorId (the one at the station). |
| **WeighingSession**, **ComponentWeighing** | as bolt 010 | An overridden confirmation is a confirmation: component DONE, next ACTIVE, or session COMPLETED. |

## Value Objects

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| ✚ **OverrideReason** | text | Trimmed; **1–500 characters**; empty or whitespace only → `REASON_REQUIRED` (400). Stored as typed (after trimming), never altered. |
| ✚ **OverrideDecision** | allowed \| refused(reason) | Reasons, in order: not signed in → session not in progress → component not active → locked → scale not usable → scale unreachable → **reading unstable** → **weight not above zero** → **zone is OK** (nothing to override). Supervisor authorisation is checked **before the scale is read** and after the request is shaped correctly. |
| **ToleranceZone**, **Surplus** | as bolt 010 | `surplus()` is the single place that defines the reference (target). Override reuses it. |
| **RecordResult** | IN_TOLERANCE \| OVERRIDDEN | Closed list. |

## Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|------------|
| **WeighingSession** | ComponentWeighing ×n | Invariants (1)–(21) stay. |
| **WeighingRecord** | Override | Immutable. `result = OVERRIDDEN` ⇔ override present ⇔ weight was outside the band when recorded. |

New invariants (numbering continues):

22. **Only an authorised supervisor can override.** An override needs a supervisor badge **and** a correct PIN of an active operator with the SUPERVISOR role. Every failure is the same `NOT_AUTHORISED` (403) — unknown badge, inactive, operator role, wrong PIN — and the PIN is verified even when the badge is unknown (bolt 009 service, unchanged). **An operator's own badge/PIN never works**, even when that operator is the one signed in, unless that person actually has the supervisor role.
23. **An override needs a reason.** Empty or whitespace-only reason → `REASON_REQUIRED` (400), refused before anything else is touched.
24. **The server measures, again.** The judged and recorded weight is one fresh reading taken by the server (ADR-7); the command carries no weight. The reading must be connected and **stable** (TD-9) — a settling weight is not overridden.
25. **What can be overridden:** a component that is ACTIVE and UNLOCKED, on a usable scale (the same preconditions as confirm), whose weight is **above zero** and **outside** the band. Weight zero or negative → `NOTHING_TO_OVERRIDE` (409); weight within the band → `OVERRIDE_NOT_NEEDED` (409). Under, near and over are all allowed (TD-15).
26. **One atomic unit.** The OVERRIDDEN record (with override and surplus), the component becoming DONE, the next component becoming ACTIVE (or the session COMPLETED) and the `OVERRIDE` audit event are committed together or not at all (NFR-5). A failed authorisation or refused override writes **nothing** — not even an audit event (the failure is logged only, as for scale reselection).
27. **No compensation.** The surplus of an override changes nothing else: no other component's target, tolerance or recipe snapshot is altered by any operation. (Step 24 / TD-10.)
28. **Re-tare and removal remain the operator's recovery.** They need no supervisor and write no record (invariant 20). Nothing about an over-dosed state is remembered between readings.

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| ✚ **OverrideAuthorised** | accepted override | sessionId, sequence, supervisorId, reason, zone, actual, surplus (if over), operatorId, at → audit `OVERRIDE` |
| ✚ **OverrideRefused** | refused override | sessionId, sequence, reason code, at *(logged only; no audit)* |
| **ComponentConfirmed** | as bolt 010 | now also raised by an override, with result OVERRIDDEN |
| **BatchCompleted** | as bolt 010 | unchanged |

Reactions: **OverrideAuthorised → WeighingRecord appended (OVERRIDDEN) and AuditLog.record(OVERRIDE)** in the same unit of work; **ComponentConfirmed / BatchCompleted** as before.

## Domain Services

| Service | Operations | Dependencies |
|---------|------------|--------------|
| ✚ **ComponentOverride** *(application)* | `override(sessionId, sequence, supervisorBadge, pin, reason)` → record, session | `SupervisorAuthorisationService`, ScalePort (usable + fresh read), session and record repositories, AuditLog, ComponentPreparation (next component's scale), OperatorIdentification, clock, ids, the session lock |
| ✚ **ComponentEvaluation** *(application, read-only)* | `evaluate(sessionId, sequence)` → fresh reading with zone, surplus, `confirmable`, `overridable` | ScalePort, session repository |
| **ToleranceEvaluator** *(shared pure functions)* | unchanged: `toleranceBand`, `evaluateZone`, `surplus`, `isConfirmable` | none; gains one more pure predicate `isOverridable(weight zone, weight)` (zone ≠ OK ∧ weight > 0) |
| **SupervisorAuthorisationService** | unchanged | operators, PIN verifier |

`ComponentOverride.override` decision order:
1. Request shaped correctly: badge, PIN and reason present (`VALIDATION_ERROR` / `REASON_REQUIRED`).
2. A signed-in operator exists (`NOT_SIGNED_IN`).
3. **Supervisor authorised** (`NOT_AUTHORISED`) — before any scale access.
4. Session and component preconditions as confirm: in progress, component ACTIVE, UNLOCKED, scale usable.
5. One fresh reading: not connected → `SCALE_UNAVAILABLE`; not stable → `READING_UNSTABLE`.
6. Weight ≤ 0 → `NOTHING_TO_OVERRIDE`; zone OK → `OVERRIDE_NOT_NEEDED`.
7. Build the OVERRIDDEN record from the reading (surplus if over), advance the session, commit record + session + `OVERRIDE` audit atomically.

`ComponentEvaluation.evaluate` answers the story-014 criterion "when the component state is read, zone OVER, surplus +2.4 g (+2.6 %), confirm not allowed": it takes one reading and reports **what the server would decide now**, without changing anything. It exists so the rules can be checked through the API and the UI never has to guess; the UI still computes its own zone locally for the 10 Hz display with the same shared functions.

## Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| **WeighingRecordRepository** | WeighingRecord | unchanged methods; `append` now stores the override fields. **Still no update or delete.** |
| **AuditEventRepository** | AuditEvent | unchanged |
| *(unit of work)* | — | override writes record + session + audit as one transaction (as confirm and reselection) |

## Ubiquitous Language (additions)

| Term | Definition |
|------|------------|
| **Override** | A supervisor's authorisation to record a weight outside tolerance, with PIN and a written reason. |
| **Overridden record** | A weighing record whose weight was outside tolerance when recorded; it carries the supervisor, the reason and the zone. |
| **Evaluation** | What the station would decide about the weight on the scale right now (zone, surplus, may it be confirmed, may it be overridden). |
| **Recovery** | What the operator does about an over-dosed component: remove the excess until it is in tolerance, or re-tare to start the component again. |
| **No compensation** | The training rule that an overdose never changes the recipe or the other components. |

## Training assumptions and open points

| # | Point | Position in this model |
|---|-------|------------------------|
| O-1 | **Supervisor identity in the command.** Story 013 shows `{pin, reason}` only; bolt 009's reselection takes a supervisor **badge and PIN**. | Same as reselection: `supervisorBadge`, `pin`, `reason`. A PIN alone cannot say who authorised, and FR-22 needs the supervisor on the record. The story text is amended. |
| O-2 | **Can the signed-in operator authorise their own override?** FR-22 says a supervisor authorises; it does not require a second person. | Allowed **only if that person has the SUPERVISOR role** and enters the PIN; the record keeps both the station operator and the supervisor (possibly the same person). A "four-eyes" rule is a pilot question for FCI. |
| O-3 | **Override on an unstable reading.** Story 013 is silent. | **Refused** (`READING_UNSTABLE`): a moving weight cannot be certified. |
| O-4 | **Surplus kept for under/near overrides?** Story 014 says "keeps the surplus (if over)". | Surplus is stored **only for an OVER weight**; under and near overrides store none. The zone is on the override either way. |
| O-5 | **Evaluation endpoint.** Story 014 criterion 1 ("when the component state is read") needs the server to say the zone and surplus. | Added as a **read-only** evaluation (one fresh reading, nothing changes). Alternative: no endpoint and the criterion checked with the shared functions only. |
| O-6 | **"OVERRIDE REQUESTED — AWAITING SUPERVISOR".** | A **UI-only** state (bolt 013): it exists while the supervisor dialog is open. The server has no "requested" state; nothing is stored until the override is authorised. |
| O-7 | **PIN guessing.** | No lock-out (known gap since bolt 009); every failed authorisation is logged with the badge entered. A lock-out is a hardening item. |
| O-8 | **OrgaTEX.** Consumption posting of an overridden record. | The existing `result` field already admits OVERRIDDEN; posting and printing the flag belong to bolts 014 and 015. |
| O-9 | **Reason length.** | 1–500 characters is a training choice. |

## Coverage of acceptance criteria

| Story | Criterion | Covered by |
|-------|-----------|-----------|
| 013 | Yellow at 93.0 g, valid supervisor PIN and reason → OVERRIDDEN record with override, `OVERRIDE` audit event, component DONE | invariants 22, 25, 26; Override; OverrideAuthorised |
| 013 | Empty reason → 400 `REASON_REQUIRED`; operator/wrong PIN → 403 `NOT_AUTHORISED` | invariants 22, 23 |
| 013 | Weight within tolerance → 409 `OVERRIDE_NOT_NEEDED` | invariant 25 |
| 013 | Weight 0 → 409 | invariant 25 (`NOTHING_TO_OVERRIDE`) |
| 014 | Yellow at 96.4 g: zone OVER, surplus +2.4 g (+2.6 %), confirm not allowed | ComponentEvaluation; ToleranceEvaluator; invariant 28 |
| 014 | OVER: re-tare or override apply the existing rules | invariants 28, 25 |
| 014 | Overdose leaves remaining targets and recipe unchanged | invariant 27 |
| 014 | Removing the excess makes confirm allowed again | invariant 28 (state follows the live weight) |
| 014 | Override of 96.4 g → OVERRIDDEN, surplus +2.4 g (+2.6 %), `OVERRIDE` audit | invariants 25, 26; O-4 |
| 014 | Surplus is weight − target, percent of target, one decimal | ToleranceEvaluator `surplus()` |
| FR-22 AC3 | Override record stores supervisor, reason, time and the weight | Override + record `actual` |

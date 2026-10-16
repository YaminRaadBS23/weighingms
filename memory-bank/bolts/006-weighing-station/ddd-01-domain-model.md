---
unit: 004-weighing-station
bolt: 006-weighing-station
stage: model
status: complete
updated: 2026-10-16T08:33:22Z
---

# Static Model - Weighing Station (bolt 6: operator, session, component states, audit)

Scope of this model: the parts of the weighing domain delivered by bolt 006 — **operator identification**, the **weighing session** with its **component states and activation**, **start / resume**, and the **audit trail**. Preparation (identity, lot, container, tare, scale selection), confirmation, tolerance, overshoot and override extend this model in bolts 009, 010 and 012; their attributes are named here only where the boundary needs to be clear, and marked *(later)*.

Stories covered: `001-operator-sign-in`, `002-start-or-resume-weighing-session`, `003-component-states-and-activation`, `015-audit-trail`, plus the criterion carried from bolt 005 (a session in progress keeps working while OrgaTEX is offline).

## Bounded Context

**Weighing (station) context.** It owns who is weighing at the station, which batch is being weighed, the progress through its recipe components, and the immutable record of exceptional actions. It does **not** own batches or recipes (OrgaTEX, via the Batch & Material context and `OrgatexPort`), devices (Device context via ports), or completion outputs (Completion context, bolt 014/015).

Relationships:

| Neighbour | Relationship | What crosses the boundary |
|-----------|--------------|---------------------------|
| Batch & Material context (`BatchService`) | Customer → supplier | release check (`requireWeighable`), recipe |
| OrgaTEX (`OrgatexPort`) | Conformist via adapter | batch status WEIGHING when a session starts |
| Completion context (bolt 014) | Downstream | completed session (later) |
| Station UI | Client | session state, component states, operator |

## Domain Entities

| Entity | Properties | Business Rules |
|--------|------------|----------------|
| **Operator** | operatorId, badgeId, name, shift, role (OPERATOR \| SUPERVISOR), active, pinHash (supervisors only) | Identified by badge ID only (format `BDG-nnnn`, normalised). An inactive operator cannot sign in. Supervisors are operators with authority (override, scale reselection — later); their PIN is stored hashed, never in clear. Operators are WeighingMS master data (brief §9.3), seeded for training (DB-5). |
| **Station** | stationId, currentOperatorId, signedInAt | One station (`STN-01`) in V1. At most one signed-in operator at a time; signing in replaces the previous operator; signing out clears it. A session can be started only while an operator is signed in. |
| **ComponentWeighing** *(inside WeighingSession)* | sequence, state (PENDING \| ACTIVE \| DONE), activatedAt; *(later: identity verified, lot, container, scale, tare, confirmed record)* | Exists for every recipe component, keyed by sequence. Only a PENDING component can be activated. Becoming DONE is irreversible *(DONE is reached by confirmation — bolt 010)*. When a component stops being ACTIVE without being DONE, its unconfirmed weighing data is discarded. |
| **WeighingSession** *(aggregate root)* | sessionId, batchId, stationId, startedBy (operatorId), status (IN_PROGRESS \| SUSPENDED \| COMPLETED), recipeSnapshot, components[], startedAt, updatedAt, completedAt | One batch being weighed. Created from a batch that may be weighed (RELEASED, or WEIGHING when resumed). Holds a **snapshot** of the recipe taken at start, so it never needs OrgaTEX to continue. *(SUSPENDED via quit — bolt 010; COMPLETED — bolt 010.)* |
| **AuditEvent** *(own aggregate, append-only)* | eventId, sessionId (nullable), type, actorId, detail, occurredAt | Written once, never changed or deleted. Types in this intent: OVERRIDE, SCALE_RESELECT, ABANDON, REPRINT, WRITEBACK_RETRY (FR-37). Read back per session in the order they occurred. |

## Value Objects

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| **BadgeId** | value | Trimmed, upper-cased; must match `BDG-nnnn` (shared scan-code rule). |
| **Quantity** | value (decimal string), unit (g \| kg) | Decimal only, never floating point (NFR-4). Existing shared value. |
| **DyestuffRef** | code, name, shortName, colourHex, type | Copied from the recipe; identity is `code`. |
| **ComponentSpec** | sequence, dyestuff (DyestuffRef), target, tolerance, barMax, suggestedLotId | Immutable; one per recipe line. |
| **RecipeSnapshot** | recipeId, version, shade, components (ComponentSpec[]), takenAt | Immutable once the session starts; components ordered by sequence 1..n without gaps. Equals what OrgaTEX returned at start (NFR-9 spirit: the session keeps what the operator was asked to weigh). |
| **SessionStatus** | IN_PROGRESS \| SUSPENDED \| COMPLETED | Only IN_PROGRESS sessions accept component actions. |
| **ComponentState** | PENDING \| ACTIVE \| DONE | DONE is terminal. |
| **AuditEventType** | OVERRIDE \| SCALE_RESELECT \| ABANDON \| REPRINT \| WRITEBACK_RETRY | Closed list; extended only by a requirement change. |
| **SupervisorPin** | hash | Verified by comparison of hashes; the clear PIN is never stored or logged (NFR-14). *(Used from bolt 009.)* |

## Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|------------|
| **WeighingSession** | ComponentWeighing ×n, RecipeSnapshot | (1) Exactly one component per recipe line, same sequences as the snapshot. (2) While IN_PROGRESS and not all components DONE, **exactly one** component is ACTIVE. (3) On start, the ACTIVE component is the lowest-sequence PENDING one (component 1 for a new session). (4) Activating component *n*: allowed only if *n* is PENDING; the previously ACTIVE component returns to PENDING and loses its unconfirmed data; activating the already ACTIVE component is a no-op. (5) A DONE component never changes state. (6) RecipeSnapshot never changes after start. (7) Component actions are refused unless status is IN_PROGRESS. |
| **Station** | — | At most one current operator. **At most one IN_PROGRESS session per station** — the station weighs one batch at a time (TD-13 one-component-at-a-time, prototype assumption P3); switching batches requires quitting first (bolt 010). |
| **AuditEvent** | — | Immutable after creation. |

Cross-aggregate rule (enforced by the domain service, not inside one aggregate): **at most one open (IN_PROGRESS or SUSPENDED) session per batch** — starting a batch that already has one returns that session (resume) instead of creating a duplicate.

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| **OperatorSignedIn** | valid, active badge submitted | stationId, operatorId, role, at |
| **OperatorSignedOut** | operator signs out | stationId, operatorId, at |
| **WeighingSessionStarted** | new session created for a weighable batch | sessionId, batchId, stationId, operatorId, recipeId, componentCount, at |
| **WeighingSessionResumed** | start requested for a batch with an open session | sessionId, batchId, operatorId, at |
| **ComponentActivated** | operator activates a pending component (or the session starts) | sessionId, sequence, previousSequence (nullable), at |
| **BatchStatusSyncDeferred** | OrgaTEX unreachable when setting WEIGHING at start | sessionId, batchId, at |
| **AuditEventRecorded** | any privileged/exceptional action | eventId, type, actorId, sessionId, at |

Reaction in this bolt: **WeighingSessionStarted → OrgaTEX batch status WEIGHING** (IR-06). If OrgaTEX is unreachable at that moment the session still starts (TD-1: weighing never blocked); the deferred status is logged and is caught up by the write-back at completion, where RELEASED → WEIGHED is allowed directly (bolt 002 contract).

## Domain Services

| Service | Operations | Dependencies |
|---------|------------|--------------|
| **OperatorIdentification** | signIn(badge) → Operator; signOut(); currentOperator(); *(later: verifySupervisor(pin))* | OperatorRepository, StationRepository, clock |
| **SessionStarter** | startOrResume(batchId, operator) → WeighingSession | WeighingSessionRepository, BatchService (`requireWeighable`, `getRecipe`), OrgatexPort (`setBatchStatus`), clock, id generator |
| **AuditLog** | record(type, actor, sessionId?, detail) → AuditEvent; listForSession(sessionId) | AuditEventRepository, clock, id generator |

`SessionStarter.startOrResume` decision order:
1. No operator signed in → `NOT_SIGNED_IN`.
2. Normalise the batch ID. If an **open session for that batch** exists → return it (**resume, no OrgaTEX call** — so resuming works while OrgaTEX is offline).
3. If **another** IN_PROGRESS session exists at the station → `SESSION_IN_PROGRESS` (one batch at a time).
4. `requireWeighable(batchId)` → `BATCH_NOT_RELEASED` / `BATCH_NOT_FOUND` / `ORGATEX_UNAVAILABLE` pass through.
5. Take the recipe snapshot (`getRecipe`), create the session with component 1 ACTIVE, persist.
6. Set OrgaTEX status WEIGHING; if OrgaTEX is unreachable, record `BatchStatusSyncDeferred` and continue.

## Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| **OperatorRepository** | Operator | findByBadge(badgeId), findById(operatorId) |
| **StationRepository** | Station | get(stationId), setCurrentOperator(stationId, operatorId \| null, at) |
| **WeighingSessionRepository** | WeighingSession | findById(sessionId), findOpenByBatch(batchId), findInProgressForStation(stationId), findCurrentForStation(stationId), save(session) — save is atomic for the whole aggregate |
| **AuditEventRepository** | AuditEvent | append(event), listBySession(sessionId) (chronological) — no update or delete method exists |

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Operator** | Person weighing at the station, identified by badge (e.g. R. Karim, Shift A). |
| **Supervisor** | Operator role allowed to authorise exceptions (override, scale reselection). |
| **Badge** | Operator identification code `BDG-nnnn`, scanned or typed. |
| **Station** | One physical weighing position (`STN-01`) with its scales, scanner and printer. |
| **Weighing session** | The weighing of one batch at the station, from start to completion; holds the recipe snapshot and component progress. |
| **Start** | Create a session for a released batch. |
| **Resume** | Continue an existing open session of the same batch (after reload, restart or quit). |
| **Recipe snapshot** | Copy of the recipe taken when the session starts; what the operator is asked to weigh, independent of later OrgaTEX changes or outages. |
| **Component** | One recipe line (dyestuff or auxiliary) weighed individually. |
| **Pending / Active / Done** | Component states: not started / being weighed now (exactly one) / confirmed (final). |
| **Activate** | Make a pending component the one being weighed; the previously active one returns to pending. |
| **Unconfirmed weighing** | Anything entered for the active component that has not been confirmed (identity, lot, tare, weight) — discarded when the component stops being active. |
| **Audit event** | Immutable record of a privileged or exceptional action: who, what, when, for which session. |
| **Open session** | A session that is IN_PROGRESS or SUSPENDED (not completed). |

## Training data (DB-5)

| Badge | Name | Shift | Role | Active | Note |
|-------|------|-------|------|--------|------|
| BDG-0417 | R. Karim | Shift A | OPERATOR | yes | from the prototype operator chip |
| BDG-0901 | Shift Supervisor A | Shift A | SUPERVISOR | yes | training role account (no real person); PIN set in technical design, stored hashed |
| BDG-0999 | Inactive Badge | — | OPERATOR | no | training account to demonstrate refusal |

## Coverage of acceptance criteria

| Story | Criterion | Covered by |
|-------|-----------|-----------|
| 001 | Badge → operator becomes station operator | OperatorIdentification.signIn, Station |
| 001 | Unknown / inactive badge → `OPERATOR_UNKNOWN` | Operator rules |
| 001 | No operator → `NOT_SIGNED_IN` on session start | SessionStarter step 1 |
| 001 | Current operator readable | OperatorIdentification.currentOperator |
| 002 | New session: snapshot, component 1 ACTIVE, others PENDING, OrgaTEX WEIGHING | SessionStarter 4–6, invariants (1)–(3) |
| 002 | Start again → same session | SessionStarter step 2, open-session rule |
| 002 | After restart, same states | WeighingSessionRepository (persisted aggregate) |
| 002 | QUEUED → `BATCH_NOT_RELEASED` | SessionStarter step 4 |
| 003 | Component 1 ACTIVE, 2–5 PENDING | invariant (3) |
| 003 | Activate 3 → ACTIVE, previous back to PENDING, data discarded | invariant (4) |
| 003 | DONE → `COMPONENT_ALREADY_DONE` | invariant (5) |
| 003 | Exactly one ACTIVE | invariant (2) |
| 015 | One audit event per privileged action | AuditLog.record *(callers arrive in bolts 009/010/012/014/015)* |
| 015 | Events listed in order | AuditEventRepository.listBySession |
| 015 | No update/delete | AuditEvent immutability, repository has no such methods |
| 005 (carried) | Session keeps working while OrgaTEX is offline | RecipeSnapshot; resume without OrgaTEX (step 2) |

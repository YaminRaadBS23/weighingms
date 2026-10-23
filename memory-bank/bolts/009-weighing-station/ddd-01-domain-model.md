---
unit: 004-weighing-station
bolt: 009-weighing-station
stage: model
status: complete
updated: 2026-10-23T15:16:27Z
---

# Static Model - Weighing Station (bolt 9: component preparation)

Scope of this model: what has to be true between **activating** a component and being allowed to **dispense** into it — selecting the scale, verifying the dyestuff, fixing the lot and container, taring, and the supervisor's right to change the scale. It extends the model of bolt 006 (operator, station, session, component states, audit); everything from that model stays valid. Tolerance, confirmation, progression, re-tare and quit (bolt 010) and overshoot and override (bolt 012) are named only where the boundary needs to be clear, and marked *(later)*.

Stories covered: `004-verify-dyestuff-identity-and-unlock`, `005-automatic-scale-selection`, `006-supervisor-scale-reselection`, `007-calibration-enforcement`. Requirements: FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, BR-05, BR-10, BR-24, AC-02, AC-14, TD-2, TD-3, TD-6, TD-8, NFR-14.

## Bounded Context

Same **Weighing (station) context** as bolt 006. New relationships:

| Neighbour | Relationship | What crosses the boundary |
|-----------|--------------|---------------------------|
| Batch & Material context (`MaterialService`, bolt 008) | Customer → supplier | lot check (`resolveLot` / `validateLot`), container check (`validateContainer`), default container (`defaultContainerFor`) |
| Device context (`ScalePort`) | Customer → supplier through a port | list of scales with capacity, resolution, calibration due date and connection state; tare command |
| Operator master data | Internal | supervisor authorisation (badge + PIN hash) |
| Audit | Internal | `SCALE_RESELECT` events |

The weighing context never reads a weight or a scan on its own initiative here: the scan or typed code arrives as a **command from the operator** (the UI classifies and submits it), and the scale is asked only to **tare**. Live weight reading belongs to the UI polling the scale API (bolt 011).

## Domain Entities

| Entity | Properties (new in this bolt marked ✚) | Business Rules |
|--------|-----------------------------------------|----------------|
| **ComponentWeighing** *(inside WeighingSession)* | sequence, state (PENDING \| ACTIVE \| DONE), activatedAt; ✚ **scaleAssignment**, ✚ **preparation** (see below) | Preparation data exists only while the component is ACTIVE. When the component stops being ACTIVE without being DONE (another component activated), the scale assignment and all preparation data are discarded — the same "unconfirmed weighing" rule as bolt 006. |
| **WeighingSession** *(aggregate root)* | as bolt 006 | Gains the operations: *select scale on activation*, *verify identity*, *set lot*, *set container*, *complete unlock*, *reselect scale*. |
| **Scale** *(read model of the Device context — not owned here)* | scaleId, class (PRECISION \| FLOOR), capacity, unit, resolution, calibrationDueAt, connected | Seen only through `ScalePort`. **Usable** = connected and calibration not expired at the moment of the check. |
| **Container** *(read model of the Batch & Material context)* | containerId, type, tare, inService, defaultFor | Seen only through `MaterialService`. |
| **Operator** | as bolt 006 | A **supervisor** is an active operator with role SUPERVISOR and a PIN hash. |
| **AuditEvent** | as bolt 006 | `SCALE_RESELECT` is written in this bolt: actor = the authorising supervisor, detail = component, previous scale, new scale. |

## Value Objects

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| **ScaleAssignment** | scaleId \| none, mode (AUTO \| MANUAL), reason (when none: `NO_SUITABLE_SCALE`) | AUTO is chosen by the selection rule; MANUAL only by a supervisor reselection. "None" is allowed for an ACTIVE component (the component is active but cannot be unlocked) so that activation never fails. |
| **Preparation** | identity (NOT_VERIFIED \| VERIFIED, verifiedAt), lotId \| none, containerId \| none, tare (Quantity \| none), unlockedAt \| none | See "Preparation states". Lot defaults to the recipe's suggested lot, container to the dyestuff's default container (TD-3, TD-8). |
| **ScaleRequirement** | target + tolerance + container tare, in one unit | The weight the scale must be able to carry for this component (TD-2). Computed with exact decimal arithmetic after unit conversion (NFR-4). Uses the component's *current* container tare. |
| **PreparationState** *(derived)* | AWAITING_IDENTITY \| AWAITING_MATERIAL \| AWAITING_TARE \| UNLOCKED | See below. |
| **SupervisorAuthorisation** | supervisor operator, authorised at | Obtained only from a valid supervisor badge + PIN; carries no secret. |
| **Quantity**, **DyestuffRef**, **ComponentSpec**, **RecipeSnapshot** | as bolt 006 | — |

### Preparation states (derived from the data above)

| State | Meaning | Weighing |
|-------|---------|----------|
| **AWAITING_IDENTITY** | The component is active; the dyestuff has not been scanned. | locked |
| **AWAITING_MATERIAL** | Dyestuff verified, but the lot or the container cannot be defaulted (no suggested lot or no default container) and has not been scanned. | locked |
| **AWAITING_TARE** | Dyestuff, lot and container are settled but the scale could not be tared (scale offline, expired or not assigned). | locked |
| **UNLOCKED** | Dyestuff verified, lot and container settled, scale usable and tared with the container in place; the tare applied is recorded. | live weighing allowed *(confirmation in bolt 010)* |

Transitions: AWAITING_IDENTITY → (correct dyestuff) → AWAITING_MATERIAL or AWAITING_TARE or UNLOCKED, depending on defaults and the scale. A wrong dyestuff changes nothing. Any of the three waiting states becomes UNLOCKED as soon as its missing piece arrives. UNLOCKED stays UNLOCKED when the lot changes; it **re-tares** when the container changes; it falls back to AWAITING_TARE when the supervisor reselects the scale (the new scale must be tared).

## Aggregate invariants (additions to WeighingSession)

Numbering continues from bolt 006 (1)–(7).

8. **Scale assignment follows activation.** When a component becomes ACTIVE (including component 1 at session start) the session assigns a scale by the selection rule, mode AUTO. If no scale qualifies, the assignment is "none / NO_SUITABLE_SCALE" — activation still succeeds, preserving invariant (2).
9. **Selection rule (TD-2, pure).** Of the scales that are *usable* and whose capacity is **greater than or equal to** the component's ScaleRequirement, take the one with the **smallest capacity**. Equal capacity → the lowest scale ID (stable, deterministic). None qualifies → `NO_SUITABLE_SCALE`. A requirement exactly equal to a capacity fits that scale (inclusive); anything above it does not.
10. **Identity before unlock.** A component is UNLOCKED only if the dyestuff code scanned or typed equals the component's dyestuff code (case and spacing normalised). A different code (even another valid dyestuff) → `WRONG_DYESTUFF`, nothing changes. Verifying again an already verified component is harmless (it retries whatever is still missing).
11. **Lot and container.** The lot in force is the suggested lot unless a validated lot of this dyestuff was scanned; the container in force is the default container unless an in-service container was scanned. Both must be settled before UNLOCKED. A scanned lot or container may be given before or after identity; it only counts once validated by the Batch & Material context.
12. **Tare belongs to unlocking.** UNLOCKED requires a successful tare of the assigned scale with the container in place; the tare value *returned by the scale* is what is recorded (TD-8). A tare failure leaves identity, lot and container as they were (AWAITING_TARE); weighing stays locked until a later attempt succeeds. Changing the container of an UNLOCKED component or reselecting its scale is **all-or-nothing**: if the re-tare cannot be done, the change is not applied.
13. **A scale in use must be usable (BR-24).** Unlocking, re-tare *(later)* and confirmation *(later)* require the assigned scale to be usable *now*. Calibration expired → `SCALE_CALIBRATION_EXPIRED`; scale not connected → `SCALE_UNAVAILABLE`. The check is one reusable rule so that bolt 010's confirm calls it unchanged. Automatic assignment is re-evaluated when unlock is attempted while the assignment is "none" or no longer usable.
14. **Reselection is a supervisor act.** Only a supervisor authorisation allows a scale to be assigned by hand (mode MANUAL). The chosen scale must exist, be able to carry the ScaleRequirement (inclusive) and be usable; the component must be ACTIVE. A container change that makes a MANUAL scale too small is refused (`SCALE_CAPACITY_INSUFFICIENT`); for an AUTO scale the selection rule is simply re-run. Every successful reselection writes one `SCALE_RESELECT` audit event.
15. **Preparation never survives deactivation** (see ComponentWeighing) and a DONE component keeps its recorded lot, container, scale and tare *(recorded at confirmation — bolt 010)*.

## Domain Services

| Service | Operations | Dependencies |
|---------|------------|--------------|
| **ScaleSelector** *(pure function, shared)* | `selectScale(requirement, scales, now)` → scale \| `NO_SUITABLE_SCALE`; `requirementFor(component, container)`; `isUsable(scale, now)` | none (unit-tested at the boundaries) |
| **ComponentPreparation** *(application service)* | `assignScale(session, sequence)`; `verifyIdentity(sessionId, sequence, code)`; `setLot(sessionId, sequence, code)`; `setContainer(sessionId, sequence, code)`; `reselectScale(sessionId, sequence, scaleId, supervisorBadge, pin)` | WeighingSessionRepository, MaterialService, ScalePort, SupervisorAuthorisationService, AuditLog, clock |
| **SupervisorAuthorisationService** | `authorise(badge, pin)` → supervisor \| `NOT_AUTHORISED` | OperatorRepository, PIN hash verification |
| **ComponentActivation** *(existing, extended)* | activation now also assigns the scale; session start does the same for component 1 | ComponentPreparation |

`ComponentPreparation.verifyIdentity` decision order:
1. Session exists and is IN_PROGRESS; component exists, is ACTIVE (else `COMPONENT_NOT_ACTIVE`, or `COMPONENT_ALREADY_DONE`).
2. Normalise the code. Different from the component's dyestuff → `WRONG_DYESTUFF`.
3. Mark identity VERIFIED.
4. Settle the lot (default: suggested lot, no OrgaTEX call) and the container (default: `defaultContainerFor`).
5. If the assignment is "none" or not usable, re-run automatic selection (`NO_SUITABLE_SCALE` if still none).
6. If lot and container are settled and a usable scale is assigned: tare the scale; record the applied tare; component UNLOCKED. A scale failure here leaves AWAITING_TARE and reports the cause.

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| **ScaleAssigned** | component activated (AUTO) or supervisor reselects (MANUAL) | sessionId, sequence, scaleId \| none, mode, reason, at |
| **DyestuffIdentityVerified** | correct dyestuff submitted | sessionId, sequence, dyestuffCode, at |
| **DyestuffIdentityRejected** | wrong dyestuff submitted | sessionId, sequence, expected, scanned, at *(logged; no state change, not an audit event)* |
| **LotSet** | default settled or valid lot scanned | sessionId, sequence, lotId, source (DEFAULT \| SCANNED), at |
| **ContainerSet** | default settled or valid container scanned | sessionId, sequence, containerId, tare, source, at |
| **ComponentUnlocked** | tare succeeded with identity, lot and container settled | sessionId, sequence, scaleId, containerId, tareApplied, at |
| **ComponentReTared** | container of an unlocked component changed | sessionId, sequence, containerId, tareApplied, at |
| **ScaleReselected** | supervisor assigns a scale by hand | sessionId, sequence, fromScaleId, toScaleId, supervisorId, at → audit `SCALE_RESELECT` |
| **ScaleNotUsable** | calibration expired or scale offline when needed | sessionId, sequence, scaleId, reason, at |

Reaction: **ScaleReselected → AuditLog.record(SCALE_RESELECT)** in the same unit of work as the reselection.

## Repository Interfaces

No new repository. The existing `WeighingSessionRepository.save` persists the extended aggregate (scale assignment and preparation per component) atomically; `OperatorRepository` gains nothing new (supervisors are found by badge); `AuditEventRepository` is unchanged. The ports used are `ScalePort` (existing: `listScales`, `getScale`, `tare`) and the `MaterialService` of bolt 008.

## Ubiquitous Language (additions)

| Term | Definition |
|------|------------|
| **Scale requirement** | Target + tolerance + container tare for a component; the load the scale must be able to carry. |
| **Selection (automatic)** | Choosing, for the active component, the smallest-capacity usable scale that covers its requirement. |
| **Reselection (manual)** | A supervisor choosing the scale by hand; the badge shows "manual". |
| **Usable scale** | Connected and within its calibration date. |
| **Calibration expired** | The scale's calibration due date has passed; the strip shows CAL EXPIRED and weighing on it is refused. |
| **Verify identity** | Scan or type the dyestuff code and have it match the component's dyestuff. |
| **Lot / Container in force** | The default, or the scanned replacement, that will be recorded with the weighing. |
| **Unlock** | The state in which live weighing is permitted: identity verified, lot and container settled, scale tared. |
| **Tare applied** | The tare value the scale reports after the tare command; recorded with the weighing. |
| **Supervisor authorisation** | A supervisor's badge and PIN presented for one action; checked, never stored or logged. |

## Training assumptions and open points

| # | Point | Position in this model |
|---|-------|------------------------|
| M-1 | **How is the container "placed" on the Dummy Scale?** DB-2 says the container is considered placed when weighing unlocks. On a real scale the operator puts the container on the platform; the Dummy Scale must be told. The `_sim` controls are for the Training Panel only (the application must not call them). | **Decide in the Technical Design stage.** Recommended: the tare request carries the container's expected tare; the Dummy Scale, as a documented training behaviour, places that container itself if the platform is empty; a real adapter would instead check that the tare it reads is close to the expected value. |
| M-2 | **Who authorises a reselection?** The brief says "supervisor PIN". With more than one supervisor, a PIN alone does not say who acted, but the audit event must name the supervisor. | Supervisor **badge + PIN** are both submitted; any failure (unknown badge, operator badge, inactive, wrong PIN) gives the same `NOT_AUTHORISED` so nothing is revealed. In training: BDG-0901 with PIN 2580. No lock-out after repeated failures (out of scope for training; noted). |
| M-3 | **Activation never fails because of the scale.** If no scale qualifies, the component is ACTIVE with "none / NO_SUITABLE_SCALE" and cannot be unlocked; a supervisor may still reselect. | Keeps invariant (2) (exactly one ACTIVE component). |
| M-4 | **Reselection resets the unlock.** A new scale has its own tare, so the component returns to AWAITING_TARE and is tared on the new scale in the same operation (all-or-nothing). | Safe for the operator: no weight can be read against the old tare. |
| M-5 | **Calibration is evaluated at the moment of use**, from the scale's due date, not remembered. | A scale expiring while a component is unlocked blocks the *next* check (re-tare, confirm), not the display. |

## Coverage of acceptance criteria

| Story | Criterion | Covered by |
|-------|-----------|-----------|
| 004 | `DYE-4471` for active Yellow → verified, lot 2026-0387, container C-12, tared, UNLOCKED | invariants 10–12, `verifyIdentity` steps 3–6 |
| 004 | `DYE-2204` → `WRONG_DYESTUFF`, nothing unlocks | invariant 10, step 2 |
| 004 | Valid lot or container replaces the default; container change re-tares | invariants 11, 12; `setLot`, `setContainer` |
| 004 | Not unlocked → confirm gives `IDENTITY_NOT_VERIFIED` | preparation state; the guard is enforced by bolt 010's confirm |
| 004 | Scale unavailable at unlock → identity verified, tare pending | invariant 12, state AWAITING_TARE |
| 005 | Blue, Red, Yellow → 3 kg; Sodium Sulphate, Soda Ash → 32 kg | invariant 9, ScaleRequirement |
| 005 | Requirement equal to 3 kg capacity → 3 kg; just above → 32 kg | invariant 9 (inclusive) |
| 005 | Smaller scale expired or disconnected → next suitable; none → `NO_SUITABLE_SCALE` | invariants 8, 9, 13 |
| 005 | Active component carries scale and mode AUTO | ScaleAssignment, invariant 8 |
| 005 | Mixed g / kg compared exactly | ScaleRequirement (decimal, unit-converted) |
| 006 | Valid supervisor PIN and capable scale → MANUAL and `SCALE_RESELECT` audit | invariant 14, SupervisorAuthorisationService, ScaleReselected |
| 006 | Operator or wrong PIN → `NOT_AUTHORISED` | SupervisorAuthorisationService (M-2) |
| 006 | Insufficient capacity → `SCALE_CAPACITY_INSUFFICIENT` | invariant 14 |
| 007 | Expired scale is skipped at activation (or `NO_SUITABLE_SCALE` with reason) | invariants 8, 9, 13 |
| 007 | Component on a scale that expires → `SCALE_CALIBRATION_EXPIRED` at confirm | invariant 13 (shared rule; the confirm call is added in bolt 010) |
| 007 | Valid calibration → no effect | invariant 13 |

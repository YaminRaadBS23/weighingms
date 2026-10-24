---
unit: 004-weighing-station
bolt: 010-weighing-station
stage: model
status: complete
updated: 2026-10-24T17:45:55Z
---

# Static Model - Weighing Station (bolt 10: tolerance, confirmation, progression, re-tare, quit)

Scope of this model: what happens from a **live weight** to a **confirmed, recorded component**, how the batch moves from one component to the next until it is **complete**, and how the operator can **re-tare** or **quit and resume**. It extends the models of bolts 006 (operator, session, component states, audit) and 009 (scale assignment and preparation); everything there stays valid. Overshoot recovery and supervisor override (bolt 012), write-back and ticket (bolts 014, 015) and the screens (bolts 011, 013, 016) are named only where the boundary needs to be clear, and marked *(later)*.

Stories covered: `008-tolerance-evaluation-rules`, `009-confirm-weighing-in-tolerance`, `010-component-progression-and-batch-completion`, `011-re-tare`, `012-quit-and-resume`. Requirements: FR-15, FR-17, FR-18, FR-19, FR-20 (surplus figure), FR-23, FR-24, FR-25, FR-26, IR-06, BR-07, BR-11, NFR-4, NFR-5, NFR-6, NFR-8, NFR-9, TD-5, TD-9, TD-14. Carried from bolt 009: the confirm endpoint must refuse a locked component (`IDENTITY_NOT_VERIFIED`) and an expired scale (`SCALE_CALIBRATION_EXPIRED`).

## Bounded Context

Same **Weighing (station) context**. New relationships:

| Neighbour | Relationship | What crosses the boundary |
|-----------|--------------|---------------------------|
| Device context (`ScalePort`) | Customer → supplier through a port | **a fresh reading** (net weight, stable, connected) at the moment of confirmation; tare command for re-tare; scale info for calibration |
| Completion context (bolts 014, 015) | Downstream | the *batch completed* hand-off (session, records) — write-back, summary and ticket are theirs |
| Audit | Internal | `ABANDON` events written by quit |
| Station UI | Client | never supplies a weight: confirmation is a command without a measurement |

The key rule of this bolt: **the server measures.** The UI shows the live weight it polls, but the weight that is judged and recorded is the one the server reads from the scale at the moment it handles the confirm command (FR-18). A client cannot claim a weight.

## Domain Entities

| Entity | Properties (new in this bolt marked ✚) | Business Rules |
|--------|-----------------------------------------|----------------|
| **WeighingSession** *(aggregate root)* | as bolts 006/009 ✚ completedAt used | Gains: *confirm component*, *complete*, *re-tare*, *suspend (quit)*, *resume*. Status IN_PROGRESS \| SUSPENDED \| COMPLETED now all occur. COMPLETED is terminal. |
| **ComponentWeighing** *(inside the session)* | state PENDING \| ACTIVE \| DONE, scale assignment, preparation ✚ confirmedAt | DONE is final and is reached only by a confirmation. A DONE component keeps no preparation (its facts live in its record). |
| ✚ **WeighingRecord** *(own aggregate, append-only)* | recordId, sessionId, batchId, sequence, dyestuff (code, name), **actual**, **target**, **toleranceLower**, **toleranceUpper**, **lotId**, **containerId**, **tare**, **scaleId**, **operatorId**, **confirmedAt**, **result**, surplus (nullable) | Written once at confirmation, never changed or deleted (NFR-8); exactly one per DONE component (session + sequence unique). Holds a **snapshot** of target and limits, so later recipe changes cannot alter history (BR-11). In this bolt `result` is `IN_TOLERANCE`; `OVERRIDDEN` and any overshoot-rule result arrive in bolt 012. `surplus` stays empty here. |
| **AuditEvent** | as bolt 006 | `ABANDON` is written by quit: actor = signed-in operator, detail = component, weight at the moment if known. |
| **Operator**, **Station**, **Scale**, **Container** | as before | The operator on a record is the operator signed in at the station when the confirmation is made (ADR-2). |

## Value Objects

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| ✚ **ToleranceBand** | lower, upper (= target − tol, target + tol) | Absolute ± from the recipe (TD-5); **boundaries inclusive**; computed with exact decimals. |
| ✚ **ToleranceZone** | UNDER \| NEAR \| OK \| OVER | **OK**: lower ≤ weight ≤ upper. **OVER**: weight > upper. **NEAR**: weight < lower and weight ≥ 90 % of target. **UNDER**: weight < 90 % of target — including 0 and negative weights. Only OK is confirmable (in this bolt). |
| ✚ **Surplus** | amount (weight − target), percent (amount ÷ target × 100) | Shown for OVER weights, one decimal ("+2.4 g (+2.6 %)"). The reference point (target vs upper limit) is a single function so the Step 24 decision can change it in one place. |
| ✚ **Reading** | net (Quantity), stable, at, connected | One fresh reading from the scale. Confirmable only if connected and stable (TD-9). |
| ✚ **RecordResult** | IN_TOLERANCE *(later: OVERRIDDEN, …)* | Closed list, extended by the Step 24 decision. |
| ✚ **ConfirmationDecision** | accepted \| refused(reason) | Reasons, in order: session not in progress → component not active → locked → scale not usable → scale unreachable → unstable → zone not OK. |
| **Quantity**, **ScaleAssignment**, **Preparation**, **ComponentSpec**, **RecipeSnapshot** | as before | — |

## Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|------------|
| **WeighingSession** | ComponentWeighing ×n, RecipeSnapshot | Invariants (1)–(15) of bolts 006/009 stay. Adjusted: **(2)** while IN_PROGRESS and not all components are DONE, exactly one is ACTIVE; a SUSPENDED or COMPLETED session has none. New: see below. |
| **WeighingRecord** | — | Immutable after creation; one per (session, sequence). |
| **Station** | — | At most one IN_PROGRESS session (ADR-3): a SUSPENDED session can be resumed only when none is in progress. |

New invariants (numbering continues):

16. **Only a confirmation makes a component DONE.** A confirmation is accepted only if: the session is IN_PROGRESS; the component is ACTIVE and UNLOCKED (identity, lot, container, tare — else `IDENTITY_NOT_VERIFIED`); the assigned scale is usable now (`SCALE_CALIBRATION_EXPIRED` / `SCALE_UNAVAILABLE`); the server's fresh reading is connected and **stable** (`READING_UNSTABLE`); and the reading's zone is **OK** (`TOLERANCE_VIOLATION`). The judged weight is the server's reading; nothing the client sends is used as a weight.
17. **One immutable record per confirmation, committed with the state change.** The WeighingRecord, the component becoming DONE, the next component becoming ACTIVE and (for the last component) the session becoming COMPLETED are **one atomic unit**: either all happen or none (NFR-5). The record holds actual, target, lower and upper limit, lot, container, tare (as reported by the scale), scale, operator, time and result — every field of FR-19.
18. **Progression.** After a confirmation the lowest-sequence PENDING component becomes ACTIVE (its scale is assigned as in bolt 009). B-24187 therefore runs Blue → Red → Yellow → Sodium Sulphate → Soda Ash unless the operator chose another order (TD-13). Confirming an already DONE component → `COMPONENT_ALREADY_DONE` (a double click is harmless).
19. **Completion.** A session may be COMPLETED only if **every** component is DONE (`BATCH_INCOMPLETE` otherwise). The last confirmation completes the session automatically in the same unit; completing explicitly is also possible and is idempotent on a completed session. After COMPLETED, every component action is refused with `SESSION_COMPLETED` (409). Completion raises the hand-off to the Completion context; **the OrgaTEX status WEIGHED is set by the consumption write-back in bolt 014**, together with the posting (FR-27), not here.
20. **Re-tare.** Allowed only for an ACTIVE, UNLOCKED component on a usable scale. The scale is tared at its current load (container in place, the operator having emptied it), the reported tare replaces the component's tare, and **no record is written**. A DONE component cannot be re-tared (`COMPONENT_ALREADY_DONE`, 409). If the scale cannot be reached nothing changes (`SCALE_UNAVAILABLE`, 503). An over or surplus state is not stored — it follows the live weight — so it disappears with the new zero.
21. **Quit and resume.** Quit is allowed for an IN_PROGRESS session: the active component's unconfirmed preparation is abandoned (it returns to PENDING), the session becomes SUSPENDED, all DONE components and their records are untouched, and one `ABANDON` audit event is written in the same unit. The batch stays WEIGHING at OrgaTEX (no call). **Resume** (starting the batch again) turns a SUSPENDED session IN_PROGRESS, makes the **lowest PENDING component ACTIVE and locked** (its scale chosen afresh) — provided no other session is in progress (`SESSION_IN_PROGRESS`). Quit is not re-tare: nothing about the scale is changed by it.

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| **ComponentConfirmed** | accepted confirmation | sessionId, sequence, recordId, actual, result, operatorId, at |
| **ConfirmationRefused** | refused confirmation | sessionId, sequence, reason, at *(logged; no state change, not an audit event)* |
| **ComponentActivated** | next component becomes active | as bolt 006 |
| **BatchCompleted** | last component confirmed (or explicit complete) | sessionId, batchId, recordCount, completedAt → hand-off to the Completion context |
| **ComponentReTared** | re-tare succeeded | sessionId, sequence, tareApplied, at |
| **WeighingAbandoned** | quit | sessionId, sequence of the abandoned component or none, weight if known, operatorId, at → audit `ABANDON` |
| **SessionSuspended** / **SessionResumed** | quit / start again | sessionId, batchId, operatorId, at |

Reactions: **ComponentConfirmed → WeighingRecord appended** and **BatchCompleted → completion hand-off** (the write-back itself is bolt 014); **WeighingAbandoned → AuditLog.record(ABANDON)**, in the same unit of work.

## Domain Services

| Service | Operations | Dependencies |
|---------|------------|--------------|
| ✚ **ToleranceEvaluator** *(pure functions, shared server + UI)* | `toleranceBand(spec)`, `evaluateZone(weight, spec)`, `surplus(weight, spec)`, `isConfirmable(zone)` | none (exhaustively unit-tested at every boundary, g and kg) |
| ✚ **ComponentConfirmation** *(application)* | `confirm(sessionId, sequence)` → record; `complete(sessionId)` | WeighingSessionRepository, WeighingRecordRepository, ScalePort (fresh read, scale info), ComponentPreparation (next component's scale), operator identification, clock, ids |
| ✚ **ComponentReTare** *(application)* | `retare(sessionId, sequence)` | ScalePort, session repository |
| ✚ **SessionSuspension** *(application)* | `quit(sessionId)`; resume is part of `SessionStarter.startOrResume` | session repository, AuditLog, ScalePort (best-effort weight for the audit detail), ComponentPreparation |
| **SessionStarter** *(extended)* | start or **resume**: a SUSPENDED open session is resumed after the one-in-progress check | as bolt 006 |

`ComponentConfirmation.confirm` decision order:
1. A signed-in operator exists (else `NOT_SIGNED_IN`).
2. Session exists; IN_PROGRESS (else `SESSION_COMPLETED` / `SESSION_NOT_IN_PROGRESS`); component exists and is ACTIVE (else `COMPONENT_ALREADY_DONE` / `COMPONENT_NOT_ACTIVE`).
3. Component is UNLOCKED (else `IDENTITY_NOT_VERIFIED`).
4. The assigned scale is usable now (`SCALE_CALIBRATION_EXPIRED`, `SCALE_UNAVAILABLE`).
5. Take **one fresh reading**: not connected → `SCALE_UNAVAILABLE`; not stable → `READING_UNSTABLE`.
6. Evaluate the zone of the reading; not OK → `TOLERANCE_VIOLATION` (details: zone, weight, limits).
7. Build the record from the reading and the component's facts; commit record + DONE + next ACTIVE (+ COMPLETED) atomically.

## Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| **WeighingSessionRepository** | WeighingSession | unchanged; `save` is atomic and now also carries SUSPENDED / COMPLETED states |
| ✚ **WeighingRecordRepository** | WeighingRecord | `append(record)`, `listBySession(sessionId)` (in sequence order), `findBySessionAndSequence(sessionId, sequence)` — **no update or delete method exists** |
| **AuditEventRepository** | AuditEvent | unchanged |
| *(unit of work)* | — | the confirm and quit operations write several repositories as one transaction (as the reselection in bolt 009) |

## Ubiquitous Language (additions)

| Term | Definition |
|------|------------|
| **Tolerance band** | The range [target − tol, target + tol], limits included, inside which a weight may be confirmed. |
| **Zone** | Where a weight lies relative to the band: under, near (≥ 90 % of target but below the band), ok, over. |
| **Surplus** | By how much a weight exceeds the target, as an amount and a percentage of the target. |
| **Stable reading** | A scale reading that has not changed for the settling time; only stable readings can be confirmed. |
| **Confirm** | The operator command that makes the server read the scale, judge the weight and, if it is OK, record it. |
| **Weighing record** | The immutable record of one confirmed component: actual and target with limits, lot, container, tare, scale, operator, time, result. |
| **Done** | A component that has a weighing record; final. |
| **Complete** | The state of a session whose components are all done; the batch is ready for write-back and ticket. |
| **Re-tare** | Zeroing the scale again with the (emptied) container in place; replaces the tare, writes no record. |
| **Quit / Suspend** | Leaving the batch: the weighing in progress is abandoned, done components are kept, the session waits. |
| **Resume** | Starting a suspended batch again: it continues at the first component not yet done, locked until the dyestuff is scanned. |

## Training assumptions and open points

| # | Point | Position in this model |
|---|-------|------------------------|
| O-1 | **Completion trigger.** Story 010 allows "complete is called (or automatically after the last confirm)". | **Automatic at the last confirmation**, in the same atomic unit as the record; `POST …/complete` also exists (idempotent; `BATCH_INCOMPLETE` while components are open). One step fewer for the operator and no window where all components are done but the session is open. |
| O-2 | **When does OrgaTEX become WEIGHED?** Story 010 says "completed, OrgaTEX status WEIGHED"; FR-27 says the consumption posting moves it to WEIGHED. | **Left to the write-back in bolt 014**: WEIGHED with no actuals posted would be misleading, and the posting and the status must succeed or be retried together. Completion in this bolt makes **no OrgaTEX call**, so it works with OrgaTEX offline (TD-1). The wording of story 010's criterion is amended accordingly. |
| O-3 | **What is active in a suspended session?** FR-24: "resumes at the next not-done component". | Nothing is active while SUSPENDED; resume activates the **lowest PENDING** component (an operator's earlier out-of-order choice is not remembered — TD-13 is a per-visit choice). |
| O-4 | **Re-tare semantics.** FR-23: "re-zeroes the scale with the container in place and resets the unconfirmed weighing". | The operator is assumed to have emptied the container; the scale is tared at its current load and the reported tare replaces the old one. The recorded **actual is the net after the last tare**. Dyestuff dispensed before a re-tare is not part of the recorded actual — a prototype behaviour to be confirmed with FCI (noted for the pilot questions). |
| O-5 | **Zone for a zero or negative weight** (story 008 edge cases). | UNDER; never confirmable. |
| O-6 | **Forward compatibility with Step 24.** | The record has a result field and a nullable surplus; in this bolt anything but zone OK is refused. Whether an over-tolerance weight can ever be recorded (override, recovery) is decided at Step 24 and implemented in bolt 012 without changing this bolt's records. |
| O-7 | **Who is the operator on a record?** | The operator signed in at confirmation time (ADR-2), which can differ from the one who started the session if the shift changed. |

## Coverage of acceptance criteria

| Story | Criterion | Covered by |
|-------|-----------|-----------|
| 008 | Yellow 94.0 ±0.5: 93.4 not confirmable, 93.5 / 94.0 / 94.5 OK, 94.6 OVER | ToleranceBand, ToleranceZone |
| 008 | 84.6 g (90 % of target) is NEAR, 84.5 g UNDER | ToleranceZone |
| 008 | Sodium Sulphate 24.000 ±0.120 kg: 23.879 not confirmable, 23.880 and 24.120 OK, 24.121 OVER | ToleranceBand (kg) |
| 008 | 96.4 g → +2.4 g and +2.6 % | Surplus |
| 008 | Decimal arithmetic; weight 0 / negative → UNDER | value objects, O-5 |
| 009 | Yellow unlocked, stable 94.2 g → record with every field, component DONE | invariants 16, 17; WeighingRecord |
| 009 | 94.6 g → 422 `TOLERANCE_VIOLATION`, nothing recorded, even if the client claims 94.2 | invariant 16 (the server measures) |
| 009 | Unstable → `READING_UNSTABLE` (409); disconnected → `SCALE_UNAVAILABLE` (503) | confirm steps 4–5 |
| 009 | No update/delete of records | WeighingRecord repository (no such method) |
| 009 | `GET …/records` returns the records | WeighingRecordRepository.listBySession |
| 009 | Double click → `COMPONENT_ALREADY_DONE` | invariant 18 |
| 004 (bolt 009 carry) | Not unlocked → `IDENTITY_NOT_VERIFIED` | confirm step 3 |
| 007 (bolt 009 carry) | Scale expired → `SCALE_CALIBRATION_EXPIRED` | confirm step 4 |
| 010 | Blue confirmed → Red ACTIVE | invariant 18 |
| 010 | 4 of 5 done → complete gives `BATCH_INCOMPLETE` (422) | invariant 19 |
| 010 | All 5 done → COMPLETED (automatically after the last confirm, or by complete) | invariant 19, O-1 |
| 010 | OrgaTEX status WEIGHED | **moved to bolt 014 (O-2)** |
| 010 | Completed session → component actions give `SESSION_COMPLETED` (409) | invariant 19 |
| 010 | OrgaTEX offline at completion → session still completes | invariant 19 (no OrgaTEX call) |
| 011 | Yellow at 50.0 g, re-tare → net 0.0 g, still-to-weigh 94.0 g | invariant 20 |
| 011 | Over state clears; new tare is the one recorded; no record; DONE → 409 | invariant 20 |
| 011 | Scale unavailable → 503, state unchanged | invariant 20 |
| 012 | Quit mid-batch → abandoned, `ABANDON` audit, SUSPENDED, batch stays WEIGHING | invariant 21 |
| 012 | Select the batch again → Blue and Red DONE, Yellow ACTIVE (locked) | invariant 21, O-3 |
| 012 | Browser reload → in-progress session resumed | existing `/sessions/current` (persisted aggregate) |
| 012 | Quit with nothing weighed → allowed, audit records no weight | WeighingAbandoned |

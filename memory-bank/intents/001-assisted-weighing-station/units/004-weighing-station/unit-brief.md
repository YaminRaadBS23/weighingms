---
unit: 004-weighing-station
intent: 001-assisted-weighing-station
phase: inception
status: stories-defined
unit_type: backend
default_bolt_type: ddd-construction-bolt
created: 2026-10-15T12:21:05Z
updated: 2026-10-15T12:24:22Z
---

# Unit Brief: Weighing Station (core domain)

## Purpose

The core of WeighingMS: guarantee that every component of a batch is weighed on the right scale, from the right material, inside tolerance (or with authorised override), and that exactly what was weighed is permanently recorded and attributable. This unit is the business logic behind the Weigh screen — **not** the screen itself.

## Scope

### In Scope
- **Operator session**: badge identification (operator/supervisor roles, seed DB-5); supervisor PIN verification (hashed)
- **Weighing session aggregate** per batch: start (batch → WEIGHING via 003/001), component states pending/active/done, active-component switching, resume after reload/restart, quit/abandon
- **Component preparation**: identity verification (scanned/typed code = component dyestuff), lot and container in force (validated by 003), automatic tare on unlock (via `ScalePort`)
- **Scale selection** rule (TD-2) and supervisor reselection; **calibration enforcement**
- **Tolerance evaluation** (zones under/near/ok/over, inclusive band) and **surplus** — pure functions in `src/shared/domain/` shared with the UI
- **Confirmation**: server re-reads the scale; requires verified identity, connected + calibrated + stable scale, ok zone (or override); writes an immutable **weighing record** with snapshot of target/tolerance and the full traceability set
- **Overshoot recovery** per the Step 24 decision (TD-10); **supervisor override** (PIN + reason)
- **Re-tare**; **progression** to next pending; **completion guard** (all done) → batch completed (WEIGHED) → hands over to 005
- **Audit trail**: OVERRIDE, SCALE_RESELECT, ABANDON (+ events written by 005)

### Out of Scope
- Device access and simulation (→ 002), batch/recipe/material retrieval and validation (→ 003), write-back and ticket (→ 005), presentation (→ 006)

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Operator identification | Must |
| FR-6 | Component list and states | Must |
| FR-7 | Dyestuff identity verification | Must |
| FR-11 | Automatic scale selection | Must |
| FR-12 | Supervisor manual scale reselection | Should |
| FR-13 | Scale calibration status (enforcement) | Should |
| FR-17 | Tolerance evaluation and signalling | Must |
| FR-18 | Confirmation gating | Must |
| FR-19 | Confirmation record | Must |
| FR-20 | Overshoot detection | Must |
| FR-21 | Overshoot recovery (rule at Step 24) | Must |
| FR-22 | Supervisor override | Must |
| FR-23 | Re-tare | Must |
| FR-24 | Quit and resume | Must |
| FR-25 | Component progression | Must |
| FR-26 | Batch completion | Must |
| FR-37 | Audit trail | Must |
| DB-5 | Station seed: operator R. Karim (Shift A), supervisor + PIN | Must |
| NFR-4, 5, 6, 8, 9, 14 | Decimal, durability, resume, immutability, snapshot, privileged actions | Must |

---

## Domain Concepts

### Key Entities
| Entity | Description | Attributes |
|--------|-------------|------------|
| Operator | Person at the station | operatorId, badgeId, name, shift, role (OPERATOR/SUPERVISOR), pinHash, active |
| WeighingSession (aggregate root) | One batch being weighed | sessionId, batchId, operatorId, recipe snapshot, startedAt, completedAt, status (IN_PROGRESS/COMPLETED/ABANDONED), activeComponent |
| ComponentWeighing | Per-component progress in the session | sequence, state (PENDING/ACTIVE/DONE), identityVerified, lotId, containerId, scaleId, selectionMode (AUTO/MANUAL), tare |
| WeighingRecord (immutable) | The traceability record | recordId, sessionId, component, dyestuffCode, actual, unit, target, tolMin, tolMax, lotId, containerId, tare, scaleId, operatorId, confirmedAt, result (IN_TOLERANCE/OVERRIDDEN/…), surplus |
| Override | Supervisor authorisation | overrideId, recordId, supervisorId, reason, authorisedAt |
| AuditEvent | Privileged/exceptional action | eventId, sessionId, type, actorId, detail, occurredAt |

### Value Objects / Pure Rules (`src/shared/domain/`)
Quantity (decimal + unit), ToleranceBand, `evaluateZone(weight, target, tol)`, `surplus(weight, target)`, `selectScale(component, tare, scales)`, `canConfirm(state)`, `nextPendingComponent(session)`, `isBatchComplete(session)`.

### Key Operations
| Operation | Inputs | Outputs |
|-----------|--------|---------|
| identifyOperator | badgeId | operator |
| startOrResumeSession | batchId, operator | session |
| activateComponent | session, sequence | component state |
| verifyIdentity / setLot / setContainer | scanned/typed code | unlocked component + tare applied |
| reselectScale | supervisor PIN, scaleId | component scale (MANUAL) + audit |
| confirm | session, component | WeighingRecord (server-read weight) or TOLERANCE_VIOLATION / SCALE_UNAVAILABLE / … |
| override | supervisor PIN, reason | WeighingRecord (OVERRIDDEN) + Override + audit |
| retare | component | new tare |
| quit | session | session suspended; ABANDON audit |
| completeBatch | session | COMPLETED (or BATCH_INCOMPLETE) |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 15 |
| Must Have | 13 |
| Should Have | 2 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 001-operator-sign-in | Operator sign-in by badge | Must | Planned |
| 002-start-or-resume-weighing-session | Start or resume a weighing session | Must | Planned |
| 003-component-states-and-activation | Component states and activation | Must | Planned |
| 004-verify-dyestuff-identity-and-unlock | Verify dyestuff identity, lot and container, then unlock weighing | Must | Planned |
| 005-automatic-scale-selection | Automatic scale selection | Must | Planned |
| 006-supervisor-scale-reselection | Supervisor scale reselection | Should | Planned |
| 007-calibration-enforcement | Block weighing on an expired scale | Should | Planned |
| 008-tolerance-evaluation-rules | Tolerance evaluation and surplus rules | Must | Planned |
| 009-confirm-weighing-in-tolerance | Confirm a weighing inside tolerance | Must | Planned |
| 010-component-progression-and-batch-completion | Component progression and batch completion | Must | Planned |
| 011-re-tare | Re-tare the active component | Must | Planned |
| 012-quit-and-resume | Quit safely and resume later | Must | Planned |
| 013-supervisor-override | Supervisor override of an out-of-tolerance weight | Must | Planned |
| 014-overshoot-detection-and-recovery | Overshoot detection and recovery | Must | Planned |
| 015-audit-trail | Immutable audit trail | Must | Planned |

---

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| 002-device-integration | `ScalePort` (read, tare, status, calibration), `ScannerPort` |
| 003-batch-and-material | Batch resolution, recipe, lot/container validation |

### Depended By
| Unit | Reason |
|------|--------|
| 005-completion-and-ticketing | Completed session and records |
| 006-assisted-weighing-station-ui | Session/component/confirm APIs; shared pure rules |

### External Dependencies
None directly (all through 002/003).

---

## Technical Context

### Suggested Technology
DDD layering inside `modules/weighing` (domain / application / infrastructure / routes); Drizzle on `weighingms.db`; `decimal.js`; synchronous SQLite transactions for confirmation; hashed PINs.

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| 002, 003 | Ports / services | in-process |
| UI | session, component, confirm, override, retare, quit, complete endpoints | REST/JSON |

### Data Storage
| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Operators, sessions, records, overrides, audit | SQLite `weighingms.db` | small | append-only (records, overrides, audit) |

---

## Constraints

- Server is authoritative: every state change re-evaluated with a fresh scale reading.
- Records, overrides and audit events are never updated or deleted.
- Overshoot follows the Step 24 decision (TD-10, Option A): no recipe recalculation is ever performed.

---

## Success Criteria

### Functional
- [ ] Boundary tests: 93.4 ✗, 93.5 ✓, 94.0 ✓, 94.5 ✓, 94.6 ✗ (g) and kg equivalents
- [ ] Scale selection: Blue/Red/Yellow → `scale-3kg`; Sulphate/Soda Ash → `scale-32kg`
- [ ] Crafted confirm while out of tolerance → 422, nothing recorded
- [ ] Record contains actual, operator, component, lot, container, tare, scale, timestamp (+ snapshot)
- [ ] Override impossible without supervisor PIN + reason
- [ ] Quit → resume with confirmed components intact; completion refused while incomplete

### Non-Functional
- [ ] Record committed before response; resume after restart

### Quality
- [ ] Unit tests for every pure rule; application/API tests with fake ports; all acceptance criteria met

---

## Bolt Plan

Planned in workbook Step 12 (`memory-bank/bolts/`).

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| 006-weighing-station | DDD | 001, 002, 003, 015 | Model and implement operator sign-in, the WeighingSession aggregate (start/resume, component states, activation) and the immutable audit trail. |
| 009-weighing-station | DDD | 004, 005, 006, 007 | Model and implement component preparation: automatic scale selection, calibration enforcement, supervisor reselection, and identity/lot/container verification with automatic tare. |
| 010-weighing-station | DDD | 008, 009, 010, 011, 012 | Model and implement tolerance rules, server-authoritative confirmation with immutable records, component progression, batch completion guard, re-tare and quit/resume. |
| 012-weighing-station | DDD | 013, 014 | Implement the Step 24 overshoot rule and supervisor override. |

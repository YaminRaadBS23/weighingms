---
last_updated: 2026-10-26T09:30:00Z
total_decisions: 9
---

# Decision Index

This index tracks all Architecture Decision Records (ADRs) created during Construction bolts.
Use this to find relevant prior decisions when working on related features.

## How to Use

**For Agents**: Scan the "Read when" fields below to identify decisions relevant to your current task. Before implementing new features, check if existing ADRs constrain or guide your approach. Load the full ADR for matching entries.

**For Humans**: Browse decisions chronologically or search for keywords. Each entry links to the full ADR with complete context, alternatives considered, and consequences.

---

## Decisions

### ADR-9: Override facts live on the immutable weighing record
- **Status**: accepted
- **Date**: 2026-10-26
- **Bolt**: 012-weighing-station (weighing-station)
- **Path**: `bolts/012-weighing-station/adr-9-override-facts-live-on-the-immutable-record.md`
- **Summary**: Supervisor, reason, zone and time of an override are nullable columns on `weighing_records`; a record is OVERRIDDEN exactly when they are set, enforced by an insert trigger; the OVERRIDE audit event is written in the same transaction.
- **Read when**: Working on overrides, the weighing record, the ticket or summary, the OrgaTEX write-back of the result, or the audit trail.

### ADR-8: Completion is automatic at the last confirmation and makes no OrgaTEX call
- **Status**: accepted
- **Date**: 2026-10-26
- **Bolt**: 010-weighing-station (weighing-station)
- **Path**: `bolts/010-weighing-station/adr-8-completion-automatic-and-independent-of-orgatex.md`
- **Summary**: The last confirmation completes the session in the same transaction as its record; completion never calls OrgaTEX, and the WEIGHED status is set by the consumption write-back (bolt 014).
- **Read when**: Working on batch completion, the write-back, the Confirm & print screen, or quit/resume of sessions.

### ADR-7: The server measures — confirmation is a command without a weight
- **Status**: accepted
- **Date**: 2026-10-26
- **Bolt**: 010-weighing-station (weighing-station)
- **Path**: `bolts/010-weighing-station/adr-7-server-measures-confirmation-has-no-weight.md`
- **Summary**: Confirm takes no weight; the server reads the scale once and uses that reading for stability, tolerance zone and the recorded actual.
- **Read when**: Changing confirmation, override or overshoot handling; building the Weigh screen's OK button; integrating a real scale.

### ADR-6: Serialise preparation operations per session with an in-process lock
- **Status**: accepted
- **Date**: 2026-10-24
- **Bolt**: 009-weighing-station (weighing-station)
- **Path**: `bolts/009-weighing-station/adr-6-serialise-preparation-operations-per-session.md`
- **Summary**: Preparation operations await devices between load and save; a per-session async lock prevents lost updates (double scans) in the single-process station.
- **Read when**: Adding session operations that call devices or OrgaTEX between load and save; considering several server processes or an optimistic-concurrency scheme.

### ADR-5: An accepted action whose follow-up cannot be done reports state, not an error
- **Status**: accepted
- **Date**: 2026-10-24
- **Bolt**: 009-weighing-station (weighing-station)
- **Path**: `bolts/009-weighing-station/adr-5-unlock-outcome-is-state-not-error.md`
- **Summary**: Refused calls return errors and change nothing; accepted calls return 200 with `preparation.state` and `issue` (e.g. tare pending). Changes to an unlocked setup are all-or-nothing.
- **Read when**: Adding endpoints with multi-step effects, building the UI scan prompts, or handling scale failures during unlock, container change or reselection.

### ADR-4: The Dummy Scale places the expected container when asked to tare
- **Status**: accepted
- **Date**: 2026-10-24
- **Bolt**: 009-weighing-station (weighing-station)
- **Path**: `bolts/009-weighing-station/adr-4-dummy-scale-places-expected-container-on-tare.md`
- **Summary**: `ScalePort.tare` carries the container's expected tare; the Dummy Scale places a fresh container before taring unless the trainer deliberately put one on since the last tare, so the unlock demo needs no `_sim` calls.
- **Read when**: Changing the tare flow, the Dummy Scale contract or the Training Panel; integrating a real scale; writing tests that place containers.

### ADR-3: One batch in progress per station
- **Status**: accepted
- **Date**: 2026-10-16
- **Bolt**: 006-weighing-station (weighing-station)
- **Path**: `bolts/006-weighing-station/adr-3-one-batch-in-progress-per-station.md`
- **Summary**: The prototype assumes one operator weighs one component at a time against an OrgaTEX-owned queue. A station has at most one in-progress weighing session; switching batches requires an explicit quit.
- **Read when**: Starting, resuming, quitting or switching weighing sessions; designing the batch selection or weigh screens; considering multi-batch or multi-station operation.

### ADR-2: Keep the signed-in operator as server-side station state
- **Status**: accepted
- **Date**: 2026-10-16
- **Bolt**: 006-weighing-station (weighing-station)
- **Path**: `bolts/006-weighing-station/adr-2-station-level-operator-sign-in.md`
- **Summary**: Every weighing must be attributable to an identified operator at a single local station. The signed-in operator is server-side station state set by badge sign-in, with no browser tokens.
- **Read when**: Working on sign-in, operator attribution, supervisor authorisation, authentication, or adding more terminals, stations or remote clients.

### ADR-1: Enforce audit-event immutability with database triggers
- **Status**: accepted
- **Date**: 2026-10-16
- **Bolt**: 006-weighing-station (weighing-station)
- **Path**: `bolts/006-weighing-station/adr-1-audit-immutability-database-triggers.md`
- **Summary**: Audit events record privileged and exceptional actions and must never be changed or deleted. Immutability is enforced by the repository API, the absence of endpoints, and SQLite triggers that abort UPDATE and DELETE.
- **Read when**: Writing to or migrating `weighingms.db`, adding audit event types, building correction or reporting features, or touching append-only records (weighing records, overrides).

---
last_updated: 2026-10-16T08:41:17Z
total_decisions: 3
---

# Decision Index

This index tracks all Architecture Decision Records (ADRs) created during Construction bolts.
Use this to find relevant prior decisions when working on related features.

## How to Use

**For Agents**: Scan the "Read when" fields below to identify decisions relevant to your current task. Before implementing new features, check if existing ADRs constrain or guide your approach. Load the full ADR for matching entries.

**For Humans**: Browse decisions chronologically or search for keywords. Each entry links to the full ADR with complete context, alternatives considered, and consequences.

---

## Decisions

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

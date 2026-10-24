---
bolt: 009-weighing-station
created: 2026-10-24T11:28:06Z
status: accepted
superseded_by: null
---

# ADR-6: Serialise preparation operations per session with an in-process lock

## Context

The preparation operations load the session, wait for a scale or OrgaTEX (`await`), then save the whole aggregate. Two requests for the same session can interleave at those `await`s — for example a double scan of the dyestuff, or a lot scan arriving while a tare is in progress — and the later save would overwrite the earlier one (lost update).

## Decision

A small per-session **async lock** (a promise chain keyed by session ID, in the application layer) runs the preparation operations of one session one after another. Different sessions are not affected. Reads do not take the lock.

## Rationale

WeighingMS is one process serving one station (`system-architecture.md`), so an in-process lock fully prevents the problem with a few lines and no schema change.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Optimistic version column, retry on conflict | Works across processes | Schema change, retry logic, conflicting scans would fail instead of queueing | Overkill for one process |
| Hold a database transaction across the awaits | Strong | SQLite writer locked while waiting on devices/network | Blocks everything |
| Do nothing | Simplest | Real lost-update risk with double scans | Unsafe |

## Consequences

### Positive

- No lost updates; scans queue in the order they arrive.

### Negative

- A slow scale call delays the next operation on that session (bounded by the scale timeout).

### Risks

- Running several server processes against one database would defeat the lock; that would need the optimistic alternative.

## Related

- **Stories**: `004-verify-dyestuff-identity-and-unlock`, `006-supervisor-scale-reselection`
- **Requirements**: NFR-5, NFR-6
- **Standards**: `system-architecture.md` (single process)
- **Previous ADRs**: ADR-3

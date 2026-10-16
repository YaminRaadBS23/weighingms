---
bolt: 006-weighing-station
created: 2026-10-16T08:41:17Z
status: accepted
superseded_by: null
---

# ADR-3: One batch in progress per station

## Context

The prototype's stated assumption is that **one operator weighs one component at a time against a queue owned by OrgaTEX** (ui-analysis P3). The domain model allows several open sessions over time (a quit batch stays open and resumable), but must decide whether the station may have more than one batch **in progress** at the same moment — for example, start B-24188 while B-24187 is half weighed.

## Decision

A station has **at most one IN_PROGRESS weighing session**. Starting a *different* batch while one is in progress is refused with **409 `SESSION_IN_PROGRESS`** (with the in-progress session and batch in the details). Starting the *same* batch resumes its session. To switch batches, the operator quits the current one (FR-24, bolt 010), which suspends it; it can be resumed later. At most one open (in-progress or suspended) session exists per batch.

## Rationale

The scales, the container on the platform and the operator's attention belong to one batch at a time; interleaving batches is how wrong-batch dispensing happens. A single in-progress session also makes "current session" unambiguous for the UI, for reload/restart recovery (NFR-6) and for attribution.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Several batches in progress at once | Flexible | Ambiguous "current" batch; higher risk of dispensing into the wrong batch; more UI | Contradicts the prototype's assumption; unsafe |
| Starting a new batch automatically suspends the current one | Fewer clicks | Silent state change; an unconfirmed weighing could be discarded without the operator deciding | Quit must be a deliberate, confirmed, audited action (FR-24) |
| One in progress; explicit quit to switch (chosen) | Safe, unambiguous, matches prototype | Extra step to switch batches | Accepted |

## Consequences

### Positive

- "Current session" is always well defined; resume after reload/restart is straightforward.
- Lower risk of mixing batches.

### Negative

- Until Quit exists (bolt 010), a started batch must be completed or the training data reset before another batch can be started — acceptable in development, visible in the UI bolt 007.
- Parallel weighing of several batches at one station is not possible.

### Risks

- If FCI works several batches in parallel at one station (unknown, relates to A-11/A-15), this ADR must be revisited.

## Related

- **Stories**: `004-weighing-station/002-start-or-resume-weighing-session`, `012-quit-and-resume`; `006-assisted-weighing-station-ui/003-select-batch-screen`
- **Requirements**: FR-6, FR-24, NFR-6, TD-13, TD-14
- **Standards**: none (domain rule)
- **Previous ADRs**: ADR-2 (station-level state)

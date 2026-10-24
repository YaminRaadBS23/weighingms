---
bolt: 010-weighing-station
created: 2026-10-24T17:55:08Z
status: accepted
superseded_by: null
---

# ADR-7: The server measures — confirmation is a command without a weight

## Context

Confirmation is the moment a weighing becomes a permanent record that is posted to OrgaTEX as actual consumption. The Weigh screen already shows a live weight it polls from the scale API, so it would be easy for the confirm request to carry "the weight the operator sees". FR-18 requires that the server re-evaluates everything with its own fresh reading, and the story requires that a crafted request claiming 94.2 g while the scale reads 94.6 g is rejected and nothing is recorded.

## Decision

`POST /api/sessions/:id/components/:seq/confirm` has **no body and no weight**. The server takes **one fresh reading** from the assigned scale at the moment it handles the command and uses that single reading for everything: connected, stable (TD-9), the tolerance zone, and the recorded actual. The record stores the actual **as measured** (the scale's unit and resolution); the target and tolerance limits are snapshotted in the recipe's unit, and tolerance is evaluated after exact unit conversion.

## Rationale

A recorded weight that comes from the client can be forged or simply stale; a recorded weight that comes from the server's own read cannot. Using one reading for stability, zone and record guarantees the record describes exactly what was judged. Storing the measured value avoids rounding when units differ (for example a kilogram component on the gram scale).

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Accept the weight shown in the UI | Simplest; what the operator saw is recorded | Forgeable and possibly stale (10 Hz polling); violates FR-18 | Unsafe |
| Accept the UI weight and compare with a server reading within a margin | Detects gross forgery | Two sources of truth; flaky at 10 Hz; arbitrary margin | Unnecessary complexity |
| Server reads once, no client weight (chosen) | One truth; trivially testable; matches FR-18 | The weight recorded can differ from what the operator last saw by a moment | Accepted |

## Consequences

### Positive

- A crafted request cannot change the outcome; tests can prove it by placing a weight on the Dummy Scale and sending nothing.
- The UI cannot disagree with the server about what is confirmable, because both use the same shared tolerance functions.

### Negative

- The operator can press OK at 94.5 g and the server reads 94.6 g a moment later: the confirmation is refused (`TOLERANCE_VIOLATION`). This is intended.
- Confirm requires a reachable scale (503 otherwise).

### Risks

- If a real scale reports readings slower than 10 Hz, "stable" must be defined by the adapter; the rule stays the same.

## Related

- **Stories**: `004-weighing-station/009-confirm-weighing-in-tolerance`, `008-tolerance-evaluation-rules`
- **Requirements**: FR-18, FR-19, BR-07, AC-04, TD-9, NFR-8, NFR-9
- **Standards**: `system-architecture.md` (server-authoritative rules)
- **Previous ADRs**: ADR-1 (immutability), ADR-5 (refused vs accepted calls)

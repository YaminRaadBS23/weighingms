---
bolt: 009-weighing-station
created: 2026-10-24T11:28:06Z
status: accepted
superseded_by: null
---

# ADR-5: An accepted action whose follow-up cannot be done reports state, not an error

## Context

Submitting the right dyestuff does two things: it verifies identity (a fact that must be remembered) and then tares the scale. The tare can fail — scale offline, calibration expired, no suitable scale. The story requires: "identity verified but tare pending; weighing stays locked until tare succeeds". If the call answered with an error status, a client would assume nothing happened, yet the identity was saved.

## Decision

A call is either **refused** (HTTP error, nothing changed — e.g. `WRONG_DYESTUFF`, `LOT_MISMATCH`, `NOT_AUTHORISED`) or **accepted** (200 with the full `SessionView`). When an accepted call could not complete its follow-up, the component's `preparation.state` is `AWAITING_TARE` (or `AWAITING_MATERIAL`) and `preparation.issue` names the cause (`NO_SUITABLE_SCALE`, `SCALE_CALIBRATION_EXPIRED`, `SCALE_UNAVAILABLE`). Operations that change an already unlocked setup — container change, scale reselection — are **all-or-nothing**: a failed re-tare refuses the change with an error and leaves the previous setup in place.

## Rationale

The HTTP status then always matches what happened to the stored state, and the UI can render from one object (`SessionView`) without special-casing partial failures. The two rules together mean the operator is never left with a half-applied physical change.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| 503/422 after saving identity | Familiar | An error that changed state; retry semantics unclear | Misleading |
| Do not save identity unless the tare works | Simple all-or-nothing everywhere | Operator must re-scan; contradicts the story's edge case | Contradicts story 004 |
| Accepted + state/issue (chosen) | Honest status; one rendering path | Client must read `preparation.issue` | Accepted |

## Consequences

### Positive

- Clear, testable contract; works for the UI's polling model (the same view appears on reload).
- A retry is just submitting the same code again.

### Negative

- A client that only checks the HTTP status would miss a pending tare; the UI must read the state.

### Risks

- Future endpoints must follow the same convention to stay consistent.

## Related

- **Stories**: `004-verify-dyestuff-identity-and-unlock`, `006-supervisor-scale-reselection`, `007-calibration-enforcement`
- **Requirements**: FR-7, FR-10, FR-13
- **Standards**: `api-conventions.md` (error body)
- **Previous ADRs**: ADR-3 (session state is the source of truth)

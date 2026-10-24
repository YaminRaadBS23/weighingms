---
bolt: 010-weighing-station
created: 2026-10-24T17:55:08Z
status: accepted
superseded_by: null
---

# ADR-8: Completion is automatic at the last confirmation and makes no OrgaTEX call

## Context

When the last component is confirmed the batch is finished. Story 010 left two things open: whether completion is an operator step or automatic, and whether completion itself sets the OrgaTEX status to WEIGHED. FR-27 says the consumption posting moves the batch to WEIGHED, and TD-1 says weighing is never blocked by OrgaTEX being unreachable.

## Decision

1. The **last confirmation completes the session automatically**, in the same atomic transaction as the weighing record (record + component DONE + session COMPLETED). `POST /api/sessions/:id/complete` also exists; it is idempotent on a completed session and answers `BATCH_INCOMPLETE` while components are open.
2. Completion makes **no OrgaTEX call**. The OrgaTEX status **WEIGHED is set by the consumption write-back in bolt 014**, together with the posting, so status and actual consumption succeed or are retried together.
3. A COMPLETED session is terminal: every component action is refused with `SESSION_COMPLETED` (409).
4. A suspended session has no active component; resume activates the lowest component not yet done.

## Rationale

An automatic, atomic completion removes the state "all components done but the session still open". Keeping OrgaTEX out of completion means a finished batch is never lost or blocked by an outage, and WEIGHED never appears in OrgaTEX before the actuals are there.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Separate operator "complete" step | Explicit | Extra step; a window where everything is weighed but the session is open | Unnecessary |
| Set WEIGHED at completion, post later | Matches the literal wording of story 010 | OrgaTEX says "weighed" without consumption; two retry paths | Misleading and redundant |
| Completion posts consumption itself | One step | Belongs to bolt 014; couples weighing to OrgaTEX availability | Violates TD-1 |

## Consequences

### Positive

- Completion works with OrgaTEX offline; bolt 014 owns write-back, retry and the pending count.
- One atomic commit for the last weighing.

### Negative

- Story 010's criterion "OrgaTEX status WEIGHED" is now met by bolt 014; the story wording was amended.
- The UI must show Confirm & print from a COMPLETED session (not from `/sessions/current`, which lists in-progress sessions).

### Risks

- If the write-back is never triggered (a bug in bolt 014), a completed batch would stay WEIGHING in OrgaTEX; bolt 014's tests must cover completion → posting.

## Related

- **Stories**: `004-weighing-station/010-component-progression-and-batch-completion`, `012-quit-and-resume`; `005-completion-and-ticketing/001-post-consumption-on-completion`
- **Requirements**: FR-25, FR-26, FR-27, IR-06, TD-1
- **Standards**: none (domain rule)
- **Previous ADRs**: ADR-3 (one batch in progress), ADR-7

---
bolt: 014-completion-and-ticketing
created: 2026-10-26T08:45:00Z
status: accepted
superseded_by: null
---

# ADR-10: The write-back is a persisted, client-triggered, key-first send

## Context

When the last component is confirmed the batch is complete (ADR-8). The actual consumption must then reach OrgaTEX **exactly once**, even if OrgaTEX is down at that moment, the browser is closed, or the server restarts mid-send (FR-27, FR-28, IR-08). TD-1 says weighing and printing are never blocked by OrgaTEX, and ADR-8 already decided that completion makes no OrgaTEX call. Something must therefore decide **when** the send happens, **what is stored** before it, and **what a failed send looks like**.

## Decision

1. The write-back is a **row in `write_backs`, one per batch**, holding the idempotency key, status (PENDING or CONFIRMED), attempts and the last failure.
2. The row, with its **key, is committed before OrgaTEX is called**. The send (posting, then setting WEIGHED) happens **outside any database transaction**; its outcome is saved afterwards.
3. The send is **triggered by a request** (`POST /api/batches/:id/consumption`, called by the Confirm & print screen) or by an explicit **retry**. There is **no background job**.
4. A failed send (outage or refusal) is **state, not an error**: the call answers 200 with status PENDING, the failure and the attempt count (as ADR-5). Unexpected errors are not treated as outages.
5. CONFIRMED means the posting was acknowledged **and** the batch status is WEIGHED; it is terminal and protected by database triggers.
6. A completed batch with **no row yet counts as pending**, so a batch is never silently unsent.

## Rationale

Storing the key first makes every repeat of a send identical, so OrgaTEX stores one posting however many times it is repeated, including after a crash between send and answer. Keeping the send out of the transaction means a slow or dead OrgaTEX never holds a database lock. Triggering by request matches Step 26 (batch complete, then `POST …/consumption`) and TD-1 (no hidden sync), and keeps every attempt visible to the operator and in the audit trail.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Send inside the completion transaction | Nothing to remember | Blocks completion on OrgaTEX; contradicts ADR-8 and TD-1 | Unsafe |
| Background sync job that retries until confirmed | No operator action | Hidden behaviour, a scheduler to build and test, contradicts TD-1 | Out of scope for the prototype |
| Outbox row only when sending (no row for "not yet sent") | Simpler | A completed batch whose screen was closed becomes invisible | Loses data visibility |
| Generate a new key per attempt | Simple | Duplicate postings after an unseen success | Violates IR-08 |
| Hold a transaction across the HTTP call | One atomic step | Locks the database during an outage | Unacceptable |

## Consequences

### Positive

- Exactly-once posting is provable: one stored key, same lines, same receipt.
- An outage never loses or duplicates consumption and never blocks weighing or printing.
- Every attempt is visible (attempts, last error, `WRITEBACK_RETRY` audit).

### Negative

- Nothing is sent until the screen (or an API client) asks; until then the batch is pending.
- Two OrgaTEX calls per send (posting, then WEIGHED); if the second fails the write-back stays PENDING and the retry repeats both.

### Risks

- A permanent refusal by OrgaTEX stays PENDING and needs correction on the OrgaTEX side (pilot question).
- A future multi-process deployment needs the idempotency key (already there) rather than the in-process lock for safety.

## Related

- **Stories**: `005-completion-and-ticketing/001-post-consumption-on-completion`, `002-hold-and-retry-write-back`, `003-completion-summary`
- **Requirements**: FR-27, FR-28, BR-16, BR-17, BR-18, IR-08, TD-1, NFR-5
- **Previous ADRs**: ADR-1 (immutability technique), ADR-5 (accepted vs refused), ADR-6 (per-key lock), ADR-8 (completion makes no OrgaTEX call)

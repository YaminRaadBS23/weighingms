---
bolt: 015-completion-and-ticketing
created: 2026-10-26T11:45:00Z
status: accepted
superseded_by: null
---

# ADR-11: A ticket is a stored document; printing is a separate, retryable step

## Context

A completed batch needs a paper ticket that travels with the container (FR-29). The printer can be offline or out of paper (FR-35), OrgaTEX may be down at the same time (TD-1), and the ticket must be the same on paper, on screen and in a reprint (FR-29 criterion 4, FR-30). Story 005 says a printer refusal is answered `503 PRINTER_UNAVAILABLE` with the state, while ADR-5 says an accepted action whose follow-up cannot be done answers 200 with state.

## Decision

1. **The ticket is composed once from the records and stored before the printer is called.** Its content (structured fields and the exact text lines) never changes; only its print outcome does (NOT_SENT, PRINTED, FAILED). The printer receives exactly the stored lines and barcode value; the preview shows the same lines and a barcode drawn from the same value.
2. **Printing is a separate step on a stored ticket.** A retry sends the same ticket and is not a reprint. PRINTED is final: printing it again does nothing. Another paper copy comes only from an audited **reprint**, a new ticket marked REPRINT.
3. **A printer refusal is answered with the port's error (503, or 502 for an unreadable answer) after FAILED is saved**, with `ticketId`, `printStatus` and the printer state in `details`. This is a deliberate exception to ADR-5's 200-with-state rule, because story 005 and the Dummy Printer contract define it so.
4. **No OrgaTEX call is made while creating or printing a ticket.** Order and machine are copied into the recipe snapshot when the session starts.
5. The database backs the rules: one original ticket per batch (partial unique index), no delete, content and identity fixed, PRINTED final, a reprint only of a PRINTED ticket.

## Rationale

Storing first means a printer fault loses nothing and the preview survives it. Composing once means paper, screen and reprint cannot drift apart. Answering the failure with an error keeps to the story and lets the UI treat "ticket exists but is not printed" as one clear case with an id to retry.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Print first, store on success | Fewer rows | A printer outage loses the ticket; contradicts story 005 | Unsafe |
| Answer a failed print with 200 and `printStatus: FAILED` (ADR-5 style) | Consistent with ADR-5 | Contradicts story 005 and the printer contract; a caller can miss the failure | Story wins; the exception is recorded here |
| Regenerate text on every print or preview | No stored content | Paper, preview and reprint could differ if data or layout changes | Breaks FR-29 criterion 4 |
| Read order and machine from OrgaTEX at ticket time | No snapshot change | Ticket would fail while OrgaTEX is offline | Breaks TD-1 |

## Consequences

### Positive

- A failed print leaves a ticket the UI can preview and retry by id; session, records and write-back are untouched.
- A reprint is identical to the original plus the REPRINT marking, and always audited.

### Negative

- A failed print leaves a FAILED ticket that must be retried; there is no abandon action in this bolt.
- Sessions started before this change print `-` for order and machine.
- The printer call runs inside the per-batch lock (short, outside any transaction).

### Risks

- A real printer language or label size (Q18, open with FCI) changes the layout; only new tickets are affected, stored ones stay as printed.

## Related

- **Stories**: `005-completion-and-ticketing/004-generate-and-print-ticket`, `005-printer-unavailable-retry`, `006-ticket-reprint`
- **Requirements**: FR-29, FR-30, FR-35, FR-37, BR-15, IR-16, TD-1
- **Previous ADRs**: ADR-1 (immutability), ADR-5 (refused vs accepted calls), ADR-6 (per-batch lock), ADR-10 (same key-first, state-not-error spirit)

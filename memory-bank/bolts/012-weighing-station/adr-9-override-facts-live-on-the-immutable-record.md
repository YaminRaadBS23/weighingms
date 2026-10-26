---
bolt: 012-weighing-station
created: 2026-10-26T09:30:00Z
status: accepted
superseded_by: null
---

# ADR-9: Override facts live on the immutable weighing record

## Context

A supervisor override (FR-22) lets a weight outside tolerance be recorded. The record must then say who authorised it, why, in which zone the weight was and when. Those facts are needed by the Confirm & print summary and the ticket (bolts 014–016), by the OrgaTEX write-back (result `OVERRIDDEN`), and by anyone investigating a batch later. The `OVERRIDE` audit event (FR-37) already records the action, but its detail is free-form JSON meant for investigation. Weighing records are append-only (ADR-1 technique, NFR-8), so whatever is stored with a record can never be changed or lost.

## Decision

The override facts are **four nullable columns on `weighing_records`**: `override_supervisor_id` (→ operators), `override_reason`, `override_zone` (UNDER | NEAR | OVER) and `override_at`. A record is `OVERRIDDEN` **exactly when** these are set. A `BEFORE INSERT` trigger (migration `0007`) aborts any insert that breaks that equivalence, has an empty reason, or has a zone outside the list. The existing immutability triggers cover the new columns. The `OVERRIDE` audit event is still written, in the same transaction, with the same facts plus the station operator and the surplus.

## Rationale

The record is the unit that is posted, printed and reported, so it should be complete on its own: reading one row tells the whole story. Nullable columns keep it queryable ("all overridden records of this month") and constrainable, and an additive migration changes no existing row. SQLite cannot add a CHECK constraint to an existing table, so the same rule is enforced by a trigger, like the other integrity rules of this database.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Separate `overrides` table joined to the record | Clean normal form; room for several overrides | An extra table and join for every read of a record; the record is no longer self-contained; "one override per record" needs another unique key | More structure than the rule needs (one record, at most one override) |
| Audit event only | No schema change | Audit detail is free-form JSON for investigation, not a contract; the ticket and write-back would depend on parsing it; a record could say OVERRIDDEN with no proof | Weak integrity |
| One JSON text column on the record | One column | Not queryable or constrained; zone and supervisor not validated | Loses the guarantees the record is for |
| Nullable columns + consistency trigger (chosen) | Self-contained, queryable, enforced by the database | Four more columns; a trigger instead of a CHECK | Accepted |

## Consequences

### Positive

- A record states its own override; summary, ticket and write-back read one row.
- The database refuses an OVERRIDDEN record without a supervisor and reason, even if application code is wrong.
- Immutability needs no new mechanism.

### Negative

- Only **one** override per record is possible. This is intended: one record per component (unique session + sequence), and a component is confirmed once.
- The audit event and the record repeat the same facts; both are written in one transaction, so they cannot differ.

### Risks

- If a later rule allows several approvals per weighing (a four-eyes process), this shape must change to an `overrides` table. That is a pilot question for FCI (domain model O-2).

## Related

- **Stories**: `004-weighing-station/013-supervisor-override`, `014-overshoot-detection-and-recovery`
- **Requirements**: FR-22, FR-37, BR-13, AC-06, NFR-8, TD-10, TD-15
- **Decision record**: `STEP-24-overshoot-decision.md` (the overshoot rule itself)
- **Previous ADRs**: ADR-1 (immutability), ADR-7 (the server measures)

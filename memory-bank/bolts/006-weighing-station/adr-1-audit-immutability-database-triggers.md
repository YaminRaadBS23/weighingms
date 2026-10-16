---
bolt: 006-weighing-station
created: 2026-10-16T08:41:17Z
status: accepted
superseded_by: null
---

# ADR-1: Enforce audit-event immutability with database triggers

## Context

Audit events record privileged and exceptional actions — override, scale reselection, quit (abandon), reprint, write-back retry — and must never be changed or deleted (brief FR-36, NFR-13; requirements FR-37, NFR-8). The approved domain model already gives `AuditEventRepository` no update or delete method and the API exposes none. Application code, however, is not the only thing that can touch `weighingms.db`: future modules, maintenance scripts, migrations or an ad-hoc SQL session could still modify rows, and a traceability record that can be edited silently is worth little during a shade-failure investigation (BO-05).

## Decision

Audit immutability is enforced at three levels: (1) the repository has only `append` and `list` methods; (2) no endpoint updates or deletes audit events; (3) **SQLite triggers on `audit_events` abort every `UPDATE` and `DELETE`** with an explicit error. Corrections are expressed as new events, never as edits.

## Rationale

The database is the last line of defence and the only one that also covers code we have not written yet. SQLite triggers are standard, need no extra dependency, and fail loudly (`RAISE(ABORT, …)`), which turns an accidental mutation into a visible error rather than lost history.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Application-level only (no update/delete in code) | Simplest | Any other code path or manual SQL can still mutate history | Not strong enough for a traceability record |
| Separate append-only log file / hash chain | Tamper-evident | More machinery, harder to query, out of scope for training | Over-engineered for V1 |
| Database triggers (chosen) | Enforced for every writer, trivial to implement, testable | Triggers are an extra place where rules live; schema changes must keep them | Accepted |

## Consequences

### Positive

- History cannot be edited by any code path; violations surface as errors.
- The guarantee is testable (an UPDATE/DELETE in a test must fail).

### Negative

- A future "correction" feature must append a compensating event; it cannot fix a row in place.
- Test data cleanup must recreate the database rather than delete audit rows.

### Risks

- A migration could drop or recreate the table without its triggers → mitigation: a test asserts the triggers exist and abort mutations.

## Related

- **Stories**: `004-weighing-station/015-audit-trail`
- **Requirements**: FR-37, NFR-8, BR-13, BR-14
- **Standards**: candidate for `data-stack.md` ("append-only tables are protected by triggers")
- **Previous ADRs**: none

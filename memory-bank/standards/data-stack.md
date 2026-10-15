# Data Stack

## Overview

WeighingMS persists data in local SQLite files accessed through Drizzle ORM. The WeighingMS application and the Dummy OrgaTEX system each own a separate database file, so the integration boundary between them is enforced physically as well as in code.

## Database

**SQLite** (file-based, embedded; no database server).

- The data is relational (brief §9: batch → recipe → components; session → weighing records → overrides/compensations) and small in volume (one station, one site, tens to hundreds of records in training).
- Runs locally with zero installation, matching the local-only infrastructure in `tech-stack.md`.
- Synchronous, transactional writes mean a confirmed weighing is on disk before the UI acknowledges it (brief NFR-05).
- The training scenario can be reset by deleting the files and re-seeding.

### Database files and ownership

| File | Owner | Contents |
|------|-------|----------|
| `data/weighingms.db` | WeighingMS | Operators, scales configuration, containers, weighing sessions, weighing records, overrides, compensations, audit events, sync entries, ticket records |
| `data/orgatex.db` | Dummy OrgaTEX | Batches, recipes, recipe components, dyestuffs, dyestuff lots, tolerance rules, received consumption postings |

Rules:

1. **WeighingMS never opens `orgatex.db`.** All access to OrgaTEX data goes through the Dummy OrgaTEX HTTP API via the OrgaTEX adapter (brief C-01, IR-07). This is what keeps the dummy replaceable by a real integration.
2. **Scale and scanner state is in-memory** in their dummy services (current weight, tare, connected/disconnected); it is simulation state, not business data.
3. **Seed data** for the training scenario (batches B-24187, B-24188, B-24190, B-24191; recipe for Teal 4C with five components; scales; operators; containers) lives in versioned JSON seed files and is loaded by a seed script. The seed is the single source of scenario data — never the UI.

### Data integrity rules

- **Quantities are decimal strings** in the database (`TEXT`, e.g. `"94.0"`) together with an explicit unit (`g` / `kg`). They are never stored as `REAL` and never computed with JavaScript floating point (brief NFR-16).
- **Weighing records are immutable once confirmed** — append-only; a correction is a new record referencing the original (brief DR-02).
- **Target and tolerance are snapshotted** onto each weighing record at confirmation time (brief §9.2).
- **Timestamps** are ISO 8601 UTC strings.
- **Consumption posting is idempotent** — the Dummy OrgaTEX stores postings keyed by an idempotency key so retries do not double-post (brief IR-08).

## ORM / Database Client

**Drizzle ORM** with the **better-sqlite3** driver.

- TypeScript-first: schema is defined in TypeScript and query results are fully typed, consistent with the shared-types approach in `tech-stack.md`.
- SQL-like query API keeps generated SQL predictable and reviewable.
- `drizzle-kit` provides schema migrations.
- Lighter than Prisma (no separate engine or client-generation step).

Each owner has its own Drizzle schema module and connection; the WeighingMS backend modules do not import the Dummy OrgaTEX schema.

## Decision Relationships

- SQLite + Drizzle + better-sqlite3 suits the single-process, local-only Fastify backend in `tech-stack.md`.
- Two database files enforce the OrgaTEX integration boundary that the adapter pattern defines in code.
- The decimal-string storage rule depends on the decimal arithmetic library fixed in `coding-standards.md`.

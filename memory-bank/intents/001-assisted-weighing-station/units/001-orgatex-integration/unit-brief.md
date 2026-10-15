---
unit: 001-orgatex-integration
intent: 001-assisted-weighing-station
phase: inception
status: complete
unit_type: backend
default_bolt_type: simple-construction-bolt
created: 2026-10-15T12:21:05.000Z
updated: 2026-10-15T12:24:22.000Z
---

# Unit Brief: OrgaTEX Integration

## Purpose

Provide WeighingMS's only path to OrgaTEX: the `OrgatexPort` interface, its adapter, and the **Dummy OrgaTEX** external system that stands in for the real MES during training. Isolates the highest-risk unknowns (A-01, A-02) behind one replaceable component (brief IR-07).

## Scope

### In Scope
- Dummy OrgaTEX HTTP API under `/ext/orgatex/...` (training contract only) with its own `orgatex.db` (Drizzle schema, migrations) and seed (DB-1)
- Batches (queue for station, detail, status RELEASED / QUEUED / WEIGHING / WEIGHED), recipes and components, dyestuffs (name, code, colour, ticket short name), lots, tolerance, bar full-scale
- Consumption postings stored with `Idempotency-Key`; batch status transitions
- `_sim` controls: OrgaTEX offline/online, reset scenario (dev/test only)
- `OrgatexPort` interface + dummy adapter: HTTP calls to `/ext/orgatex`, error translation to `ORGATEX_UNAVAILABLE` etc., timeouts, logging (IR-09)

### Out of Scope
- WeighingMS `/api/batches…` facade and selection rules (→ 003)
- Write-back orchestration, PENDING/retry state (→ 005)
- Any claim about the real OrgaTEX interface; the brief's `/api/v1` shapes are not adopted

---

## Assigned Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| DB-1 | Dummy OrgaTEX data: 4 batches (TD-7 statuses), Teal 4C recipe with 5 prototype components and lots, consumption store, status transitions | Must |
| DB-6 | `_sim` controls for OrgaTEX (offline, reset) | Must |
| NFR-7 | Idempotent consumption posting (exactly-once effect) | Must |

Provides the external side of: FR-2, FR-5, FR-8 (lots), FR-27, FR-28, FR-36.

---

## Domain Concepts

### Key Entities
| Entity | Description | Attributes |
|--------|-------------|------------|
| Batch (OrgaTEX) | Dye lot scheduled by OrgaTEX | batchId, order, machine, fabricDesc, fabricWeightKg, shade, recipeId, componentCount, status, releasedAt |
| Recipe / Component | Formulation for a shade | recipeId, shade, version; sequence, dyestuffCode, target {value, unit}, tolerance {value, unit}, barMax, suggestedLot |
| Dyestuff / Lot | Material master | code, name, colourHex, ticketShortName, type; lotId, dyestuffCode |
| ConsumptionPosting | Received write-back | idempotencyKey, batchId, lines (dyestuff, lot, actual, target, result), receivedAt |

### Key Operations (OrgatexPort)
| Operation | Inputs | Outputs |
|-----------|--------|---------|
| listBatches(stationId) | station | batches + receivedAt |
| getBatch(batchId) | id | batch |
| getRecipe(batchId) | id | recipe with components |
| listLots(dyestuffCode) | code | lots |
| setBatchStatus(batchId, status) | id, WEIGHING/WEIGHED | ack |
| postConsumption(batchId, lines, key) | posting + idempotency key | stored posting (same result on repeat) |
| getLinkStatus() | — | online/offline + last contact time |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 5 |
| Must Have | 5 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 001-project-scaffold | Runnable project scaffold | Must | Planned |
| 002-dummy-orgatex-serves-batches-and-recipes | Dummy OrgaTEX serves batches, recipes and lots | Must | Planned |
| 003-orgatex-port-read-operations | OrgatexPort read operations via adapter | Must | Planned |
| 004-dummy-orgatex-accepts-consumption-idempotently | Consumption posting and batch status, idempotent | Must | Planned |
| 005-orgatex-outage-simulation | Simulate OrgaTEX outage and reset scenario | Must | Planned |

---

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| — | Foundation unit |

### Depended By
| Unit | Reason |
|------|--------|
| 003-batch-and-material | Batch queue, recipe, lots |
| 005-completion-and-ticketing | Consumption posting, batch status |
| 004-weighing-station | Batch status WEIGHING (via 003 service) |

### External Dependencies
| System | Purpose | Risk |
|--------|---------|------|
| Real OrgaTEX (not available) | Would replace the dummy adapter | Severe (A-01, A-02) — contained by the port |

---

## Technical Context

### Suggested Technology
Fastify route plugin for `/ext/orgatex`; Drizzle + better-sqlite3 on `orgatex.db`; seed JSON in `data/seed/` (becomes `STEP-17-dummy-data.json`); adapter uses `fetch` against the in-process server.

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| WeighingMS domain (003, 005) | Port (TypeScript interface) | in-process |
| Dummy OrgaTEX | HTTP | REST/JSON `/ext/orgatex` |

### Data Storage
| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Batches, recipes, dyestuffs, lots, postings | SQLite `orgatex.db` | tens of rows | until scenario reset |

---

## Constraints

- WeighingMS code never opens `orgatex.db`; only the Dummy OrgaTEX module does (`data-stack.md`).
- All quantities as decimal strings with unit (`api-conventions.md`).
- Dummy contract is labelled "training contract" in code and docs.

---

## Success Criteria

### Functional
- [ ] `/ext/orgatex` serves the four seeded batches and the Teal 4C recipe with exact prototype values
- [ ] Repeated `postConsumption` with the same key stores one posting and returns the same result
- [ ] Offline `_sim` makes every port call fail with `ORGATEX_UNAVAILABLE` (503 semantics)

### Non-Functional
- [ ] Adapter logs each call with operation, batch ID and outcome (IR-09)

### Quality
- [ ] Contract tests for every Dummy OrgaTEX endpoint and every port operation (success + failure)
- [ ] All acceptance criteria met

---

## Bolt Plan

Planned in workbook Step 12 (`memory-bank/bolts/`).

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| 001-orgatex-integration | Simple | 001, 002, 003 | Create the shared project scaffold and the read side of Dummy OrgaTEX with OrgatexPort. |
| 002-orgatex-integration | Simple | 004, 005 | Complete Dummy OrgaTEX with idempotent consumption posting, batch status and outage simulation. |

## Notes

First bolt executed in the project also creates the shared scaffold (app factory, shared types, decimal helpers, error handler, Vitest setup).

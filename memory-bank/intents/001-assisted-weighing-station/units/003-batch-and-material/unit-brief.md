---
unit: 003-batch-and-material
intent: 001-assisted-weighing-station
phase: inception
status: stories-defined
unit_type: backend
default_bolt_type: simple-construction-bolt
created: 2026-10-15T12:21:05Z
updated: 2026-10-15T12:24:22Z
---

# Unit Brief: Batch and Material

## Purpose

Turn OrgaTEX's work into WeighingMS's view of it: the station batch queue, which batches may be weighed, the recipe in WeighingMS domain terms, and the material checks (lot belongs to dyestuff, container known and in service) that weighing relies on.

## Scope

### In Scope
- `/api/batches` (queue + received time), `/api/batches/:batchId`, `/api/batches/:batchId/recipe` — facade over `OrgatexPort`
- Batch selection rule: selectable = RELEASED or WEIGHING (resume); otherwise 409 `BATCH_NOT_RELEASED` with reason
- Batch lookup by scanned/typed ID (unknown → rejected)
- Recipe mapping to domain: components with sequence, dyestuff, target, tolerance, unit, bar full-scale, suggested lot
- Material: lot validation (lot belongs to dyestuff, via OrgaTEX lots); **container master** (WeighingMS-owned seed: C-09, C-11, C-12 @ 214 g; D-03, D-05 @ 1.850 kg; default component→container mapping) and validation (known, in service)
- OrgaTEX unreachable at load → 503 `ORGATEX_UNAVAILABLE` (never an empty queue)

### Out of Scope
- Weighing session, identity verification step, which lot/container is *in force* for a weighing (→ 004)
- OrgaTEX data storage and dummy (→ 001)

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-2 | Batch queue | Must |
| FR-3 | Batch selection by touch or scan | Must |
| FR-4 | Reject batches not released | Must |
| FR-5 | Recipe loading | Must |
| FR-8 | Dyestuff lot | Must |
| FR-9 | Container | Must |
| FR-36 | OrgaTEX unavailable when loading | Must |
| NFR-2 | Recipe displayed ≤ 3 s | Must |

---

## Domain Concepts

### Key Entities
| Entity | Description | Attributes |
|--------|-------------|------------|
| QueuedBatch | Batch as shown in the queue | batchId, order, machine, fabric, shade, componentCount, status, selectable, reason |
| Recipe | WeighingMS recipe view | shade, version, components[] |
| RecipeComponent | One component to weigh | sequence, dyestuff {code, name, colour, shortName}, target, tolerance, barMax, suggestedLot |
| Container | Station container (WeighingMS master) | containerId, type, tare, inService |

### Key Operations
| Operation | Inputs | Outputs |
|-----------|--------|---------|
| getQueue | — | queue + receivedAt |
| resolveBatch | batchId (scan/typed) | batch or BATCH_NOT_FOUND / BATCH_NOT_RELEASED |
| getRecipe | batchId | Recipe |
| validateLot | dyestuffCode, lotId | ok / LOT_MISMATCH |
| validateContainer | containerId | Container / CONTAINER_UNKNOWN / CONTAINER_OUT_OF_SERVICE |
| defaultContainerFor | component | Container |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 6 |
| Must Have | 6 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 001-station-batch-queue | Station batch queue | Must | Planned |
| 002-select-batch-with-release-check | Select a batch by ID with release check | Must | Planned |
| 003-load-recipe-for-batch | Load the recipe for a batch | Must | Planned |
| 004-orgatex-unavailable-on-load | Defined behaviour when OrgaTEX is unavailable on load | Must | Planned |
| 005-validate-dyestuff-lot | Validate a dyestuff lot | Must | Planned |
| 006-container-master-and-validation | Container master and validation | Must | Planned |

---

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| 001-orgatex-integration | `OrgatexPort` for batches, recipe, lots |

### Depended By
| Unit | Reason |
|------|--------|
| 004-weighing-station | Recipe and material validation for the session |
| 006-assisted-weighing-station-ui | Queue and recipe APIs |

### External Dependencies
| System | Purpose | Risk |
|--------|---------|------|
| OrgaTEX (via 001) | Source data | Contained by port |

---

## Technical Context

### Suggested Technology
Fastify module `modules/batches`; container master in `weighingms.db` (Drizzle) seeded from JSON; tests use a fake `OrgatexPort`.

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| 001 | Port | in-process |
| UI | `/api/batches…` | REST/JSON |

### Data Storage
| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Containers | SQLite `weighingms.db` | 5 rows | seed |

---

## Constraints

- No batch/recipe data in WeighingMS storage beyond what a session snapshots (OrgaTEX stays master, C-01).
- Quantities as decimal strings + unit.

---

## Success Criteria

### Functional
- [ ] `GET /api/batches` returns B-24187, B-24188 (selectable) and B-24190, B-24191 (not selectable, with reason)
- [ ] `GET /api/batches/B-24187/recipe` returns the five components with exact values in sequence
- [ ] Selecting B-24190 → 409 `BATCH_NOT_RELEASED`; unknown ID → 404
- [ ] Lot of another dyestuff → rejected; unknown/out-of-service container → rejected
- [ ] OrgaTEX offline → 503 `ORGATEX_UNAVAILABLE` on queue and recipe

### Non-Functional
- [ ] Recipe endpoint responds well within 3 s locally

### Quality
- [ ] Unit tests for rules; API tests with fake port; all acceptance criteria met

---

## Bolt Plan

Planned in workbook Step 12 (`memory-bank/bolts/`).

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| 005-batch-and-material | Simple | 001, 002, 003, 004 | Expose the station batch queue, batch selection with release check and recipe loading through the WeighingMS facade, with defined OrgaTEX-unavailable behaviour. |
| 008-batch-and-material | Simple | 005, 006 | Add dyestuff lot validation and the container master with default container per component. |

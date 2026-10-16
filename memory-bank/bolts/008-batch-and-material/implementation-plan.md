---
stage: plan
bolt: 008-batch-and-material
created: 2026-10-16T12:53:27Z
---

## Implementation Plan: batch-and-material — lot validation and container master (bolt 8 of 17)

### Objective

Give the weighing flow the two material checks it needs before it can unlock a component (bolt 009): **dyestuff lots** (is this lot really a lot of this dyestuff?) and **containers** (is this a known, in-service container, and what is the default container and tare for this component?). Lots are validated against OrgaTEX through `OrgatexPort`; containers are WeighingMS master data stored in `weighingms.db`.

### Stories and requirements implemented

| Story | Requirements | What it delivers |
|-------|--------------|------------------|
| `005-validate-dyestuff-lot` | FR-8, A-09, Q28, TD-3 | `POST /api/materials/lots/validate`, `MaterialService.validateLot` / `resolveLot` (default = suggested lot); errors `LOT_NOT_FOUND`, `LOT_MISMATCH` |
| `006-container-master-and-validation` | FR-9, Q29, TD-8, DB-5 (containers) | `containers` table + migration + seed, `GET /api/containers`, `POST /api/containers/validate`, `MaterialService.defaultContainerFor`; errors `CONTAINER_UNKNOWN`, `CONTAINER_OUT_OF_SERVICE` |

Out of scope: using these checks in the weighing session (identity/lot/container unlock is bolt 009), scanning UI (bolt 011), tare execution (done in bolt 003; the unlock in bolt 009 applies the container's tare).

---

### 1. What will change

1. **Dummy OrgaTEX + port: look up a single lot.** Telling "lot belongs to another dyestuff" (`LOT_MISMATCH`) from "no such lot anywhere" (`LOT_NOT_FOUND`) needs a lookup by lot ID, which the current `listLots(dyestuffCode)` cannot give. Add `GET /ext/orgatex/lots/:lotId` (training contract) and `OrgatexPort.findLot(lotId)`; the adapter translates a 404 `LOT_NOT_FOUND` into a new domain error.
2. **Container master** in `weighingms.db`: new table `containers` (container ID, type, tare value + unit as decimal text, in-service flag, optional default dyestuff) via a new migration; seeded from `station-seed.json` independently of operators, so an existing database picks up containers on next start.
3. **MaterialService** (`src/server/modules/materials/`):
   - `validateLot(dyestuffCode, lotId)` — normalises the ID, looks it up in OrgaTEX, `LOT_NOT_FOUND` / `LOT_MISMATCH` otherwise.
   - `resolveLot(component, scannedLot?)` — no scan → the recipe's suggested lot (**no OrgaTEX call**); a scanned lot → validated.
   - `listContainers()`, `validateContainer(code)` (`CONTAINER_UNKNOWN`, `CONTAINER_OUT_OF_SERVICE`), `defaultContainerFor(dyestuffCode)`.
4. **Routes** `/api/materials/lots/validate`, `/api/containers`, `/api/containers/validate`; shared contract types in `src/shared/materials.ts`.
5. **Errors** (four new domain errors and codes), README updates.

### 2. Files to be created / modified

```text
src/server/integrations/orgatex/dummy/routes.ts           + GET /lots/:lotId                          (modified)
src/server/integrations/orgatex/dummy/routes.test.ts      + lot lookup contract tests                 (modified)
src/server/integrations/orgatex/orgatex-port.ts           + findLot                                   (modified)
src/server/integrations/orgatex/http-orgatex-adapter.ts   + findLot, LOT_NOT_FOUND translation        (modified)
src/server/integrations/orgatex/http-orgatex-adapter.test.ts + findLot tests                          (modified)
src/server/errors.ts, src/shared/errors.ts                + LotNotFound, LotMismatch, ContainerUnknown,
                                                            ContainerOutOfService                      (modified)
src/server/db/weighingms/schema.ts                        + containers table                          (modified)
src/server/db/weighingms/migrations/0002_*.sql            generated                                   (new)
data/seed/station-seed.json                               + containers                                (modified)
src/server/modules/weighing/infrastructure/seed.ts        + seedContainersIfEmpty, validation         (modified)
src/shared/materials.ts                                   contract types                              (new)
src/server/modules/materials/container-repository.ts      Drizzle repository                          (new)
src/server/modules/materials/material-service.ts          lots and containers                         (new)
src/server/modules/materials/routes.ts                    /api/materials, /api/containers             (new)
src/server/modules/materials/*.test.ts                    service, repository, API tests              (new)
src/server/app.ts, README.md                              wiring, docs                                (modified)
```

### 3. APIs involved

| Method | Path | Behaviour |
|--------|------|-----------|
| GET | `/ext/orgatex/lots/:lotId` | **Dummy OrgaTEX (training contract)** → `{ lotId, dyestuffCode, trainingOnly }` or 404 `LOT_NOT_FOUND` |
| POST | `/api/materials/lots/validate` | body `{ dyestuffCode, lotId }` → **200** `{ lotId, dyestuffCode }` · **404 `LOT_NOT_FOUND`** · **422 `LOT_MISMATCH`** · 400 · **503 `ORGATEX_UNAVAILABLE`** |
| GET | `/api/containers` | `{ items: [{ containerId, type, tare: {value, unit}, inService, defaultFor: dyestuffCode \| null }] }` |
| POST | `/api/containers/validate` | body `{ code }` (scanned or typed) → **200** container · **404 `CONTAINER_UNKNOWN`** · **422 `CONTAINER_OUT_OF_SERVICE`** · 400 |

**In-process (used by bolt 009):** `MaterialService.resolveLot`, `validateLot`, `defaultContainerFor`, `validateContainer`.

### 4. Seed data (containers — WeighingMS master data, training values)

| Container | Type | Tare | In service | Default for |
|-----------|------|------|-----------|-------------|
| C-09 | BUCKET | 214.0 g | yes | DYE-1180 (Blue RSPL) |
| C-11 | BUCKET | 214.0 g | yes | DYE-2204 (Red RB) |
| C-12 | BUCKET | 214.0 g | yes | DYE-4471 (Yellow RGB) |
| D-03 | DRUM | 1.850 kg | yes | AUX-0101 (Sodium Sulphate) |
| D-05 | DRUM | 1.850 kg | yes | AUX-0107 (Soda Ash) |
| **C-13** | BUCKET | 214.0 g | **no** | — *(training-only, to demonstrate `CONTAINER_OUT_OF_SERVICE`, like the inactive badge)* |

IDs, tares and the default mapping come from the prototype (container and tare per component). The **container types** (BUCKET, DRUM) are a training assumption — the prototype shows none (brief §9.2 only says DRUM / BUCKET / BAG exist).

### 5. Technical approach

- **Offline behaviour (TD-1).** The default lot comes from the recipe snapshot, so it needs **no OrgaTEX call** and works while OrgaTEX is offline. Only *changing* the lot by scan needs OrgaTEX to verify it; if OrgaTEX is unreachable that answer is `503 ORGATEX_UNAVAILABLE` and the operator continues with the suggested lot. Recorded as a training decision.
- **Containers never depend on OrgaTEX** (WeighingMS master data).
- **Normalisation:** lot and container codes are trimmed and upper-cased, as for other scans.
- **Seeding:** `seedContainersIfEmpty` runs on every start and fills the table only when it is empty, so databases created in earlier bolts get containers without a reset; operators are untouched.
- **Quantities** stay decimal text + unit; the API returns `{ value, unit }`.
- **Simple bolt:** no domain aggregate — a service, a repository and routes.

### 6. How this will be tested

| Level | Tests |
|-------|-------|
| Contract — Dummy OrgaTEX | `GET /ext/orgatex/lots/:lotId` for each seeded lot incl. the training-only `2026-0402`; unknown → 404 `LOT_NOT_FOUND`; offline → 503 |
| Adapter | `findLot` mapping; 404 → `LotNotFoundError`; offline/timeout → `ORGATEX_UNAVAILABLE` |
| Repository + seed | containers seeded with exact values (214.0 g / 1.850 kg), defaults, out-of-service C-13; seeding fills an existing database that already has operators; second start does not duplicate; lookup by ID |
| Service (fake port) | `validateLot` ok / `LOT_MISMATCH` (Blue's lot for Yellow) / `LOT_NOT_FOUND`; normalisation; `resolveLot` returns the suggested lot **without calling OrgaTEX** and validates a scanned lot; `validateContainer` ok / unknown (`C-99`) / out of service (`C-13`); `defaultContainerFor` for all five B-24187 components |
| API | the story criteria over HTTP: `2026-0387` for DYE-4471 → 200; `2026-0341` for DYE-4471 → 422 `LOT_MISMATCH`; unknown lot → 404; training-only `2026-0402` accepted for DYE-4471; OrgaTEX offline → 503 for a scanned lot; `GET /api/containers` lists the five containers with defaults; **recipe components of B-24187 → default containers Blue→C-09, Red→C-11, Yellow→C-12, Sodium Sulphate→D-03, Soda Ash→D-05**; `C-99` → 404; `C-13` → 422; lower-case input; 400 for missing fields |
| Regression | all 302 existing tests; typecheck, lint, format |
| Manual | `curl` the four endpoints against `npm start` |

### Acceptance Criteria (bolt level)

- [ ] DYE-4471 + lot `2026-0387` → ok; DYE-4471 + `2026-0341` → 422 `LOT_MISMATCH`; unknown lot → 404 `LOT_NOT_FOUND`
- [ ] No scanned lot → the suggested lot is the default, with no OrgaTEX call
- [ ] Containers C-09, C-11, C-12 (214.0 g) and D-03, D-05 (1.850 kg) exist and are in service
- [ ] Default containers for the B-24187 components: Blue→C-09, Red→C-11, Yellow→C-12, Sodium Sulphate→D-03, Soda Ash→D-05
- [ ] `C-99` → 404 `CONTAINER_UNKNOWN`; an out-of-service container → 422 `CONTAINER_OUT_OF_SERVICE`
- [ ] An existing `weighingms.db` receives the containers on start without losing operators or sessions
- [ ] All tests, typecheck, lint and format pass

### Notes

- **New training-only data:** out-of-service container `C-13`, and the container types BUCKET / DRUM.
- **Decision to confirm:** changing a lot by scan needs OrgaTEX; with OrgaTEX offline the operator keeps the suggested lot.

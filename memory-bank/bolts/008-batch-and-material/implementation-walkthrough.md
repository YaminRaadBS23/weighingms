---
stage: implement
bolt: 008-batch-and-material
created: 2026-10-16T12:55:25Z
---

## Implementation Walkthrough: batch-and-material — lot validation and container master (bolt 8)

### Summary

WeighingMS can now check the two materials an operator brings to a component. A lot is verified against OrgaTEX (it must exist and belong to the dyestuff), and a container is checked against WeighingMS' own container master (it must exist and be in service). Each component has a default lot (from the recipe) and a default container (from the master data). All of it is available over the API for the UI and as a service for the weighing session in bolt 009.

### Structure Overview

A new `materials` module holds a service, a container repository and routes. Lot checks go through `OrgatexPort`, which gained a single-lot lookup backed by a new Dummy OrgaTEX endpoint. Containers live in `weighingms.db` in a new table, seeded independently of operators so existing databases receive them on the next start.

### Completed Work

- [x] `src/server/integrations/orgatex/dummy/routes.ts` - `GET /ext/orgatex/lots/:lotId` (training contract), 404 `LOT_NOT_FOUND`
- [x] `src/server/integrations/orgatex/orgatex-port.ts`, `http-orgatex-adapter.ts` - `findLot(lotId)`; a 404 becomes `LotNotFoundError`
- [x] `src/server/errors.ts`, `src/shared/errors.ts` - `LOT_NOT_FOUND`, `LOT_MISMATCH`, `CONTAINER_UNKNOWN`, `CONTAINER_OUT_OF_SERVICE`
- [x] `src/server/db/weighingms/schema.ts`, `migrations/0002_containers.sql` - `containers` table (decimal-text tare, in-service flag, optional unique default dyestuff)
- [x] `data/seed/station-seed.json` - Six containers: C-09, C-11, C-12 (214.0 g, buckets), D-03, D-05 (1.850 kg, drums), out-of-service C-13
- [x] `src/server/modules/weighing/infrastructure/seed.ts` - Container seeding and validation; each table seeded only when empty
- [x] `src/shared/materials.ts` - API contract types
- [x] `src/server/modules/materials/container-repository.ts` - Read access to the container master
- [x] `src/server/modules/materials/material-service.ts` - `validateLot`, `resolveLot`, `listContainers`, `validateContainer`, `defaultContainerFor`
- [x] `src/server/modules/materials/routes.ts` - `POST /api/materials/lots/validate`, `GET /api/containers`, `POST /api/containers/validate`
- [x] `src/server/app.ts` - Wires the service and routes; seeds containers on start
- [x] `README.md` - New endpoints and training containers

### Key Decisions

- **A scanned lot is verified in OrgaTEX; the default lot is not**: the suggested lot comes from the recipe snapshot, so it works with OrgaTEX offline (TD-1). Changing the lot by scan needs OrgaTEX and answers 503 when it is down.
- **Lookup by lot ID** (new port operation) rather than searching every dyestuff, so "wrong dyestuff" and "no such lot" can be told apart.
- **Containers never depend on OrgaTEX**: WeighingMS-owned master data (brief §9.3).
- **Seed each table independently**: a database from before this bolt keeps its operators and sessions and just gains containers.
- **One default container per dyestuff**, enforced by a unique index, mirroring the prototype's per-component assignment.

### Deviations from Plan

None.

### Dependencies Added

None.

### Developer Notes

- Verified against `npm start` with the scratch database from bolt 006 (created before containers existed): it kept 3 operators and its in-progress session and received 6 containers; `c-12` → C-12 (200); C-99 → 404; C-13 → 422; lots `2026-0387` and the training-only `2026-0402` → 200 for DYE-4471; `2026-0341` (Blue's) → `LOT_MISMATCH`; `9999-9999` → 404; missing field → 400; OrgaTEX offline → scanned lot 503 while `GET /api/containers` still answers 200.
- Typecheck, lint, format pass; all 302 existing tests pass. New tests come in Stage 3.
- Training-only additions: out-of-service container C-13 and the container types (BUCKET, DRUM).

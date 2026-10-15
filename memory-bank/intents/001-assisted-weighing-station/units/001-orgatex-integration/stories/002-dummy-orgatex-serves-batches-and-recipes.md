---
id: 002-dummy-orgatex-serves-batches-and-recipes
unit: 001-orgatex-integration
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 001-orgatex-integration
implemented: true
---

# Story: 002-dummy-orgatex-serves-batches-and-recipes

**Dummy OrgaTEX serves batches, recipes and lots** · Unit `001-orgatex-integration` · Priority **Must** · User/system value

## User Story

**As a** trainer running the WeighingMS training scenario
**I want** a Dummy OrgaTEX that serves the prototype's batch queue, the Teal 4C recipe and dyestuff lots from seed data
**So that** WeighingMS can be exercised end-to-end without the real MES

## Requirements

DB-1; supports FR-2, FR-5, FR-8; A-01 (training contract only)

## Acceptance Criteria

- [ ] **Given** the seed, **When** `GET /ext/orgatex/stations/STN-01/batches` is called, **Then** it returns B-24187, B-24188 (RELEASED) and B-24190, B-24191 (QUEUED) with order, machine, fabric, shade and component count as in the prototype
- [ ] **Given** B-24187, **When** its recipe is requested, **Then** five components are returned in sequence with target/tolerance/unit: Blue RSPL 1240.0/6.0 g, Red RB 386.0/2.0 g, Yellow RGB 94.0/0.5 g, Sodium Sulphate 24.000/0.120 kg, Soda Ash 9.600/0.048 kg, each with code, colour, ticket short name, bar full-scale and suggested lot
- [ ] **Given** dyestuff DYE-4471, **When** its lots are requested, **Then** lot 2026-0387 is returned
- [ ] **Given** an unknown batch ID, **When** it is requested, **Then** 404 in standard error format
- [ ] **Given** any response, **When** inspected, **Then** quantities are `{ value: string, unit }`

## UI/UX Impact

None directly (data later shown on queue, rail, ticket)

## API Dependencies

Creates `/ext/orgatex/...` read endpoints (training contract)

## Test Expectations

Contract tests per endpoint; seed file validated against schema

## Technical Notes

Seed JSON in `data/seed/` is the Step 17 evidence (`STEP-17-dummy-data.json`). Use `code` (not prototype `id`) as dyestuff identity (ui-analysis §6). Recipes for Navy 12 / Rose 08 not seeded (TD-7).

## Dependencies

### Requires
- `001-project-scaffold` — Runnable project scaffold

### Enables
- `003-orgatex-port-read-operations` — OrgatexPort read operations via adapter

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Batch with no recipe (B-24190) | Recipe request → 404 RECIPE_NOT_FOUND |
| Seed reloaded | Data identical to seed file |

## Out of Scope

- Consumption postings (story 004)

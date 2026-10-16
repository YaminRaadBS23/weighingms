---
id: 006-container-master-and-validation
unit: 003-batch-and-material
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 008-batch-and-material
implemented: true
---

# Story: 006-container-master-and-validation

**Container master and validation** · Unit `003-batch-and-material` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** a default container proposed per component and any scanned container checked
**So that** the weighing is recorded against a real, in-service container with a known tare

## Requirements

FR-9, Q29, TD-8, DB-5 (containers)

## Acceptance Criteria

- [ ] **Given** the seed, **When** containers are listed, **Then** C-09, C-11, C-12 (214 g) and D-03, D-05 (1.850 kg) exist and are in service
- [ ] **Given** B-24187 components, **When** default containers are requested, **Then** Blue→C-09, Red→C-11, Yellow→C-12, Sodium Sulphate→D-03, Soda Ash→D-05
- [ ] **Given** `C-99`, **When** validated, **Then** 404 `CONTAINER_UNKNOWN`
- [ ] **Given** a container marked out of service, **When** validated, **Then** 422 `CONTAINER_OUT_OF_SERVICE`

## UI/UX Impact

CONTAINER and TARE in component header; container scan prompt (006)

## API Dependencies

`GET /api/containers`, `POST /api/containers/validate` (or service used by 004)

## Test Expectations

Unit + API tests; seed test

## Technical Notes

Container master is WeighingMS-owned (brief §9.3) — stored in `weighingms.db`.

## Dependencies

### Requires
- `001-orgatex-integration/001-project-scaffold` — Runnable project scaffold

### Enables
- `004-weighing-station/004-verify-dyestuff-identity-and-unlock` — Verify dyestuff identity, lot and container, then unlock weighing

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Container cleaning/maintenance

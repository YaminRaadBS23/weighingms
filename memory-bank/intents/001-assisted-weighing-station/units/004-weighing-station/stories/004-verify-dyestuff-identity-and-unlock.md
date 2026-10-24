---
id: 004-verify-dyestuff-identity-and-unlock
unit: 004-weighing-station
intent: 001-assisted-weighing-station
status: complete
priority: must
created: 2026-10-15T12:25:00.000Z
assigned_bolt: 009-weighing-station
implemented: true
---

# Story: 004-verify-dyestuff-identity-and-unlock

**Verify dyestuff identity, lot and container, then unlock weighing** · Unit `004-weighing-station` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to scan the dyestuff (and optionally lot and container) before dispensing
**So that** the wrong material can never be weighed into a batch

## Requirements

FR-7, FR-8, FR-9, FR-10, BR-10, TD-3, TD-8

## Acceptance Criteria

- [ ] **Given** Yellow RGB active, **When** `DYE-4471` is submitted to `…/components/3/identity`, **Then** identity is verified, lot defaults to 2026-0387, container to C-12, the dummy container is placed and the scale is tared (net 0.0 g) — the component is UNLOCKED
- [ ] **Given** Yellow RGB active, **When** `DYE-2204` is submitted, **Then** 422 `WRONG_DYESTUFF` and nothing unlocks
- [ ] **Given** unlocked, **When** a valid lot or container is scanned, **Then** it replaces the default (container change re-tares)
- [ ] **Given** not unlocked, **When** confirm is attempted, **Then** 409 `IDENTITY_NOT_VERIFIED`

## UI/UX Impact

Scan prompts; header "DYE-4471 · LOT 2026-0387 · CONTAINER C-12 · TARE 214.0 g" (006)

## API Dependencies

`POST /api/sessions/:id/components/:seq/identity|lot|container`; uses 003 validation, `ScalePort.tare`

## Test Expectations

Aggregate + API tests with fake ports

## Technical Notes

Automatic tare on unlock (TD-8).

## Dependencies

### Requires
- `003-component-states-and-activation` — Component states and activation
- `005-automatic-scale-selection` — Automatic scale selection
- `003-batch-and-material/005-validate-dyestuff-lot` — Validate a dyestuff lot
- `003-batch-and-material/006-container-master-and-validation` — Container master and validation
- `002-device-integration/003-tare-command` — Tare the scale with the container in place

### Enables
- `009-confirm-weighing-in-tolerance` — Confirm a weighing inside tolerance
- `011-re-tare` — Re-tare the active component
- `006-assisted-weighing-station-ui/006-scan-prompts-identity-lot-container` — Scan prompts for dyestuff, lot and container

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Scale unavailable at unlock | Identity verified but tare pending; weighing stays locked until tare succeeds |

## Out of Scope

- Confirmation

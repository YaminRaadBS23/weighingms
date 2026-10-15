---
id: 006-dummy-scanner-and-scan-delivery
unit: 002-device-integration
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 004-device-integration
implemented: false
---

# Story: 006-dummy-scanner-and-scan-delivery

**Dummy scanner and scan delivery** · Unit `002-device-integration` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** my barcode scans (badge, batch, dyestuff, lot, container) to reach the station, and to know when the scanner is offline
**So that** I can work by scanning and fall back to typing when the scanner fails

## Requirements

DB-3, FR-34, IR-15

## Acceptance Criteria

- [ ] **Given** dev/test mode, **When** `POST /ext/scanner/_sim/scan {code:"B-24187"}` is called, **Then** the next `GET /api/scanner/scans?since=…` returns it once with kind BATCH
- [ ] **Given** codes `DYE-4471`, `2026-0387`, `C-12`, a badge ID, **When** scanned, **Then** kinds are DYESTUFF, LOT, CONTAINER, BADGE
- [ ] **Given** `…/_sim/offline`, **When** status is read, **Then** SCANNER OFFLINE and no scans are delivered
- [ ] **Given** the scanner is offline, **When** the UI submits a typed code, **Then** it is accepted through the same API path and validated identically

## UI/UX Impact

Status strip SCANNER; scan prompts accept typed input (006)

## API Dependencies

`/ext/scanner/_sim/scan|offline|online`; `GET /api/scanner/scans`, `GET /api/scanner/status`; `ScannerPort`

## Test Expectations

Contract tests incl. delivered-once semantics

## Technical Notes

Kind detection by code pattern is training-only (A-10 unresolved).

## Dependencies

### Requires
- `001-orgatex-integration/001-project-scaffold` — Runnable project scaffold

### Enables
- `006-assisted-weighing-station-ui/006-scan-prompts-identity-lot-container` — Scan prompts for dyestuff, lot and container

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Unknown pattern | kind UNKNOWN, still delivered |

## Out of Scope

- Validation against recipe (003/004)

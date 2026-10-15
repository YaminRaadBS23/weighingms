---
id: 003-select-batch-screen
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
status: draft
priority: must
created: 2026-10-15T12:25:00Z
assigned_bolt: 007-assisted-weighing-station-ui
implemented: false
---

# Story: 003-select-batch-screen

**1 · Select batch screen** · Unit `006-assisted-weighing-station-ui` · Priority **Must** · User/system value

## User Story

**As an** operator
**I want** to see the queue and pick a batch by touch or scan
**So that** I start weighing the right batch

## Requirements

FR-2, FR-3, FR-4, FR-36 (presentation); workbook Step 19

## Acceptance Criteria

- [ ] **Given** the screen opens, **Then** the queue is fetched from `GET /api/batches` (visible in the Network tab) and shown with the prototype columns and "Queue received from OrgaTEX at hh:mm"
- [ ] **Given** B-24187 is touched or scanned, **Then** `GET /api/batches/B-24187` then `GET /api/batches/B-24187/recipe` are called, a session starts and Weigh opens
- [ ] **Given** a QUEUED batch, **Then** it is visibly not selectable and touching it shows the reason
- [ ] **Given** OrgaTEX offline, **Then** "OrgaTEX not reachable" + Retry is shown instead of the table
- [ ] **Given** the UI source, **Then** it contains no batch data (no `const batches = [...]`)

## UI/UX Impact

Prototype `#v-queue` (scan prompt, beam, `table.q`, tags)

## API Dependencies

`GET /api/batches`, `GET /api/batches/:id`, `GET /api/batches/:id/recipe`, `POST /api/sessions`

## Test Expectations

Component tests with mocked API; E2E

## Technical Notes

—

## Dependencies

### Requires
- `002-sign-in-screen` — Sign-in screen
- `003-batch-and-material/004-orgatex-unavailable-on-load` — Defined behaviour when OrgaTEX is unavailable on load
- `004-weighing-station/002-start-or-resume-weighing-session` — Start or resume a weighing session

### Enables
- `004-weigh-screen-layout-and-recipe-rail` — 2 · Weigh screen layout and recipe rail

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| — | No additional edge cases beyond acceptance criteria |

## Out of Scope

- Implementation tasks (defined in bolts)

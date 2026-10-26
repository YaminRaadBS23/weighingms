---
unit: 006-assisted-weighing-station-ui
intent: 001-assisted-weighing-station
phase: inception
status: in-progress
unit_type: frontend
default_bolt_type: simple-construction-bolt
created: 2026-10-15T12:21:05.000Z
updated: 2026-10-15T12:24:22.000Z
---

# Unit Brief: Assisted Weighing Station UI

## Purpose

Reproduce the supplied prototype's operator HMI screen as a working React application driven entirely by the WeighingMS API, add the states the prototype lacks (sign-in, supervisor dialog, failures), and provide the separate Training Panel and the end-to-end test suite.

## Scope

### In Scope
- **Sign-in** (badge, scan or typed)
- **1 · Select batch**: scan prompt, queue table, not-released message, OrgaTEX-unavailable message + Retry
- **2 · Weigh**: recipe rail, component header (code · LOT · CONTAINER · TARE), identity/lot/container scan prompts, scale badge (automatic/manual), readout (Weighed now / Still to weigh / Target), tolerance bar + caption, status line, surplus panel (per Step 24), keys OK F1 / Re-tare F2 / Quit F4 / Supervisor override, scale-unavailable state
- **Supervisor dialog**: PIN + reason (override); scale reselection
- **3 · Confirm & print**: summary, Written to OrgaTEX CONFIRMED / PENDING + Retry, Print ticket F1, reprint, ticket preview, printer error + Retry, Next batch F3
- **Top bar** and **status strip** (scales, scanner, printer, OrgaTEX + pending count, EN, clock)
- Live-weight polling (100 ms) with 2 s stale detection; workflow reducer; typed API client; F-key handling; English message catalogue; design tokens from `ux-guide.md`
- **Training Panel** page (DB-7) driving `/ext/*/_sim` — visually distinct, never part of the operator flow
- **Playwright** E2E: full B-24187 flow (Step 29) and failure scenarios (Step 30)

### Out of Scope
- Any business rule decision not made by the server (UI uses shared pure rules only for instant feedback); any scenario data in UI code

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-15 | Target, weighed now, still to weigh | Must |
| FR-16 | Progress bar with tolerance band | Must |
| FR-31 | Next batch | Must |
| FR-32 | Peripheral and connection status bar | Must |
| DB-7 | Training Panel | Must |
| NFR-10–13 | Glove targets, legibility, F-keys, English catalogue | Must |

Also implements the **presentation** of FR-1–FR-14, FR-17–FR-30, FR-33–FR-37 (owned by 002–005).

---

## Domain Concepts

### Key Entities (client-side view models)
| Entity | Description | Attributes |
|--------|-------------|------------|
| WorkflowState | UI state machine (see `ui-analysis.md` §4.6) | screen, session, activeComponent, zone, pending dialogs |
| LiveReading | Latest polled reading | net, stable, connected, at, stale |
| StatusStrip | Device/OrgaTEX status | per-device state, pending write-backs |

### Key Operations
| Operation | Description |
|-----------|-------------|
| pollWeight | 10 Hz polling of `/api/scales/:id/weight` while Weigh is active |
| dispatch(action) | Reducer transitions (select batch, verify, confirm, override, retare, quit, complete, print, next) |
| handleFunctionKey | F1/F2/F3/F4 mapping per screen |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 13 |
| Must Have | 13 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 001-app-shell-top-bar-and-status-strip | App shell, top bar and status strip | Must | Planned |
| 002-sign-in-screen | Sign-in screen | Must | Planned |
| 003-select-batch-screen | 1 · Select batch screen | Must | Planned |
| 004-weigh-screen-layout-and-recipe-rail | 2 · Weigh screen layout and recipe rail | Must | Planned |
| 005-live-readout-and-tolerance-bar | Live readout and tolerance bar | Must | Planned |
| 006-scan-prompts-identity-lot-container | Scan prompts for dyestuff, lot and container | Must | Planned |
| 007-action-keys-confirm-retare-quit | Action keys: OK, Re-tare, Quit (+ F-keys) | Must | Planned |
| 008-scale-and-device-failure-states | Scale and device failure states | Must | Planned |
| 009-supervisor-dialog | Supervisor dialog for override and scale reselection | Must | Planned |
| 010-surplus-panel | Surplus panel | Must | Planned |
| 011-confirm-and-print-screen | 3 · Confirm & print screen | Must | Planned |
| 012-training-panel | Training Panel | Must | Planned |
| 013-end-to-end-test-suite | End-to-end and failure test suite | Must | Planned |

---

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| 002-device-integration | Scales, weight, device status, scans |
| 003-batch-and-material | Queue, batch, recipe |
| 004-weighing-station | Session, component actions, confirm, override, shared rules |
| 005-completion-and-ticketing | Write-back status, tickets, summary |

### Depended By
None.

---

## Technical Context

### Suggested Technology
React + Vite; CSS Modules + tokens; typed client from `src/shared`; reducer for workflow; Vitest + Testing Library for components; Playwright for E2E using `_sim` endpoints.

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| WeighingMS | `/api/...` | REST/JSON |
| Training Panel | `/ext/*/_sim` | REST/JSON (dev/test only) |

---

## Constraints

- No `const batches = [...]` or any scenario data in UI code (workbook Step 19).
- Prototype JavaScript not copied (workbook Step 20); visuals per `ux-guide.md`.

---

## Success Criteria

### Functional
- [ ] All three prototype screens reproduced with prototype labels, units and states (Step 28 comparison)
- [ ] Network tab shows `GET /api/batches`, `/api/batches/B-24187`, `/api/batches/B-24187/recipe`, `/api/scales/:id/weight`, `POST /api/batches/B-24187/consumption`, `POST /api/tickets`
- [ ] Playwright: full five-component flow and all Step 30 failure scenarios pass

### Non-Functional
- [ ] Keys ≥ 62×150 px; live weight ≥ 52 px; F-keys work; all strings from catalogue

### Quality
- [ ] Component tests for readout, tolerance bar, reducer; all acceptance criteria met

---

## Bolt Plan

Planned in workbook Step 12 (`memory-bank/bolts/`).

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| 007-assisted-weighing-station-ui | Simple | 001, 002, 003 | Build the UI shell (tokens, top bar, status strip), the sign-in screen and the 1 · Select batch screen against the real APIs. |
| 011-assisted-weighing-station-ui | Simple | 004, 005, 006, 007 | Build the 2 · Weigh screen: recipe rail, component header, scale badge, live readout with 10 Hz polling, tolerance bar, status line, scan prompts and action keys with F-keys. |
| 013-assisted-weighing-station-ui | Simple | 008, 009, 010 | Add the Weigh screen's exception states: scale/device failure states, the supervisor dialog (override, reselection) and the surplus panel per the Step 24 rule. |
| 016-assisted-weighing-station-ui | Simple | 011, 012 | Build the 3 · Confirm & print screen and the separate Training Panel. |
| 017-assisted-weighing-station-ui | Simple | 013 | Implement the Playwright end-to-end suite for the full B-24187 flow and all failure scenarios. |

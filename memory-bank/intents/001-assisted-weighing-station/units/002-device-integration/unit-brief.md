---
unit: 002-device-integration
intent: 001-assisted-weighing-station
phase: inception
status: complete
unit_type: backend
default_bolt_type: simple-construction-bolt
created: 2026-10-15T12:21:05.000Z
updated: 2026-10-15T12:24:22.000Z
---

# Unit Brief: Device Integration (Scale, Scanner, Printer)

## Purpose

Give WeighingMS reliable, replaceable access to the station's devices — two scales, a barcode scanner and a ticket printer — through `ScalePort`, `ScannerPort` and `PrinterPort`, backed by **Dummy** device systems for training. Owns live weight, tare, device status and device-failure detection.

## Scope

### In Scope
- **Dummy Scale** `/ext/scale`: `scale-3kg` (precision, 3 kg) and `scale-32kg` (floor, 32 kg); capacity, resolution, calibration due; simulated gross weight and tare per scale; net weight; `stable` (unchanged ≥ 500 ms); `connected`; tare command
- **Dummy Scanner** `/ext/scanner`: inject scans (badge / batch / dyestuff / lot / container), deliver to the station, online/offline
- **Dummy Printer** `/ext/printer`: accept and store tickets, return preview, states READY / OFFLINE / OUT_OF_PAPER
- `_sim` controls (dev/test): set weight, simulate dispense (easing to target + 0.4 × tol), simulate overshoot (target + 4.8 × tol), disconnect/reconnect, expire calibration, scanner/printer state, inject scan
- Ports + dummy adapters; WeighingMS facade `/api/scales`, `/api/scales/:id/status`, `/api/scales/:id/weight`, `/api/scales/:id/tare`; device status for the status bar; scan delivery endpoint for the UI
- Disconnection detection (≤ 2 s) and error codes `SCALE_UNAVAILABLE`, `SCANNER_UNAVAILABLE`, `PRINTER_UNAVAILABLE`

### Out of Scope
- Scale *selection* rule and calibration *enforcement* (→ 004); ticket *content* and print orchestration (→ 005); scan *validation* against recipe/material (→ 003/004)

---

## Assigned Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-10 | Tare | Must |
| FR-14 | Live weight | Must |
| FR-33 | Scale unavailable | Must |
| FR-34 | Scanner unavailable | Must |
| DB-2 | Dummy Scale | Must |
| DB-3 | Dummy Scanner | Must |
| DB-4 | Dummy Printer | Must |
| DB-6 | `_sim` device controls | Must |
| NFR-1 | Live weight ≥ 10 Hz, ≤ 200 ms lag | Must |
| NFR-3 | Disconnection visible ≤ 2 s | Must |

---

## Domain Concepts

### Key Entities
| Entity | Description | Attributes |
|--------|-------------|------------|
| Scale | Weighing device | scaleId, class (PRECISION/FLOOR), capacity {value, unit}, resolution, calibrationDueAt, connected |
| ScaleReading | One sample | net {value, unit}, stable, connected, at |
| ScanEvent | One scan | code, kind (BADGE/BATCH/DYESTUFF/LOT/CONTAINER/UNKNOWN), at |
| PrintJob | Ticket sent to printer | jobId, ticketId, status (PRINTED/FAILED), preview |
| DeviceStatus | Status-bar view | device, state, since |

### Key Operations
| Operation | Inputs | Outputs |
|-----------|--------|---------|
| ScalePort.list / status / read / tare | scaleId | scales / status / reading / tare value |
| ScannerPort.nextScans / status | since | scan events / state |
| PrinterPort.print / status | ticket | job result / state |

---

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 7 |
| Must Have | 7 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 001-dummy-scales-and-scale-api | Dummy scales and scale listing/status API | Must | Planned |
| 002-live-net-weight-reading | Live net weight with stability | Must | Planned |
| 003-tare-command | Tare the scale with the container in place | Must | Planned |
| 004-scale-simulation-controls | Scale simulation controls | Must | Planned |
| 005-scale-disconnection-detection | Detect scale disconnection | Must | Planned |
| 006-dummy-scanner-and-scan-delivery | Dummy scanner and scan delivery | Must | Planned |
| 007-dummy-printer | Dummy ticket printer | Must | Planned |

---

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| — | Foundation unit (uses the scaffold created by the first bolt) |

### Depended By
| Unit | Reason |
|------|--------|
| 004-weighing-station | Live weight, tare, calibration/status, scans |
| 005-completion-and-ticketing | Printing |
| 006-assisted-weighing-station-ui | `/api/scales/:id/weight` polling, device status, scan delivery |

### External Dependencies
| System | Purpose | Risk |
|--------|---------|------|
| Real scale indicators (not available) | Continuous weight | Severe (A-05) — contained by `ScalePort` |
| Real scanner / printer (not available) | Codes / tickets | Moderate (A-10, A-04) |

---

## Technical Context

### Suggested Technology
Fastify plugins per dummy device; in-memory device state (no DB — `data-stack.md`); `decimal.js` for weights; dispense simulation runs server-side on a timer.

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| 004 / 005 | Ports | in-process |
| Station UI | `/api/scales…`, device status, scans | REST/JSON, polled at 10 Hz for weight |
| Dummy devices | `/ext/scale`, `/ext/scanner`, `/ext/printer` | REST/JSON |

### Data Storage
| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Device state, stored tickets (printer) | In-memory | small | process lifetime (tickets are also persisted by 005) |

---

## Constraints

- UI reads weight only through `/api/scales/:id/weight`; nothing simulates weight in the UI.
- `_sim` endpoints registered only in development/test.

---

## Success Criteria

### Functional
- [ ] `GET /api/scales` lists both scales with capacity and calibration
- [ ] After `_sim` set weight 93.4 g on `scale-3kg`, `/api/scales/scale-3kg/weight` returns `{value:"93.4",unit:"g"}`, and `stable:true` after 500 ms
- [ ] Tare zeroes the net reading and returns the tare value
- [ ] Disconnect → readings report `connected:false` / 503 within 2 s
- [ ] Injected scans are delivered once; scanner offline reported
- [ ] Printer accepts a ticket and returns a preview; OFFLINE/OUT_OF_PAPER → `PRINTER_UNAVAILABLE`

### Non-Functional
- [ ] Weight endpoint sustains 10 Hz polling with ≤ 200 ms lag on localhost

### Quality
- [ ] Contract tests for every endpoint and port operation; all acceptance criteria met

---

## Bolt Plan

Planned in workbook Step 12 (`memory-bank/bolts/`).

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| 003-device-integration | Simple | 001, 002, 003, 004, 005 | Build the Dummy Scale and ScalePort with the `/api/scales` facade, live net weight, stability, tare, simulation controls and disconnection detection. |
| 004-device-integration | Simple | 006, 007 | Build the Dummy Scanner and Dummy Printer with their ports and status endpoints. |

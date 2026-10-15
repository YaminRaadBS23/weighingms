---
stage: plan
bolt: 004-device-integration
created: 2026-10-15T13:08:04Z
---

## Implementation Plan: device-integration — scanner and printer (bolt 4 of 17)

### Objective

Complete the Dummy Integration Layer with the two remaining station peripherals: a **Dummy Scanner** whose scans reach the station UI through WeighingMS (with typed entry as an equivalent fallback), and a **Dummy Printer** that accepts printable documents, keeps them for evidence and can fail in defined ways. Both sit behind ports, exactly like OrgaTEX and the scales.

### Stories and requirements implemented

| Story | Requirements | What it delivers |
|-------|--------------|------------------|
| `006-dummy-scanner-and-scan-delivery` | DB-3, FR-34, IR-15; supports FR-1, FR-3, FR-7–FR-9 | Dummy Scanner (`/ext/scanner`), `ScannerPort`, `/api/scanner/scans?since=…` feed with code classification, `/api/scanner/manual` for typed entry, `/api/scanner/status` |
| `007-dummy-printer` | DB-4; supports FR-29, FR-30, FR-35 | Dummy Printer (`/ext/printer`), `PrinterPort.print`, `/api/printer/status`, stored jobs list |

Out of scope: validating scans against batches/recipes/lots/containers (bolts 005, 008, 009), ticket content and the `POST /api/tickets` endpoint (bolt 015), UI rendering (bolts 007, 011, 016).

---

### 1. What will change

1. **Dummy Scanner** (`src/server/integrations/scanner/dummy/`): in-memory buffer of scanned codes, each with a sequence number and time; online/offline state. While offline, the scan feed answers 503 and simulated scans are refused.
2. **Scan classification** (WeighingMS, `src/shared/scan-codes.ts`): a raw code is classified by pattern into a kind — a real scanner only returns text, so classification is WeighingMS' job. The same function classifies scanned and typed codes, which is what makes them "validated identically".
3. **Scan feed** (`/api/scanner/scans?since=<seq>`): returns events with a sequence number greater than `since` plus a new `cursor`. A client polling with the returned cursor receives each scan exactly once.
4. **Typed entry** (`POST /api/scanner/manual`): returns the same event shape (classified, `source: MANUAL`). Works whether or not the scanner is online.
5. **Dummy Printer** (`src/server/integrations/printer/dummy/`): accepts a printable document (lines of text plus an optional barcode value), stores the job, returns PRINTED with a text preview; states READY / OFFLINE / OUT_OF_PAPER, with 503 and the state when not READY.
6. **Ports + adapters**: `ScannerPort` (status, scans since), `PrinterPort` (status, print, list jobs) with timeouts and error translation, reusing the shared integration plumbing.
7. **Facade** (`src/server/modules/peripherals/routes.ts`): `/api/scanner/status`, `/api/scanner/scans`, `/api/scanner/manual`, `/api/printer/status`.
8. **Errors**: `SCANNER_UNAVAILABLE` (503), `PRINTER_UNAVAILABLE` (503, with the printer state).

### 2. Files to be created / modified

```text
src/shared/scan-codes.ts                          code → kind classification (training patterns)     (new)
src/shared/scan-codes.test.ts                                                                          (new)
src/shared/peripherals.ts                         /api/scanner and /api/printer contract types       (new)

src/server/integrations/scanner/
  scanner-port.ts, http-scanner-adapter.ts, http-scanner-adapter.test.ts                             (new)
  dummy/contract.ts, dummy/scanner-device.ts, dummy/routes.ts, dummy/routes.test.ts                  (new)
src/server/integrations/printer/
  printer-port.ts, http-printer-adapter.ts, http-printer-adapter.test.ts                             (new)
  dummy/contract.ts, dummy/printer-device.ts, dummy/routes.ts, dummy/routes.test.ts                  (new)
src/server/modules/peripherals/routes.ts, routes.test.ts                                             (new)

src/server/app.ts, config.ts, errors.ts, src/shared/errors.ts, src/server/test-support.ts            (modified)
README.md                                                                                             (modified)
```

### 3. APIs involved

**Dummy Scanner — training contract (real scanner interface unknown, brief A-10):**

| Method | Path | Behaviour |
|--------|------|-----------|
| GET | `/ext/scanner/status` | `{ state: READY \| OFFLINE }` |
| GET | `/ext/scanner/scans?since=N` | `{ items: [{ seq, code, at }], cursor }`; 503 `SCANNER_OFFLINE` when offline |
| POST | `/ext/scanner/_sim/scan` | `{ code }` → appended; 409 `SCANNER_OFFLINE` when offline *(dev/test only)* |
| POST | `/ext/scanner/_sim/offline` · `/online` · `/reset` | *(dev/test only)* |

**Dummy Printer — training contract (printer and label unknown, brief A-04 / Q18):**

| Method | Path | Behaviour |
|--------|------|-----------|
| GET | `/ext/printer/status` | `{ state: READY \| OFFLINE \| OUT_OF_PAPER }` |
| POST | `/ext/printer/jobs` | body `{ documentId, lines: string[], barcode: string \| null }` → `{ jobId, documentId, status: PRINTED, printedAt, preview }`; 503 `PRINTER_OFFLINE` / `PRINTER_OUT_OF_PAPER` with `details.state` |
| GET | `/ext/printer/jobs` | `{ items: job[] }` — printed jobs (workbook Step 27 evidence) |
| POST | `/ext/printer/_sim/state` | `{ state }` *(dev/test only)* |
| POST | `/ext/printer/_sim/reset` | READY, no jobs *(dev/test only)* |

**WeighingMS API:**

| Method | Path | Behaviour |
|--------|------|-----------|
| GET | `/api/scanner/status` | `{ state: READY \| OFFLINE }` |
| GET | `/api/scanner/scans?since=N` | `{ items: [{ seq, code, kind, source: SCANNER, at }], cursor }`; 503 `SCANNER_UNAVAILABLE` |
| POST | `/api/scanner/manual` | `{ code }` → `{ seq: null, code, kind, source: MANUAL, at }`; 400 if empty |
| GET | `/api/printer/status` | `{ state: READY \| OFFLINE \| OUT_OF_PAPER }` (READY if the printer answers, OFFLINE if unreachable) |

**Ports (in-process):** `ScannerPort.getStatus()`, `scansSince(seq)`; `PrinterPort.getStatus()`, `print(document)`, `listJobs()`.

### 4. Scan code classification (training patterns)

| Kind | Pattern | Examples (from the prototype / seed) |
|------|---------|--------------------------------------|
| BATCH | `B-` + 5 digits | B-24187 |
| DYESTUFF | `DYE-` or `AUX-` + 4 digits | DYE-4471, AUX-0101 |
| LOT | 4 digits `-` 4 digits | 2026-0387 |
| CONTAINER | one letter `-` 2 digits | C-12, D-03 |
| BADGE | `BDG-` + 4 digits | BDG-0417 (operator badges are seeded in bolt 006) |
| UNKNOWN | anything else | delivered as-is |

Codes are trimmed and upper-cased before classification. Real barcode formats are an open question (Q19, A-10); the patterns are recorded as a **training decision**.

### 5. Technical approach

- **Cursor-based delivery** instead of "consume on read": deterministic, safe if the UI reloads, and testable ("delivered once" = no event repeats once the returned cursor is used).
- **Scanner/printer state in memory**; printed jobs in memory too (the WeighingMS ticket record itself is persisted by bolt 015).
- **Preview**: plain text of the document lines plus `[barcode: <value>]`; the barcode graphic (Code 128) belongs to the ticket bolt.
- **Timeouts**: scanner 500 ms (polled), printer 2000 ms.
- **Printer status via the facade**: if the printer cannot be reached at all, `/api/printer/status` reports OFFLINE rather than failing, so the status bar always has a value.
- **Production gating**: `_sim` routes only with `enableSimulation`.

### 6. How this will be tested

| Level | Tests |
|-------|-------|
| Unit | `scan-codes.test.ts`: every kind incl. trimming/upper-casing and UNKNOWN |
| Contract — Dummy Scanner | status; `_sim/scan` + feed with cursor; offline → feed 503, `_sim/scan` 409; online; reset; production → `_sim` 404 |
| Contract — Dummy Printer | print READY → PRINTED + preview + stored job; OFFLINE / OUT_OF_PAPER → 503 with state, nothing stored; jobs list; reset; production → `_sim` 404 |
| Adapters | mapping; offline/timeout/refused → `SCANNER_UNAVAILABLE` / `PRINTER_UNAVAILABLE` (with state) |
| API — facade | scanned `B-24187` appears once with kind BATCH (second poll with cursor: empty); `DYE-4471`, `2026-0387`, `C-12`, `BDG-0417` → DYESTUFF, LOT, CONTAINER, BADGE; scanner offline → status OFFLINE and feed 503; typed code via `/api/scanner/manual` while offline → same classification; printer status READY / OFFLINE / OUT_OF_PAPER; printer unreachable → OFFLINE |
| Regression | all 132 existing tests; typecheck, lint, format |
| Manual | `npm start` + `curl`: inject a scan and poll the feed; print a document and list jobs |

### Acceptance Criteria (bolt level)

- [ ] A simulated scan of `B-24187` is delivered once through `/api/scanner/scans` with kind BATCH
- [ ] DYE-4471, 2026-0387, C-12 and a badge ID classify as DYESTUFF, LOT, CONTAINER, BADGE
- [ ] Scanner offline → status OFFLINE, no scans delivered; typed entry still accepted and classified identically
- [ ] `PrinterPort.print` while READY stores the job and returns PRINTED with a preview
- [ ] Printer OFFLINE / OUT_OF_PAPER → `PRINTER_UNAVAILABLE` with the state
- [ ] `/api/printer/status` reports READY / OFFLINE / OUT_OF_PAPER; `/ext/printer/jobs` lists printed jobs
- [ ] `_sim` routes absent in production; all existing tests still pass

### Notes

- The badge pattern `BDG-nnnn` is fixed here so bolt 006 seeds operators that match it.
- The printable document is generic (lines + barcode value) so bolt 015 decides the ticket layout without changing the printer port.

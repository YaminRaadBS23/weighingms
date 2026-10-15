---
stage: implement
bolt: 004-device-integration
created: 2026-10-15T13:10:33Z
---

## Implementation Walkthrough: device-integration — scanner and printer (bolt 4)

### Summary

The Dummy Integration Layer is complete. A Dummy Scanner records raw scans that WeighingMS delivers to the station UI through a cursor-based feed, classifying each code (batch, dyestuff, lot, container, badge) with the same function used for typed entry. A Dummy Printer prints generic documents, keeps the printed jobs for evidence, and can be made OFFLINE or OUT_OF_PAPER. Both are reached only through `ScannerPort` and `PrinterPort`, and exposed to the UI through `/api/scanner` and `/api/printer`.

### Structure Overview

Each device follows the pattern already used for OrgaTEX and the scales: an isolated dummy module (device class, wire contract, routes with `_sim` controls registered only when simulation is enabled), a port, and an HTTP adapter built on the shared integration plumbing. A peripherals facade module turns raw scans into classified scan events and reports scanner and printer state; classification lives in shared code so the UI can use the same rules.

### Completed Work

- [x] `src/shared/scan-codes.ts` - Code normalisation (trim, upper-case) and classification into BATCH, DYESTUFF, LOT, CONTAINER, BADGE or UNKNOWN (training patterns)
- [x] `src/shared/peripherals.ts` - `/api/scanner` and `/api/printer` contract types shared with the UI
- [x] `src/server/integrations/scanner/dummy/contract.ts` - Dummy Scanner wire format (training contract)
- [x] `src/server/integrations/scanner/dummy/scanner-device.ts` - Append-only scan buffer with sequence numbers, online/offline, reset
- [x] `src/server/integrations/scanner/dummy/routes.ts` - `/ext/scanner` status and scan feed; `_sim` scan, offline, online, reset
- [x] `src/server/integrations/scanner/scanner-port.ts` - ScannerPort
- [x] `src/server/integrations/scanner/http-scanner-adapter.ts` - Port implementation: 500 ms timeout, `SCANNER_UNAVAILABLE`, debug logging of polls
- [x] `src/server/integrations/printer/dummy/contract.ts` - Dummy Printer wire format (training contract)
- [x] `src/server/integrations/printer/dummy/printer-device.ts` - Prints and stores jobs with a text preview; READY / OFFLINE / OUT_OF_PAPER
- [x] `src/server/integrations/printer/dummy/routes.ts` - `/ext/printer` status, print, job list; `_sim` state and reset
- [x] `src/server/integrations/printer/printer-port.ts` - PrinterPort with a generic printable document
- [x] `src/server/integrations/printer/http-printer-adapter.ts` - Port implementation: 2 s timeout, `PRINTER_UNAVAILABLE` carrying the printer state, prints logged at info
- [x] `src/server/modules/peripherals/routes.ts` - `/api/scanner/status`, `/api/scanner/scans`, `/api/scanner/manual`, `/api/printer/status`
- [x] `src/server/errors.ts`, `src/shared/errors.ts` - `SCANNER_UNAVAILABLE`, `PRINTER_UNAVAILABLE`, `DEVICE_PROTOCOL_ERROR`
- [x] `src/server/config.ts` - Scanner and printer base URLs and timeouts
- [x] `src/server/app.ts` - Registers both dummies, decorates `scanner` and `printer` ports, registers the peripherals facade
- [x] `src/server/test-support.ts` - Test app reaches both dummies through inject
- [x] `README.md` - Layout and API tables extended

### Key Decisions

- **Classification in WeighingMS, not in the scanner**: a scanner returns text; deciding what it means is a WeighingMS rule, and sharing one function makes scanned and typed codes behave identically (FR-34).
- **Cursor-based feed** (`since` / `cursor`): each scan is delivered once to a client that follows the cursor, survives a UI reload, and is easy to test.
- **Status endpoints never fail**: if the scanner or printer cannot be reached, status reports OFFLINE, so the status bar always shows a value.
- **Printer failures carry their state** (`OFFLINE` / `OUT_OF_PAPER`) all the way to the WeighingMS error, so the UI can say why printing failed.
- **Generic printable document** (lines + barcode value): the ticket layout stays a ticket-module decision (bolt 015).

### Deviations from Plan

- Added a `DEVICE_PROTOCOL_ERROR` (502) for malformed scanner/printer answers, matching the existing OrgaTEX and scale protocol errors.
- The printed job also stores its lines and barcode value (not only the preview) so the job list is useful as evidence.

### Dependencies Added

None.

### Developer Notes

- Verified manually against `npm start`: six scans (`B-24187`, ` dye-4471 `, `2026-0387`, `C-12`, `BDG-0417`, `XYZ`) arrive once in order as BATCH, DYESTUFF, LOT, CONTAINER, BADGE, UNKNOWN with cursor 6; polling with `since=6` returns nothing; scanner offline → status OFFLINE and feed 503 `SCANNER_UNAVAILABLE`, while `/api/scanner/manual` still classifies `dye-4471` as DYESTUFF; printer READY prints with preview; OUT_OF_PAPER → 503 with the state and no job stored.
- Typecheck, lint, format pass; all 132 existing tests pass.
- Badge format `BDG-nnnn` is now fixed; bolt 006 seeds operators to match.

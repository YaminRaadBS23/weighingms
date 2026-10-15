---
stage: test
bolt: 004-device-integration
created: 2026-10-15T13:32:11Z
---

## Test Report: device-integration — scanner and printer (bolt 4)

### Summary

- **Tests**: 177/177 passed (17 files; 45 new in this bolt, 132 regression)
- **Coverage**: not measured (project standard: critical-path list instead of a coverage gate); every acceptance criterion below is covered by a test
- **Quality gates**: `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run format:check` ✅

### Test Files

- [x] `src/shared/scan-codes.test.ts` - **12 tests**: each kind (BATCH, DYESTUFF incl. AUX, LOT, CONTAINER, BADGE), near-misses and empty → UNKNOWN; trimming and upper-casing
- [x] `src/server/integrations/scanner/dummy/routes.test.ts` - **6 contract tests**: initial status and empty feed; raw scans in order with sequence numbers, `since` filtering and cursor; offline → status OFFLINE, feed 503 `SCANNER_OFFLINE`, simulated scan refused 409, online restores; reset; empty scan 400; **production → `_sim` 404**
- [x] `src/server/integrations/printer/dummy/routes.test.ts` - **7 contract tests**: READY print → PRINTED, exact preview, stored job; document without barcode; OFFLINE and OUT_OF_PAPER → 503 with `details.state`, nothing stored; malformed document and invalid state → 400; reset; **production → `_sim` 404**
- [x] `src/server/integrations/scanner/http-scanner-adapter.test.ts` - **4 tests**: status and feed mapping; offline → OFFLINE / `SCANNER_UNAVAILABLE`; timeout and connection refused → `SCANNER_UNAVAILABLE`; malformed feed → `DEVICE_PROTOCOL_ERROR`
- [x] `src/server/integrations/printer/http-printer-adapter.test.ts` - **5 tests**: print (logged at info), result and job list; OFFLINE and OUT_OF_PAPER → `PRINTER_UNAVAILABLE` carrying the state; timeout and connection refused → `PRINTER_UNAVAILABLE` (OFFLINE); malformed job → `DEVICE_PROTOCOL_ERROR`
- [x] `src/server/modules/peripherals/routes.test.ts` - **11 facade API tests**: `B-24187` delivered once with kind BATCH (second poll with cursor empty); DYE-4471 / 2026-0387 / C-12 / BDG-0417 → DYESTUFF / LOT / CONTAINER / BADGE; normalisation; scanner offline → OFFLINE and 503; typed entry while offline → identical classification for all five kinds; empty typed code → 400; invalid `since` → 0; printer status READY / OFFLINE / OUT_OF_PAPER; unreachable printer → OFFLINE (200, not an error)
- [x] Regression: all 132 tests from bolts 001–003 pass

### Acceptance Criteria Validation

**Story 006-dummy-scanner-and-scan-delivery**
- ✅ **`_sim/scan {code:"B-24187"}` → next `GET /api/scanner/scans?since=…` returns it once with kind BATCH**: facade test
- ✅ **DYE-4471, 2026-0387, C-12, a badge → DYESTUFF, LOT, CONTAINER, BADGE**: facade and classification tests
- ✅ **`_sim/offline` → status OFFLINE, no scans delivered**: facade, contract and adapter tests
- ✅ **Scanner offline → typed code accepted through the same path and classified identically**: facade test

**Story 007-dummy-printer**
- ✅ **READY → `PrinterPort.print` stores the job and returns PRINTED with a preview**: adapter and contract tests
- ✅ **OFFLINE / OUT_OF_PAPER → `PRINTER_UNAVAILABLE` with the state**: adapter and contract tests
- ✅ **`GET /api/printer/status` → READY / OFFLINE / OUT_OF_PAPER**: facade test
- ✅ **`GET /ext/printer/jobs` lists printed jobs (Step 27 evidence)**: contract and adapter tests

**Bolt-level (implementation-plan.md)**: all seven criteria met, including `_sim` absent in production and all existing tests passing.

### Issues Found

None.

### Notes

- With this bolt the Dummy Integration Layer of workbook Step 16 (OrgaTEX, scales, scanner, printer) is complete and tested.
- The manual run recorded in the implementation walkthrough matches the automated results.

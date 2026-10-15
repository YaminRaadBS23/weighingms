---
stage: implement
bolt: 003-device-integration
created: 2026-10-15T13:03:06Z
---

## Implementation Walkthrough: device-integration — scales (bolt 3)

### Summary

WeighingMS now reads the station's two scales through `ScalePort`. A Dummy Scale training system simulates the 3 kg precision and 32 kg floor scales in memory — weight, tare, stability, connection and calibration — with training-only controls to set exact weights, simulate pouring and overshoot, place containers, expire calibration and disconnect a scale. The WeighingMS `/api/scales` facade exposes scales, status, live net weight and tare to the station UI.

### Structure Overview

The Dummy Scale is an isolated module: a device class per scale (pure simulation logic with an injectable clock), its HTTP routes, and its `_sim` routes registered only when simulation is enabled. The scale adapter maps the dummy's wire format to `ScalePort` types and translates failures. The facade module derives calibration and display state on top of the port. HTTP transport and timeout handling, previously inside the OrgaTEX adapter, now live in a shared integration module used by both adapters.

### Completed Work

- [x] `data/seed/scales-seed.json` - Two scales: class, capacity, reading unit, resolution, calibration due date
- [x] `src/server/integrations/http.ts` - Shared transport (fetch and inject), body parsing, timeout race, error-body reader
- [x] `src/server/integrations/orgatex/http-orgatex-adapter.ts` - Now uses the shared plumbing (behaviour unchanged)
- [x] `src/server/integrations/scale/scale-port.ts` - The port and WeighingMS' view of scales and readings
- [x] `src/server/integrations/scale/http-scale-adapter.ts` - Port implementation: 500 ms timeout, error translation, debug-level logging of successful reads
- [x] `src/server/integrations/scale/dummy/contract.ts` - Dummy Scale wire format (training contract)
- [x] `src/server/integrations/scale/dummy/scale-device.ts` - Simulated indicator: quantised decimal weights, tare, 500 ms stability rule, easing dispense, connection, calibration, reset
- [x] `src/server/integrations/scale/dummy/devices.ts` - Creates devices from the seed; shared 404 helper
- [x] `src/server/integrations/scale/dummy/routes.ts` - `/ext/scale` list, single scale, reading, tare; registers simulation when enabled
- [x] `src/server/integrations/scale/dummy/simulation.ts` - `_sim` weight, dispense, container, calibration, disconnect, reconnect, reset, state
- [x] `src/server/modules/scales/routes.ts` - `/api/scales` facade with calibration (VALID/EXPIRED) and display state (READY/OFFLINE/CAL_EXPIRED)
- [x] `src/shared/scales.ts` - `/api/scales` contract types shared with the UI
- [x] `src/server/errors.ts`, `src/shared/errors.ts` - `SCALE_NOT_FOUND`, `SCALE_UNAVAILABLE`, `SCALE_PROTOCOL_ERROR`
- [x] `src/server/config.ts` - Scale base URL and timeout
- [x] `src/server/app.ts` - Registers Dummy Scale, decorates `scales` port, registers `/api/scales`; device clock injectable
- [x] `src/server/test-support.ts` - Test app reaches the Dummy Scale through inject; optional controllable device clock
- [x] `src/server/integrations/orgatex/http-orgatex-adapter.test.ts` - Imports moved to the shared plumbing
- [x] `README.md` - API tables reorganised (WeighingMS API, dummy systems, simulation controls)

### Key Decisions

- **Device logic in a plain class with an injectable clock**: stability (500 ms) and dispensing are deterministic under test without real waiting.
- **Readings quantised to the scale's resolution with decimal rounding**: the 3 kg scale always reads one decimal in grams, the 32 kg scale three decimals in kilograms (TD-12) — no floating point anywhere.
- **Disconnected → 503 `SCALE_UNAVAILABLE`** on weight and tare (not a 200 with `connected:false`); status endpoints still answer and report OFFLINE.
- **Successful scale calls logged at debug**: the UI polls at 10 Hz; info-level logging would flood the log. Failures remain warnings (IR-09).
- **Calibration enforcement left to the weighing domain**: the facade reports CAL_EXPIRED but still returns weights; blocking is bolt 009.
- **Shared plumbing extracted** rather than duplicated in a second adapter.

### Deviations from Plan

- Added `dummy/devices.ts` (not in the plan's file list) to hold device creation and the 404 helper, avoiding a circular import between the dummy's routes and simulation modules.
- Added a single-scale endpoint `GET /ext/scale/scales/:scaleId` in the dummy (needed by the port's `getScale`).

### Dependencies Added

None.

### Developer Notes

- Verified manually against `npm start`: both scales listed READY/VALID; container 214.0 g → tare returns 214.0 g → weight 0.0 g; dispense to 94.2 g polled every ~100 ms shows easing (19.1, 34.3, 46.4 … 89.6) and lands exactly on 94.2 g; 32 kg scale reads `24.060` kg; disconnected 3 kg scale → 503 while the 32 kg scale keeps reading; calibration expired → CAL_EXPIRED; unknown scale → 404.
- A reading taken less than 500 ms after the last weight change is `stable:false` by design (TD-9).
- Typecheck, lint, format pass; all 81 existing tests pass after the plumbing refactor.

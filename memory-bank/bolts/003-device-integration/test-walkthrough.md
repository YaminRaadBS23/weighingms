---
stage: test
bolt: 003-device-integration
created: 2026-10-15T13:06:11Z
---

## Test Report: device-integration — scales (bolt 3)

### Summary

- **Tests**: 132/132 passed (11 files; 51 new in this bolt, 81 regression)
- **Coverage**: not measured (project standard: critical-path list instead of a coverage gate); every acceptance criterion below is covered by a test
- **Quality gates**: `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run format:check` ✅

### Test Files

- [x] `src/server/integrations/scale/dummy/scale-device.test.ts` - **19 tests** on the simulated indicator with a manual clock: empty/stable start; container 214 g + tare → 0.0 g; second tare replaces the first; exact net 93.4 / 93.5 / 94.0 / 94.5 / 94.6 g; quantisation (94.26 → 94.3 g, 24.0604 → 24.060 kg); unit conversion; stability flips at exactly 500 ms and only on a real change; dispense to 94.2 g eases (first step larger than the last, monotonic) and lands exactly, then becomes stable; overshoot lands exactly on 96.4 g; downward dispense; kg dispense to 23.980 kg; new weight cancels a dispense; disconnect → 503 `SCALE_OFFLINE` and reconnect; calibration expire/restore; reset
- [x] `src/server/integrations/scale/dummy/routes.test.ts` - **15 contract tests**: scale list with exact seeded values; single scale, reading, tare; 404 `SCALE_NOT_FOUND`; disconnected → 503 with the other scale unaffected; `_sim` weight (string or `{value, unit}`), dispense with a controllable clock, overshoot 96.4 g, container, calibration, disconnect/reconnect, reset; invalid inputs → 400; unknown scale in a control → 404; **production configuration → `_sim` 404**
- [x] `src/server/integrations/scale/http-scale-adapter.test.ts` - **8 tests**: list/single mapping; read and tare mapping; successful calls logged at **debug only**, failures at warn; disconnected → `SCALE_UNAVAILABLE` (503) for read and tare; unknown → `SCALE_NOT_FOUND`; timeout and connection refused → `SCALE_UNAVAILABLE`; malformed reading → `SCALE_PROTOCOL_ERROR` (502)
- [x] `src/server/modules/scales/routes.test.ts` - **9 facade API tests**: list with VALID/READY and future calibration; status READY → OFFLINE → CAL_EXPIRED; container + tare → weight `0.0 g`; second tare; stability at 499 / 500 ms; kg with 3 decimals; disconnection → 503 on weight and tare, other scale unaffected, reconnect resumes; unknown scale → 404 on all endpoints; **20 reads at 100 ms intervals all under 100 ms** (≈ 2.0 s test)
- [x] `src/server/test-support.ts` - `ManualClock` (deterministic time and interval timers for the simulated scales); test app wired to the Dummy Scale through inject
- [x] Regression: all 81 tests from bolts 001–002 pass after the shared-plumbing refactor

### Acceptance Criteria Validation

**Story 001-dummy-scales-and-scale-api**
- ✅ **`GET /api/scales` → scale-3kg (PRECISION, 3 kg), scale-32kg (FLOOR, 32 kg) with resolution and future calibration**: facade test
- ✅ **Status → connected, VALID/EXPIRED, READY/OFFLINE/CAL_EXPIRED**: facade test
- ✅ **Unknown scale → 404 `SCALE_NOT_FOUND`**: facade, adapter and contract tests
- ✅ **WeighingMS reads via `ScalePort` from `/ext/scale`**: facade is wired only to the port; adapter tests cover the transport

**Story 002-live-net-weight-reading**
- ✅ **Gross 214.0 g, tare 214.0 g → `{ weight: { "0.0", g }, stable, connected: true, at }`**: facade test
- ✅ **Each poll reflects the dummy state (≤ 200 ms lag)**: reads are synchronous on current device state; max read time < 100 ms
- ✅ **Stable after ≥ 500 ms unchanged, not while changing**: device and facade tests (499 vs 500 ms)
- ✅ **scale-32kg in kg with 3 decimals**: facade and device tests
- ✅ **20 consecutive reads at 100 ms all succeed within the interval**: facade test

**Story 003-tare-command**
- ✅ **Container C-12 (214 g) → tare → net 0.0 g, response tare `"214.0" g`**: facade and device tests
- ✅ **Disconnected → 503 `SCALE_UNAVAILABLE`**: facade and adapter tests
- ✅ **Second tare replaces the old**: facade and device tests

**Story 004-scale-simulation-controls**
- ✅ **Set weight 93.4 → next reading exactly 93.4 g**: contract and device tests
- ✅ **Dispense to 94.2 eases (fast, then slower) and becomes stable**: device and contract tests
- ✅ **Dispense to 96.4 (overshoot) ends over tolerance**: device and contract tests
- ✅ **Container → gross includes the container**: contract test
- ✅ **Calibration expired → CAL_EXPIRED**: facade test
- ✅ **Production → `_sim` 404**: contract test

**Story 005-scale-disconnection-detection**
- ✅ **Disconnect → weight 503 `SCALE_UNAVAILABLE` within 2 s**: immediate (facade test)
- ✅ **Disconnected → status OFFLINE**: facade test
- ✅ **Reconnect → readings resume**: facade and contract tests
- ✅ **Other scale unaffected**: facade and contract tests

### Issues Found

None.

### Notes

- Time-dependent behaviour (stability, dispensing) is tested with `ManualClock`, so these tests are exact and do not wait; only the 10 Hz throughput test uses real time (~2 s).
- The manual run recorded in the implementation walkthrough (pour curve 19.1 → … → 94.2 g at ~10 Hz polling) matches the automated results.

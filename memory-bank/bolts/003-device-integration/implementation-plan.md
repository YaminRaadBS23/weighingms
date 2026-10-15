---
stage: plan
bolt: 003-device-integration
created: 2026-10-15T12:58:38Z
---

## Implementation Plan: device-integration — scales (bolt 3 of 17)

### Objective

Give WeighingMS live, trustworthy access to the station's two scales: a **Dummy Scale** training system (`/ext/scale`) that simulates the 3 kg precision and 32 kg floor scales server-side, a `ScalePort` with an HTTP adapter, and the WeighingMS **`/api/scales` facade** the station UI will poll at 10 Hz. Includes training-only controls to set exact weights, simulate dispensing/overshoot, place a container, expire calibration and disconnect a scale.

### Stories and requirements implemented

| Story | Requirements | What it delivers |
|-------|--------------|------------------|
| `001-dummy-scales-and-scale-api` | DB-2; supports FR-11, FR-13, FR-32 | Two seeded scales; `GET /api/scales`, `GET /api/scales/:scaleId/status`; `SCALE_NOT_FOUND` |
| `002-live-net-weight-reading` | FR-14, NFR-1, IR-10, IR-11, TD-9, TD-12 | `GET /api/scales/:scaleId/weight` → net weight, `stable`, `connected`, `at`; 10 Hz capable |
| `003-tare-command` | FR-10, IR-12 | `POST /api/scales/:scaleId/tare` → applied tare; `SCALE_UNAVAILABLE` when disconnected |
| `004-scale-simulation-controls` | DB-6, DB-2 | `/ext/scale/_sim/:scaleId/weight | dispense | container | calibration | reset` (dev/test only) |
| `005-scale-disconnection-detection` | FR-33, NFR-3, IR-13 | `/_sim/:scaleId/disconnect | reconnect`; weight/status/tare report unavailable within 2 s; other scale unaffected |

Out of scope: scale **selection** rule and calibration **enforcement** (bolt 009), confirmation blocking (bolt 010), UI polling/rendering (bolt 011), scanner and printer (bolt 004).

---

### 1. What will change

1. **Dummy Scale** (new isolated module `src/server/integrations/scale/dummy/`): in-memory state per scale — gross weight, tare, connected flag, calibration due date, time of last change — seeded from `data/seed/scales-seed.json`. Readings are quantised to the scale's resolution and expressed in the scale's unit (3 kg → g, 1 decimal; 32 kg → kg, 3 decimals — TD-12).
2. **Stability**: a reading is `stable: true` when the gross weight has not changed for ≥ 500 ms (TD-9, IR-11).
3. **Dispense simulation**: server-side timer moving the net weight towards a landing value, fast at first and slowing near the end (step = max(0.4 % of the distance's scale, 5.5 % of remaining), ~30 ms ticks) — inspired by the prototype's `run()` behaviour, implemented independently. A new weight command cancels a running dispense.
4. **ScalePort + HTTP adapter**: `listScales`, `getStatus`, `read`, `tare`; timeout 500 ms; dummy 503/timeout/network error → `SCALE_UNAVAILABLE`; unknown scale → `SCALE_NOT_FOUND`. Readings are logged at debug level only (10 Hz would flood the log); failures at warn (IR-09).
5. **WeighingMS facade** `/api/scales…` delegating to `ScalePort`, adding derived calibration state (VALID / EXPIRED) and display state (READY / OFFLINE / CAL_EXPIRED).
6. **Shared integration plumbing** (small refactor): the transport types (`HttpClient`, `fetchHttpClient`, `parseBody`, inject transport) and the timeout-race used by the OrgaTEX adapter move to `src/server/integrations/http.ts` so both adapters share them. OrgaTEX behaviour is unchanged (its 81 tests guard this).

### 2. Files to be created / modified

```text
data/seed/scales-seed.json                       scale-3kg, scale-32kg (capacity, unit, resolution, calibration due)

src/server/integrations/http.ts                  shared transport + timeout helper                 (new, extracted)
src/server/integrations/orgatex/http-orgatex-adapter.ts   uses shared plumbing                     (modified)
src/server/app.ts                                registers Dummy Scale, ScalePort, /api/scales     (modified)
src/server/config.ts                             scaleBaseUrl, scaleTimeoutMs                      (modified)
src/server/errors.ts, src/shared/errors.ts       SCALE_NOT_FOUND, SCALE_UNAVAILABLE                (modified)

src/server/integrations/scale/
  scale-port.ts                                  ScalePort + types                                 (new)
  http-scale-adapter.ts                          adapter                                            (new)
  http-scale-adapter.test.ts                                                                         (new)
  dummy/contract.ts                              Dummy Scale wire types (training contract)         (new)
  dummy/scale-device.ts                          simulated device: weight, tare, stability, dispense, connection, calibration (new)
  dummy/scale-device.test.ts                                                                         (new)
  dummy/routes.ts                                /ext/scale endpoints                               (new)
  dummy/simulation.ts                            /ext/scale/_sim endpoints (dev/test only)          (new)
  dummy/routes.test.ts                           contract + simulation + production gating tests    (new)

src/server/modules/scales/
  routes.ts                                      /api/scales facade                                 (new)
  routes.test.ts                                 facade API tests                                   (new)
src/shared/scales.ts                             API contract types for /api/scales (shared with UI) (new)
README.md                                        API table                                          (modified)
```

### 3. APIs involved

**Dummy Scale — training contract (not a real scale-indicator protocol, brief A-05):**

| Method | Path | Behaviour |
|--------|------|-----------|
| GET | `/ext/scale/scales` | `{ items: [{ scaleId, class, capacity, unit, resolution, calibrationDueAt, connected }] }` |
| GET | `/ext/scale/scales/:scaleId/reading` | `{ gross, tare, net, stable, at }` (quantities `{value, unit}`); **503 `SCALE_OFFLINE`** when disconnected; 404 unknown |
| POST | `/ext/scale/scales/:scaleId/tare` | tare := current gross → `{ tare }`; 503 when disconnected |
| POST | `/ext/scale/_sim/:scaleId/weight` | `{ net }` → gross := tare + net (exact) |
| POST | `/ext/scale/_sim/:scaleId/dispense` | `{ landing }` → net eases from current to landing, then stable |
| POST | `/ext/scale/_sim/:scaleId/container` | `{ weight }` → an empty container is placed: gross := weight (net shows it until tared) |
| POST | `/ext/scale/_sim/:scaleId/calibration` | `{ expired: true \| false }` |
| POST | `/ext/scale/_sim/:scaleId/disconnect` · `/reconnect` | connection flag |
| POST | `/ext/scale/_sim/reset` | all scales back to seed: empty, tare 0, connected, valid calibration |
| GET | `/ext/scale/_sim/state` | full simulated state |

**WeighingMS API (consumed by the UI from bolt 011):**

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/scales` | `{ items: [{ scaleId, class, capacity, unit, resolution, calibrationDueAt, calibration: VALID\|EXPIRED, state: READY\|OFFLINE\|CAL_EXPIRED }] }` |
| GET | `/api/scales/:scaleId/status` | `{ scaleId, connected, calibration, state }` |
| GET | `/api/scales/:scaleId/weight` | `{ weight: { value, unit }, stable, connected: true, at }`; **503 `SCALE_UNAVAILABLE`** when disconnected |
| POST | `/api/scales/:scaleId/tare` | `{ tare: { value, unit } }`; 503 `SCALE_UNAVAILABLE` |
| — | unknown scale | 404 `SCALE_NOT_FOUND` |

**Port (in-process):** `ScalePort.listScales()`, `getStatus(id)`, `read(id)`, `tare(id)`.

### 4. Seed (`data/seed/scales-seed.json`)

| Scale | Class | Capacity | Reading unit | Resolution | Calibration due |
|-------|-------|----------|--------------|------------|-----------------|
| `scale-3kg` | PRECISION | 3 kg | g | 0.1 g | 2027-03-31 |
| `scale-32kg` | FLOOR | 32 kg | kg | 0.001 kg | 2027-03-31 |

Capacities and classes come from the prototype ("3 kg precision", "32 kg floor"); resolution follows the prototype's display precision; calibration dates are training values.

### 5. Technical approach

- **Device model** is a plain class with an injectable clock and scheduler, so stability timing and dispensing are deterministic in tests (fake timers).
- **Quantisation**: every reading is rounded to the scale's resolution with `decimal.js` (half-up) — no floats.
- **Facade states**: `state` = OFFLINE if not connected, else CAL_EXPIRED if calibration due < now, else READY. The weight endpoint does not refuse an expired scale (enforcement belongs to the weighing domain, bolt 009) but reports it in status.
- **Disconnection** is reported by the dummy as 503 and by the facade as 503 `SCALE_UNAVAILABLE` immediately (well within the 2 s of IR-13); the UI's 2 s stale-reading rule is bolt 011.
- **Shared plumbing refactor** is behaviour-preserving; the OrgaTEX adapter keeps its public API.
- **Configuration**: `SCALE_BASE_URL` (default `http://127.0.0.1:<PORT>/ext/scale`), `SCALE_TIMEOUT_MS` (default 500).

### 6. How this will be tested

| Level | Tests |
|-------|-------|
| Unit — device (`scale-device.test.ts`) | net = gross − tare; quantisation to 0.1 g / 0.001 kg; stable only after 500 ms unchanged; exact set weight 93.4 / 93.5 / 94.0 / 94.5 / 94.6 g; dispense eases to landing 94.2 g and 96.4 g exactly, steps shrinking near the end, then stable; new weight cancels dispense; container + tare → net 0.0; disconnect/reconnect; calibration expired/valid |
| Contract — Dummy Scale (`dummy/routes.test.ts`) | every `/ext/scale` endpoint incl. 404/503; every `_sim` control; **production configuration → `_sim` 404** |
| Adapter (`http-scale-adapter.test.ts`) | mapping; 503 / timeout / network → `SCALE_UNAVAILABLE`; 404 → `SCALE_NOT_FOUND`; reads logged at debug, failures at warn |
| API — facade (`modules/scales/routes.test.ts`) | `GET /api/scales` (two scales, VALID, READY); status READY / OFFLINE / CAL_EXPIRED; weight `{ "0.0" g }` after container 214.0 g + tare; tare returns `{ "214.0" g }`; second tare replaces the first; kg scale reads 3 decimals; disconnected → 503 on weight and tare while the other scale still reads; reconnect → readings resume; **20 reads at 100 ms intervals all succeed**; unknown scale → 404 |
| Regression | all 81 existing tests; typecheck, lint, format |
| Manual | `npm start` + `curl`: container → tare → dispense to 94.2 g while polling `/api/scales/scale-3kg/weight` |

### Acceptance Criteria (bolt level)

- [ ] `GET /api/scales` lists `scale-3kg` (PRECISION, 3 kg) and `scale-32kg` (FLOOR, 32 kg) with resolution and future calibration dates
- [ ] Status reports connected, VALID/EXPIRED and READY/OFFLINE/CAL_EXPIRED; unknown scale → 404 `SCALE_NOT_FOUND`
- [ ] Weight returns decimal net weight in the scale's unit and precision with `stable`, `connected`, `at`; stable only after 500 ms unchanged
- [ ] Tare zeroes the net reading and returns the applied tare; a new tare replaces the old
- [ ] `_sim` controls set exact weights, dispense/overshoot to exact landings, place containers, expire calibration, disconnect/reconnect; absent in production
- [ ] Disconnected scale → 503 `SCALE_UNAVAILABLE` on weight and tare; other scale unaffected; reconnect resumes
- [ ] WeighingMS reaches the scales only through `ScalePort`; 81 existing tests still pass

### Notes

- Calibration due dates are held by the Dummy Scale for training. In the brief, calibration status is WeighingMS master data (§9.3) and its source is open (Q20); bolt 009 decides enforcement, and the source can move behind the port later without changing the API.
- The dummy's reading endpoint is a request/response stand-in for a continuous indicator stream (A-05 unresolved).

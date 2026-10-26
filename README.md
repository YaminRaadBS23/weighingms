# WeighingMS

Assisted dyestuff weighing station — a training product built with the specs.md AI-DLC flow.
The real external systems are not available, so OrgaTEX, the scales, the scanner and the printer
are provided as **Dummy APIs** (training contracts only, not the real interfaces).

- Product sources: `docs/brief.md`, `docs/customize-weighing-station.html`
- AI-DLC artifacts: `memory-bank/` (standards, intent, requirements, units, stories, bolts)

## Requirements

- Node.js 22 or newer (developed on Node 24)

## Run

```bash
npm install
npm run dev        # API on http://127.0.0.1:3000, UI on http://127.0.0.1:5173
```

| Command                                 | Purpose                                           |
| --------------------------------------- | ------------------------------------------------- |
| `npm run dev`                           | API (tsx watch) + UI (Vite) together              |
| `npm start`                             | API only                                          |
| `npm test`                              | Unit, contract and API tests (Vitest)             |
| `npm run typecheck`                     | TypeScript strict check                           |
| `npm run lint` / `npm run format:check` | ESLint / Prettier                                 |
| `npm run db:generate`                   | Generate Drizzle migrations after a schema change |

## Layout

```text
src/shared/                      quantities (decimal), error codes — used by server and UI
src/server/app.ts                Fastify app factory
src/server/integrations/http.ts  shared transport/timeout plumbing for adapters
src/server/integrations/orgatex/ OrgatexPort, HTTP adapter, dummy/ (Dummy OrgaTEX)
src/server/integrations/scale/   ScalePort, HTTP adapter, dummy/ (Dummy Scale devices)
src/server/integrations/scanner/ ScannerPort, HTTP adapter, dummy/ (Dummy Scanner)
src/server/integrations/printer/ PrinterPort, HTTP adapter, dummy/ (Dummy Printer)
src/server/modules/batches/      /api/batches facade and batch service
src/server/modules/weighing/     core domain (DDD): domain/, application/, infrastructure/, routes
src/server/db/weighingms/        weighingms.db schema and migrations
src/server/modules/scales/       /api/scales facade
src/server/modules/peripherals/  /api/scanner and /api/printer facade
src/web/                         station UI (React + Vite)
data/seed/                       training seeds (Dummy OrgaTEX, Dummy Scale)
data/*.db                        local SQLite files: orgatex.db (Dummy OrgaTEX), weighingms.db (WeighingMS);
                                 git-ignored, recreated from seed
```

## APIs (so far)

WeighingMS API (used by the station UI):

| Method + path                                                                                 | Notes                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                                                             |                                                                                                                                                                                                                                                      |
| `GET /api/batches`                                                                            | station batch queue with `selectable` and reason; 503 `ORGATEX_UNAVAILABLE` if OrgaTEX is down                                                                                                                                                       |
| `GET /api/batches/:batchId`                                                                   | batch detail (scanned IDs are trimmed and upper-cased)                                                                                                                                                                                               |
| `GET /api/batches/:batchId/recipe`                                                            | recipe with the components in weighing order                                                                                                                                                                                                         |
| `POST /api/materials/lots/validate`                                                           | verify that a lot is a lot of the dyestuff: 404 `LOT_NOT_FOUND`, 422 `LOT_MISMATCH`                                                                                                                                                                  |
| `GET /api/containers`                                                                         | container master with tare, in-service state and default dyestuff                                                                                                                                                                                    |
| `POST /api/containers/validate`                                                               | scanned or typed container: 404 `CONTAINER_UNKNOWN`, 422 `CONTAINER_OUT_OF_SERVICE`                                                                                                                                                                  |
| `POST /api/operators/sign-in` · `GET /api/operators/current` · `POST /api/operators/sign-out` | operator sign-in by badge (scanned or typed)                                                                                                                                                                                                         |
| `POST /api/sessions`                                                                          | start a weighing session (201) or resume the batch's open session (200)                                                                                                                                                                              |
| `GET /api/sessions/current` · `GET /api/sessions/:sessionId`                                  | session with recipe snapshot and component states                                                                                                                                                                                                    |
| `POST /api/sessions/:sessionId/components/:sequence/activate`                                 | make a pending component the one being weighed                                                                                                                                                                                                       |
| `POST /api/sessions/:sessionId/components/:sequence/identity`                                 | scan the dyestuff (`WRONG_DYESTUFF` if it is another); lot and container default, the scale is tared and weighing unlocks                                                                                                                            |
| `POST /api/sessions/:sessionId/components/:sequence/lot`                                      | replace the lot by a scanned one (`LOT_NOT_FOUND`, `LOT_MISMATCH`)                                                                                                                                                                                   |
| `POST /api/sessions/:sessionId/components/:sequence/container`                                | replace the container by a scanned one; an unlocked component is re-tared                                                                                                                                                                            |
| `POST /api/sessions/:sessionId/components/:sequence/scale`                                    | supervisor reselects the scale: `{ scaleId, supervisorBadge, pin }` (`NOT_AUTHORISED`, `SCALE_CAPACITY_INSUFFICIENT`)                                                                                                                                |
| `GET /api/sessions/:sessionId/components/:sequence/scale-options`                             | scales with their fit and state for the component                                                                                                                                                                                                    |
| `POST /api/sessions/:sessionId/components/:sequence/confirm`                                  | the server reads the scale and, if the weight is stable and inside tolerance, records it (no weight in the request): `TOLERANCE_VIOLATION`, `READING_UNSTABLE`                                                                                       |
| `POST /api/sessions/:sessionId/components/:sequence/retare`                                   | re-zero the scale with the (emptied) container; no record                                                                                                                                                                                            |
| `POST /api/sessions/:sessionId/components/:sequence/override`                                 | supervisor (`supervisorBadge`, `pin`) and `reason` record an out-of-tolerance weight above zero as OVERRIDDEN (surplus from the target if over; no recalculation): `REASON_REQUIRED`, `NOT_AUTHORISED`, `OVERRIDE_NOT_NEEDED`, `NOTHING_TO_OVERRIDE` |
| `GET /api/sessions/:sessionId/components/:sequence/evaluation`                                | read-only: one fresh reading with zone, band, surplus, `confirmable`, `overridable`                                                                                                                                                                  |
| `POST /api/batches/:batchId/consumption`                                                      | sends the consumption of a completed batch to OrgaTEX (optional `Idempotency-Key`); 200 with CONFIRMED, or PENDING when OrgaTEX could not take it; `BATCH_INCOMPLETE` (422), `WRITEBACK_KEY_MISMATCH` (409)                                          |
| `GET /api/batches/:batchId/write-back`                                                        | write-back state (`requested:false` while never sent)                                                                                                                                                                                                |
| `POST /api/batches/:batchId/write-back/retry`                                                 | sends a PENDING write-back again with the same key; audited `WRITEBACK_RETRY`; needs a signed-in operator                                                                                                                                            |
| `GET /api/write-backs/pending-count`                                                          | completed batches not yet CONFIRMED in OrgaTEX                                                                                                                                                                                                       |
| `GET /api/batches/:batchId/summary`                                                           | components n of n, all within tolerance, total dispensed (kg), elapsed, operator, write-back (409 while incomplete)                                                                                                                                  |
| `POST /api/tickets`                                                                           | `{batchId}`: stores the weighing ticket of a completed batch and prints it (201); asking again returns the stored one (200); printer refusal is 503/502 with `details.ticketId` (ticket kept as FAILED); 422 while incomplete                        |
| `GET /api/tickets/:ticketId`                                                                  | ticket with content, print status, attempts, last error and preview                                                                                                                                                                                  |
| `GET /api/tickets/:ticketId/preview`                                                          | the printed lines and the Code 128 barcode as SVG                                                                                                                                                                                                    |
| `POST /api/tickets/:ticketId/print`                                                           | prints a stored ticket again (retry; not a reprint); a PRINTED ticket is returned unchanged                                                                                                                                                          |
| `POST /api/tickets/:ticketId/reprint`                                                         | extra copy of a PRINTED ticket marked REPRINT (201); audited `REPRINT`; needs a signed-in operator; 409 `TICKET_NOT_PRINTED` otherwise                                                                                                               |
| `GET /api/batches/:batchId/tickets`                                                           | the batch tickets, original first                                                                                                                                                                                                                    |
| `POST /api/sessions/:sessionId/quit`                                                          | abandon the unconfirmed weighing, write an ABANDON audit event, suspend the session; starting the batch again resumes it                                                                                                                             |
| `POST /api/sessions/:sessionId/complete`                                                      | complete the batch when every component is done (`BATCH_INCOMPLETE`); the last confirmation does it automatically                                                                                                                                    |
| `GET /api/sessions/:sessionId/records`                                                        | the immutable weighing records of the session                                                                                                                                                                                                        |
| `GET /api/sessions/:sessionId/audit`                                                          | immutable audit trail of the session                                                                                                                                                                                                                 |
| `GET /api/scales`                                                                             | scales with calibration and READY / OFFLINE / CAL_EXPIRED                                                                                                                                                                                            |
| `GET /api/scales/:scaleId/status`                                                             |                                                                                                                                                                                                                                                      |
| `GET /api/scales/:scaleId/weight`                                                             | net weight, `stable`, `connected`; 503 `SCALE_UNAVAILABLE`                                                                                                                                                                                           |
| `POST /api/scales/:scaleId/tare`                                                              | returns the applied tare                                                                                                                                                                                                                             |
| `GET /api/scanner/status`                                                                     | READY / OFFLINE                                                                                                                                                                                                                                      |
| `GET /api/scanner/scans?since=N`                                                              | classified scans after cursor N; poll again with the returned `cursor`                                                                                                                                                                               |
| `POST /api/scanner/manual`                                                                    | typed code, classified like a scan (works while the scanner is offline)                                                                                                                                                                              |
| `GET /api/printer/status`                                                                     | READY / OFFLINE / OUT_OF_PAPER                                                                                                                                                                                                                       |

Dummy external systems (training contracts, used only by WeighingMS adapters):

| System        | Method + path                                                             | Notes                                                                                                                          |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Dummy OrgaTEX | `GET /ext/orgatex/stations/:stationId/batches`                            |                                                                                                                                |
| Dummy OrgaTEX | `GET /ext/orgatex/batches/:batchId` · `/recipe`                           |                                                                                                                                |
| Dummy OrgaTEX | `GET /ext/orgatex/dyestuffs/:code/lots`                                   |                                                                                                                                |
| Dummy OrgaTEX | `GET /ext/orgatex/lots/:lotId`                                            |                                                                                                                                |
| Dummy OrgaTEX | `POST` / `GET /ext/orgatex/batches/:batchId/consumption`                  | POST needs an `Idempotency-Key` header                                                                                         |
| Dummy OrgaTEX | `PATCH /ext/orgatex/batches/:batchId/status`                              | `WEIGHING` / `WEIGHED`, forward only                                                                                           |
| Dummy Scale   | `GET /ext/scale/scales` · `/scales/:scaleId` · `/scales/:scaleId/reading` |                                                                                                                                |
| Dummy Scale   | `POST /ext/scale/scales/:scaleId/tare`                                    | optional body `{ containerWeight }`: places a fresh container first, unless the trainer put one on since the last tare (ADR-4) |
| Dummy Scanner | `GET /ext/scanner/status` · `/scans?since=N`                              | raw codes                                                                                                                      |
| Dummy Printer | `GET /ext/printer/status` · `POST` / `GET /ext/printer/jobs`              | printed jobs kept in memory                                                                                                    |

Training-only simulation controls (development/test only, never in production):

| Path                                                                                                           | Purpose                                 |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `POST /ext/orgatex/_sim/offline` · `online` · `reset`, `GET /ext/orgatex/_sim/state`                           | OrgaTEX outage; reset to seed           |
| `POST /ext/scale/_sim/:scaleId/weight` · `dispense` · `container` · `calibration` · `disconnect` · `reconnect` | set weights, pour, outages, calibration |
| `POST /ext/scale/_sim/reset`, `GET /ext/scale/_sim/state`                                                      | scales back to empty / inspect          |
| `POST /ext/scanner/_sim/scan` · `offline` · `online` · `reset`                                                 | inject scans; scanner outage            |
| `POST /ext/printer/_sim/state` · `reset`                                                                       | printer READY / OFFLINE / OUT_OF_PAPER  |

## Training accounts

| Badge      | Name               | Role                | Note                                                                          |
| ---------- | ------------------ | ------------------- | ----------------------------------------------------------------------------- |
| `BDG-0417` | R. Karim (Shift A) | Operator            | operator from the prototype                                                   |
| `BDG-0901` | Shift Supervisor A | Supervisor          | training role account; supervisor PIN **2580** (stored only as a scrypt hash) |
| `BDG-0999` | Inactive Badge     | Operator (inactive) | demonstrates a refused sign-in                                                |

The station weighs one batch at a time (ADR-3): a started batch must be finished (or quit, once
available) before another batch can be started.

## Resetting the training data

Reset the Dummy systems with `curl -X POST http://127.0.0.1:3000/ext/orgatex/_sim/reset` and
`curl -X POST http://127.0.0.1:3000/ext/scale/_sim/reset`. To reset WeighingMS' own data
(operators, sessions, audit), stop the server and delete `data/weighingms.db*`; to reset everything,
delete `data/*.db*`.

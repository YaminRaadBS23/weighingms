# API Conventions

## Overview

API design conventions and response formats for the WeighingMS API and the training-time Dummy APIs (OrgaTEX, Scale, Scanner, Printer). These are **training contracts**; they make no claim about the real OrgaTEX, scale, scanner or printer interfaces, which remain unresolved (brief A-01, A-04, A-05, A-10).

## API Style

**REST over JSON**, organised as two layers (facade pattern):

| Layer | Prefix | Called by | Purpose |
|-------|--------|-----------|---------|
| WeighingMS API | `/api/...` | The station UI (only) | The application's API. Uses the workbook's paths (e.g. `GET /api/batches`, `GET /api/scales/:scaleId/weight`, `POST /api/tickets`) |
| Dummy external systems | `/ext/orgatex/...`, `/ext/scale/...`, `/ext/scanner/...`, `/ext/printer/...` | WeighingMS adapters (only) | Stand-ins for the real external systems |

Request flow: **UI → WeighingMS API → adapter → Dummy system**.

- The UI never calls `/ext/...` directly.
- Each `/api/...` endpoint that represents external data delegates to the relevant adapter interface; replacing a dummy with a real integration changes only the adapter.
- Resources use plural nouns and kebab-case: `/api/batches/:batchId/recipe`.
- Actions that are not resource CRUD are `POST` to a verb sub-path: `POST /api/scales/:scaleId/tare`.
- Path IDs use the domain identifiers (e.g. `B-24187`, `scale-3kg`).

### Minimum endpoints (from the workbook; extended during Inception)

| WeighingMS API | Delegates to |
|----------------|--------------|
| `GET /api/batches` | OrgaTEX adapter |
| `GET /api/batches/:batchId` | OrgaTEX adapter |
| `GET /api/batches/:batchId/recipe` | OrgaTEX adapter |
| `POST /api/batches/:batchId/consumption` | OrgaTEX adapter |
| `GET /api/scales` | Scale adapter |
| `GET /api/scales/:scaleId/status` | Scale adapter |
| `GET /api/scales/:scaleId/weight` | Scale adapter |
| `POST /api/scales/:scaleId/tare` | Scale adapter |
| `POST /api/tickets` | Printer adapter |

### Training-only simulation controls

Each dummy system exposes control endpoints under `/ext/{system}/_sim/...` (e.g. set scale weight, disconnect a scale, take OrgaTEX offline, put the printer out of paper).

- Used only by tests (Vitest, Playwright), demos, and an optional clearly-labelled training control panel.
- Never called by WeighingMS application code or by the UI's normal workflow.
- Exact endpoints are defined in the dummy-integration stories/bolts.

## API Versioning

**No version prefix** in the training product. The brief's illustrative `/api/v1/...` shape is an unconfirmed assumption (A-01) and is not reproduced. If versioning becomes necessary, a `/api/v2` prefix will be introduced via an ADR.

## Response Format

- **JSON field casing:** camelCase (`batchId`, `targetQty`). Database snake_case is mapped at the server boundary.
- **Single resource:** returned as the object itself.
- **Collection:** `{ "items": [ ... ] }`.
- **Create:** `201 Created` with the created resource. Actions return `200` with the resulting state.
- **Quantities:** always `{ "value": "94.0", "unit": "g" }` — `value` is a decimal **string**, `unit` is `g` | `kg` (brief NFR-16; see `coding-standards.md`).
- **Timestamps:** ISO 8601 UTC strings (`2026-10-15T11:27:05Z`).
- **Enums:** UPPER_SNAKE string values matching the brief's data model where one exists (e.g. batch status `RELEASED`, record result `IN_TOLERANCE`).
- **Content type:** `application/json; charset=utf-8`.

## Error Response Format

All endpoints (WeighingMS and Dummy) use:

```json
{
  "error": {
    "code": "SCALE_UNAVAILABLE",
    "message": "Scale scale-3kg is not responding",
    "details": {}
  }
}
```

| HTTP status | Use |
|-------------|-----|
| 400 | Malformed request / validation failure |
| 404 | Resource not found |
| 409 | State conflict (e.g. batch not released, component already confirmed) |
| 422 | Business rule violation (e.g. weight outside tolerance, batch incomplete) |
| 503 | Dependency unavailable (scale, OrgaTEX, printer) |
| 500 | Unexpected error (generic message; full detail only in server logs) |

`code` values are stable, UPPER_SNAKE, and defined alongside the domain errors (`coding-standards.md`). When a dummy system returns an error, the WeighingMS adapter translates it into a WeighingMS error code rather than leaking the dummy's payload.

## Idempotency

- `POST /api/batches/:batchId/consumption` requires an `Idempotency-Key` header (brief IR-08).
- A repeated request with the same key returns the original response without creating a second posting.
- The same key is forwarded by the OrgaTEX adapter to the Dummy OrgaTEX, which stores postings keyed by it.

## Pagination Strategy

**None.** All collections are small (station batch queue, five-component recipe, a handful of scales). Revisit via ADR if a history/reporting endpoint needs it.

## Contract Types

Request/response types are defined once in `src/shared/` and imported by both the Fastify routes and the UI API client. Runtime validation of request bodies uses Fastify JSON schemas derived from, or kept alongside, these types.

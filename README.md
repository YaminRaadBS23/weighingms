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
src/server/integrations/orgatex/ OrgatexPort, HTTP adapter, dummy/ (Dummy OrgaTEX)
src/web/                         station UI (React + Vite)
data/seed/                       training scenario seed (Dummy OrgaTEX)
data/*.db                        local SQLite files (git-ignored, recreated from seed)
```

## APIs (so far)

| API           | Path                                           | Notes             |
| ------------- | ---------------------------------------------- | ----------------- |
| WeighingMS    | `GET /api/health`                              |                   |
| Dummy OrgaTEX | `GET /ext/orgatex/stations/:stationId/batches` | training contract |
| Dummy OrgaTEX | `GET /ext/orgatex/batches/:batchId`            | training contract |
| Dummy OrgaTEX | `GET /ext/orgatex/batches/:batchId/recipe`     | training contract |
| Dummy OrgaTEX | `GET /ext/orgatex/dyestuffs/:code/lots`        | training contract |

Reset the training data by stopping the server and deleting `data/orgatex.db*`.

---
stage: implement
bolt: 001-orgatex-integration
created: 2026-10-15T12:43:30Z
---

## Implementation Walkthrough: orgatex-integration

### Summary

The repository is now a runnable TypeScript application. A Fastify app factory serves the WeighingMS API (`/api/health` so far) and the Dummy OrgaTEX training system (`/ext/orgatex`), which has its own SQLite database seeded with the prototype's scenario. WeighingMS reaches OrgaTEX only through `OrgatexPort`, implemented by an HTTP adapter that translates errors, enforces a 2-second timeout, logs every call and tracks link status. A minimal React shell proves the UI toolchain.

### Structure Overview

Three layers, matching `system-architecture.md`: `src/shared` (decimal quantities and error codes used by both server and UI), `src/server` (app factory, configuration, domain errors, routes, and `integrations/orgatex` with the port, the adapter and an isolated `dummy/` module that owns `orgatex.db`), and `src/web` (React shell with the HMI design tokens). The dummy module defines its own wire contract; the adapter maps that contract onto WeighingMS' port types, so nothing outside the adapter knows the dummy's format.

### Completed Work

- [x] `package.json` - Scripts (dev, start, build, test, typecheck, lint, format, db:generate) and pinned dependencies
- [x] `tsconfig.json` - Strict TypeScript settings for server, shared and web code
- [x] `eslint.config.js` - Flat ESLint config (typescript-eslint, react-hooks, no `any`, no `console`)
- [x] `.prettierrc.json`, `.prettierignore` - Formatting rules per coding-standards
- [x] `vite.config.ts` - UI root `src/web`, dev server on 127.0.0.1:5173 proxying `/api` and `/ext`
- [x] `vitest.config.ts` - Test discovery for co-located tests
- [x] `drizzle.config.ts` - Migration generation for the Dummy OrgaTEX schema
- [x] `README.md` - Install, run, test, layout and current APIs
- [x] `data/seed/orgatex-seed.json` - Training scenario: 5 dyestuffs, 6 lots (one training-only), recipe Teal 4C, 4 batches
- [x] `src/shared/quantity.ts` - Decimal quantity type with conversion, arithmetic, comparison and display precision
- [x] `src/shared/quantity.test.ts` - Decimal behaviour tests (written with the helper)
- [x] `src/shared/errors.ts` - Stable error codes and the standard error body type
- [x] `src/server/config.ts` - Environment-based configuration (host, port, station, data dir, OrgaTEX URL and timeout, simulation flag)
- [x] `src/server/errors.ts` - DomainError hierarchy with HTTP status mapping (not found, OrgaTEX unavailable/protocol)
- [x] `src/server/app.ts` - App factory: error and not-found handlers, Dummy OrgaTEX wiring, OrgatexPort decoration, `/api` routes, inject transport for tests
- [x] `src/server/main.ts` - Starts the server on 127.0.0.1 and closes it cleanly on signals
- [x] `src/server/routes/health.ts` - Health endpoint
- [x] `src/server/integrations/orgatex/orgatex-port.ts` - The port interface and WeighingMS' view of OrgaTEX data
- [x] `src/server/integrations/orgatex/http-orgatex-adapter.ts` - Port implementation over HTTP with timeout, error translation, logging and link status
- [x] `src/server/integrations/orgatex/dummy/contract.ts` - Wire format of the Dummy OrgaTEX training contract
- [x] `src/server/integrations/orgatex/dummy/schema.ts` - Dummy OrgaTEX tables (quantities as decimal text plus unit)
- [x] `src/server/integrations/orgatex/dummy/migrations/` - Generated initial migration
- [x] `src/server/integrations/orgatex/dummy/db.ts` - Opens the database and applies migrations
- [x] `src/server/integrations/orgatex/dummy/seed.ts` - Seed validation, full reload, and seed-if-empty on startup
- [x] `src/server/integrations/orgatex/dummy/routes.ts` - Read endpoints: ping, station batch queue, batch, recipe, lots
- [x] `src/web/index.html`, `src/web/main.tsx`, `src/web/App.tsx` - Placeholder React shell
- [x] `src/web/styles/tokens.css` - HMI design tokens from the prototype
- [x] `src/web/vite-env.d.ts` - Vite client typings (CSS imports)

### Key Decisions

- **Separate dummy wire contract from port types**: makes the anti-corruption layer explicit — swapping the dummy for the real OrgaTEX changes only the adapter.
- **Adapter enforces the timeout itself** (not only the transport): guarantees `ORGATEX_UNAVAILABLE` within 2 s whatever transport is used, including the test transport.
- **Port batch exposes `hasRecipe` rather than the recipe ID**: WeighingMS only needs to know whether a recipe exists; recipe identity stays OrgaTEX's concern.
- **Dummy OrgaTEX answers errors itself** (standard body, own codes) instead of throwing WeighingMS errors: it behaves like an independent external system.
- **Seed only when empty**: data survives restarts (needed later for resume and write-back evidence); a reset is a file delete now, and a `_sim/reset` control in bolt 002.
- **Single tsconfig** for server, shared and web: simpler; the Vite build and `tsx` handle their own targets.

### Deviations from Plan

- Added `dummy/contract.ts` (not in the plan's file list) to hold the dummy wire types separately from the port types.
- Added `src/web/vite-env.d.ts` for CSS module typing.
- One `tsconfig.json` instead of optional separate server/web configs.
- `quantity.test.ts` was written together with the helper in this stage; all other tests are written in Stage 3 as planned.

### Dependencies Added

- [x] `fastify` - HTTP server
- [x] `drizzle-orm`, `better-sqlite3` - SQLite access for Dummy OrgaTEX (native module loads on Node 24)
- [x] `decimal.js` - Exact quantity arithmetic
- [x] `react`, `react-dom` - UI shell
- [x] dev: `typescript` 6.0.3 (7.x unsupported by typescript-eslint), `tsx`, `vite`, `@vitejs/plugin-react`, `vitest`, `drizzle-kit`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `globals`, `prettier`, `concurrently`, `@types/*`

### Developer Notes

- Verified manually: server starts on 127.0.0.1:3000; health returns ok; the queue, recipe and lots match the prototype exactly; unknown batch, batch without recipe and unknown route return 404 in the standard error body; `vite build` succeeds. Typecheck, lint and format checks pass.
- `npm audit` reports 4 moderate findings, all through `drizzle-kit` (dev-only migration generator, via an old `esbuild` dev-server advisory). Not part of the runtime; left as is rather than forcing a breaking downgrade.
- Delete `data/orgatex.db*` to reset the training data until the `_sim/reset` control exists (bolt 002).

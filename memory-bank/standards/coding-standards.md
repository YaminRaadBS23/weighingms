# Coding Standards

## Overview

Code style and quality standards for WeighingMS. They apply to all AI-generated and human-written code. Prerequisites: `tech-stack.md` (TypeScript, React + Vite, Fastify) and `data-stack.md` (SQLite, Drizzle).

## Code Formatting

**Prettier** with project defaults, enforced via `npm run format` / `format:check`.

- 2-space indentation, semicolons, single quotes
- Print width 100
- Trailing commas everywhere valid (`all`)

Formatting is never debated in review; Prettier output is authoritative.

## Linting Rules

**ESLint** (flat config) with `typescript-eslint` recommended rules, plus `eslint-plugin-react-hooks`. TypeScript `strict: true`.

- `any` is forbidden; use `unknown` and narrow.
- Unused variables/imports are errors.
- No `console.log` in application code (use the logger on the server; see Logging).
- No commented-out code; no `TODO` without a story or bolt reference.
- Lint must pass before a bolt's Test stage is considered complete.

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Variables, functions | camelCase | `targetQty`, `evaluateTolerance` |
| Booleans | `is/has/can` prefix | `isInTolerance`, `canConfirm` |
| Types, interfaces | PascalCase, no `I` prefix | `WeighingRecord`, `ScaleReading` |
| Classes, error classes | PascalCase | `ToleranceViolationError` |
| Constants | UPPER_SNAKE | `SCALE_POLL_INTERVAL_MS` |
| React components | PascalCase | `BatchQueue`, `WeighPanel` |
| React hooks | `use` prefix | `useLiveWeight` |
| Event handlers | `handle…` (impl), `on…` (props) | `handleConfirm`, `onConfirm` |
| Component files | PascalCase `.tsx` | `WeighPanel.tsx` |
| Other files | kebab-case `.ts` | `tolerance-rules.ts` |
| API paths | kebab-case, plural nouns | `/api/batches/:batchId/recipe` |
| DB tables / columns | snake_case | `weighing_records.actual_qty` |

**Domain vocabulary** follows the Product Brief glossary (`docs/brief.md` §16): batch, recipe, component, dyestuff, lot, container, tare, scale, tolerance, surplus, override, compensation, ticket. Do not introduce synonyms (e.g. not "ingredient", "job", "order line").

## File & Folder Organization

Domain-modular backend, screen-based frontend, shared contracts. Indicative layout (finalised in the first construction bolt):

```text
src/
  shared/                     # API contract types, shared enums, decimal helpers
  server/
    app.ts                    # Fastify app factory (used by server and tests)
    modules/                  # WeighingMS domain modules (e.g. batches, weighing, tickets)
    integrations/
      orgatex/                # adapter interface + dummy/ implementation + routes
      scale/
      scanner/
      printer/
    db/                       # Drizzle schemas, migrations, seed
  web/
    screens/
      select-batch/
      weigh/
      confirm-print/
    shared/                   # shared components, hooks, API client
tests/
  e2e/                        # Playwright specs
data/                         # SQLite files (git-ignored) and seed JSON (versioned)
```

- Unit tests are co-located: `tolerance-rules.test.ts` beside `tolerance-rules.ts`.
- Types live with their module; only cross-boundary contract types go in `src/shared/`.
- No barrel `index.ts` files except at a module's public boundary.
- The web layer talks to the server **only** through the typed API client; it never imports server code.

## Testing Strategy

| Level | Tool | Location | Scope |
|-------|------|----------|-------|
| Unit | Vitest | co-located `*.test.ts` | Domain rules, decimal arithmetic, React components where logic warrants |
| API / contract | Vitest + `fastify.inject` | co-located or `src/server/**/*.test.ts` | Every WeighingMS and Dummy API endpoint: success and error responses |
| End-to-end | Playwright | `tests/e2e/` | Full workflow (workbook Step 29) and failure scenarios (Step 30) |

**Must be tested (critical paths):**

- Tolerance evaluation, including boundary values (e.g. target 94.0 g ±0.5 g: 93.4 ✗, 93.5 ✓, 94.0 ✓, 94.5 ✓, 94.6 ✗).
- Scale selection rule (3 kg precision vs 32 kg floor).
- Overshoot handling per the approved overshoot decision (workbook Step 24).
- Component progression and batch-completion guard (cannot complete with incomplete components).
- Confirmation record contents (actual, operator, component, lot, container, tare, scale, timestamp).
- OrgaTEX consumption write-back, including idempotency.
- Ticket generation content.
- Failure behaviour: scale, OrgaTEX and printer unavailable; re-tare; quit.

**Conventions:**

- Behaviour-focused names: `it('blocks confirmation when weight is below tolerance')`.
- Arrange-Act-Assert structure.
- Mock only at integration boundaries (adapter interfaces); never mock domain logic.
- Test data comes from the seed scenario or small factories; no hidden shared state between tests (each API test builds a fresh app with fresh in-memory/temporary databases).
- No coverage-percentage gate; the critical-path list above is the bar. All tests must pass before a bolt completes.

## Decimal Arithmetic

**`decimal.js`** for all quantity arithmetic (brief NFR-16).

- Quantities are represented as `string` in API payloads and the database, and as `Decimal` in calculations.
- The `number` type is never used for weights, targets, tolerances, tares or surplus.
- Every quantity carries an explicit unit (`g` | `kg`); conversions go through one shared helper.
- Display precision is a presentation concern decided per scale resolution, never by rounding stored values.

## Error Handling Patterns

- **Domain errors** are custom classes extending a common `DomainError` with a stable `code`, e.g. `TOLERANCE_VIOLATION`, `SCALE_UNAVAILABLE`, `ORGATEX_UNAVAILABLE`, `PRINTER_UNAVAILABLE`, `BATCH_NOT_RELEASED`, `BATCH_INCOMPLETE`.
- **API error response** shape (all endpoints, including Dummy APIs):

  ```json
  { "error": { "code": "SCALE_UNAVAILABLE", "message": "Scale scale-3kg is not responding", "details": {} } }
  ```

  with an appropriate HTTP status (400 validation, 404 not found, 409 state conflict, 422 rule violation, 503 dependency unavailable).
- A central Fastify error handler maps `DomainError` → HTTP response; unexpected errors return 500 with a generic message and are logged in full.
- Async code uses `async/await` with `try/catch` at boundaries; no unhandled promise rejections.
- **UI**: every dependency failure leads to a defined, visible, safe state (e.g. confirmation disabled while the scale is unavailable). The UI never crashes, never proceeds silently, and never loses a confirmed weighing.

## Logging Standards

- Server: Fastify's built-in **pino** structured JSON logging.
- Levels: `error` (failures needing attention), `warn` (recoverable/degraded, e.g. retry), `info` (business events: batch selected, component confirmed, consumption posted, ticket printed), `debug` (development detail).
- Integration calls and failures log target system, operation, batch/component IDs and outcome — enough to diagnose without access to the other system (brief IR-09).
- Never log secrets or supervisor PINs.
- Frontend: no routine logging; unexpected errors only.

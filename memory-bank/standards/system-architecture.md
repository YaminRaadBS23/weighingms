# System Architecture

## Overview

High-level architectural decisions and patterns for WeighingMS. Builds on `tech-stack.md`, `data-stack.md` and `api-conventions.md`. Boundaries with external actors and systems are detailed in the System Context produced during Inception.

## Architecture Style

**Modular monolith with ports & adapters (hexagonal).** One Node.js process hosts:

```text
 Station UI (React SPA)
        │  HTTP  /api/...
        ▼
 ┌─────────────────────────── WeighingMS (Fastify) ───────────────────────────┐
 │  API routes (facade)                                                       │
 │        │                                                                   │
 │  Domain modules: batches · weighing · tickets · operators · audit          │
 │        │ depend only on ports                                              │
 │  Ports:  OrgatexPort   ScalePort   ScannerPort   PrinterPort                │
 │        │                                                                   │
 │  Adapters: dummy-orgatex  dummy-scale  dummy-scanner  dummy-printer        │
 └────────┼───────────────────────────────────────────────────────────────────┘
          │  HTTP  /ext/...
          ▼
 Dummy external systems (same process, isolated modules, own data)
   Dummy OrgaTEX (orgatex.db) · Dummy Scale · Dummy Scanner · Dummy Printer
```

- Domain modules never import adapters or dummy-system code; they receive port implementations by injection (composition in the Fastify app factory).
- Dummy systems are isolated modules with their own routes and data; they are reachable only over their `/ext/...` HTTP API, as a real external system would be.
- Replacing a dummy with a real integration = writing a new adapter for the same port. No change to UI, routes or domain modules.

## API Design

As defined in `api-conventions.md`: REST/JSON, facade under `/api/...`, dummy systems under `/ext/...`, training-only controls under `/ext/{system}/_sim/...`.

## Business Rule Placement

**The server is authoritative.**

- Core weighing rules are **pure, side-effect-free functions in `src/shared/domain/`**: tolerance evaluation, scale selection, overshoot/surplus handling (per the approved overshoot decision), component progression, batch-completion guard, unit conversion.
- The UI imports them for **immediate feedback** (e.g. enable/disable the OK key, colour the tolerance bar).
- On every state-changing request (confirm, complete batch, override) the server **re-evaluates** the rules using its **own fresh scale reading** and current session state. A client cannot confirm an out-of-tolerance weight by sending a crafted request (brief AC-04).
- All rule functions use `decimal.js` (`coding-standards.md`).

## Live Weight Transport

**Polling** at **100 ms (10 Hz)** while the Weigh screen is active:

- `GET /api/scales/:scaleId/weight` → `{ weight: { value, unit }, stable: boolean, connected: boolean, at: timestamp }`.
- Satisfies brief IR-10 (≥10 readings/s) and NFR-01 (≤200 ms display lag on localhost).
- **Disconnection (brief IR-13):** if no successful reading for **2 s**, or `connected: false`, the UI shows the scale as unavailable and confirmation is disabled; the server also rejects confirmation with `503 SCALE_UNAVAILABLE`.
- Polling stops when leaving the Weigh screen; at most one request in flight per scale.
- A change to Server-Sent Events or WebSockets requires an ADR.

## Dummy Device Behaviour

- **Scale:** the Dummy Scale holds the simulated gross weight and tare **server-side**, per scale (`scale-3kg` precision, `scale-32kg` floor). The UI only reads it. Training Panel / tests change it via `/ext/scale/_sim` (set weight, ramp/dispense, disconnect/reconnect, stability). Tare is executed by the Dummy Scale on `POST /api/scales/:scaleId/tare`.
- **Scanner:** simulated scans are injected via `/ext/scanner/_sim` and delivered to the UI through the WeighingMS API (exact mechanism defined in the scanner story/bolt). Keyboard-wedge style manual entry is also accepted.
- **Printer:** the Dummy Printer stores rendered tickets and returns a printable preview; it can be put into failure states via `/ext/printer/_sim`.
- **OrgaTEX:** can be set unavailable via `/ext/orgatex/_sim` to exercise failure behaviour.

## State Management

**Frontend**

- React state plus **one explicit, unit-tested workflow state machine (reducer)** for the weighing flow: batch selection → recipe loaded → component active → (below / in tolerance / over) → confirmed → next component → batch complete → write-back → ticket.
- Server data is fetched through the typed API client; no global state library (no Redux).
- The UI state machine mirrors, but never overrides, server state.

**Server**

- Weighing sessions, confirmed weighing records, overrides and audit events are **persisted at the moment they occur** (synchronous SQLite transaction before responding).
- A page reload or restart **resumes the session at the component in progress** (brief NFR-06).

## Caching Strategy

**None by default.** Data is local and small. The OrgaTEX adapter may cache master data per brief DR-03 if a story requires it.

Offline operation with deferred synchronisation (brief A-03, FR-30–FR-33) is **not assumed** by this architecture; whether it is in scope for the training product is decided in Requirements. If included, it is implemented inside the OrgaTEX adapter boundary (sync queue), not in the UI.

## Security Patterns

Training-grade, proportionate to a local single-station deployment:

- Server binds to **`127.0.0.1`** only.
- Operator identification by badge ID against seeded operators (brief FR-34).
- Supervisor PINs stored **hashed**; verified server-side for override and manual scale reselection (brief FR-35, NFR-12). PINs are never logged.
- Every privileged action writes an immutable **audit event** with actor, reason and timestamp (brief FR-36, NFR-13).
- Input validated by Fastify JSON schemas on every endpoint.
- `/ext/*/_sim` endpoints are registered **only in development and test** configurations.
- Not production security: real authentication/directory integration remains an open question for FCI (brief A-09).

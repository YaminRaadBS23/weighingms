# Tech Stack

## Overview

WeighingMS is a full-stack TypeScript web application: a React single-page station UI served alongside a Node.js/Fastify backend that hosts the WeighingMS domain API and the training-time Dummy APIs (OrgaTEX, Scale, Scanner, Printer). The stack is chosen to reproduce the supplied prototype (`docs/customize-weighing-station.html`) as a working, locally demonstrable product, with each external system isolated behind a replaceable adapter.

## Languages

**TypeScript** (frontend and backend), running on Node.js 18+ (development machine: Node v24).

- One language end to end; API request/response types are shared between UI and backend so contract drift is caught at compile time.
- Strict typing reduces errors in the areas the brief identifies as safety-critical: quantities, units, tolerance bands and workflow states.
- Quantities must not use JavaScript floating point for arithmetic (brief NFR-16); the decimal library is fixed in `coding-standards.md`.

## Framework

**Frontend: React + Vite (SPA)**

- The station is a single-purpose kiosk UI; there is no SSR, SEO or multi-page routing need, so Next.js is unnecessary.
- React's component/state model maps directly onto the prototype's three views (1 · Select batch, 2 · Weigh, 3 · Confirm & print) and their states.
- The prototype's visual design (CSS variables, mono/sans typography) is reproduced; its JavaScript implementation is not copied.

**Backend: Node.js + Fastify**

- Lightweight, fast, and testable in-process (`fastify.inject`) without a running server.
- Hosts the WeighingMS application API and the Dummy APIs as separate route modules under `/api/...`.
- All OrgaTEX interaction goes through a single adapter interface (brief IR-07); the dummy implementation is one adapter, so a real integration would replace one component. The same pattern applies to scale, scanner and printer.

The UI must obtain all scenario data through the APIs; no batch/recipe data is hard-coded in UI components (workbook Rule 5).

## Authentication

**No external identity provider (training scope).**

- Operators identify at session start by badge ID, validated against seeded operator data (brief FR-34).
- Supervisor-only actions (override, manual scale reselection) require a supervisor PIN (brief FR-35); the authorising user is recorded.
- Not production-grade security; real SSO/directory integration is an unresolved question for FCI (brief A-09).

## Infrastructure & Deployment

**Local only.** A single Node.js process serves the API and the built UI on `localhost`; in development, Vite's dev server proxies `/api` to the backend.

- No cloud deployment is in scope for the training lab.
- Commands (exact scripts fixed during construction): `npm run dev` for development, `npm test` for unit/API tests, Playwright for end-to-end tests.

## Package Manager

**npm** (v11, already installed). Single package at the repository root unless construction shows a workspace split is needed.

## Decision Relationships

- TypeScript on both sides enables shared contract types between React and Fastify.
- Fastify's in-process injection plus Vite's `/api` proxy keep the UI decoupled from server internals: the UI only knows HTTP contracts.
- The adapter pattern for external systems is what makes the Dummy APIs "real development artifacts" (workbook Rule 5): replacing Dummy OrgaTEX with a real adapter must not require UI changes.
- Data persistence (database, client) is defined in `data-stack.md`; testing, decimals and code style in `coding-standards.md`.

---
stage: implement
bolt: 007-assisted-weighing-station-ui
created: 2026-10-16T12:48:22Z
---

## Implementation Walkthrough: assisted-weighing-station-ui — shell, sign-in, Select batch (bolt 7)

### Summary

The station UI now exists as a working React application on the real WeighingMS API. It shows the prototype's dark terminal frame with a top bar and a live status strip, lets the operator sign in by scanned or typed badge, shows the batch queue from OrgaTEX, and starts a weighing session when a released batch is touched, scanned or typed. After a session starts, an interim screen shows the session's recipe until the real Weigh screen arrives in bolt 011. A reload returns the station to where it was.

### Structure Overview

The UI lives in `src/web`: a typed API client (`services`), an English message catalogue (`i18n`), the shell (frame, top bar, status strip), shared hooks and the scan/typed-entry field, and one folder per screen. The App decides what to show from what the API says (operator? session in progress?) and keeps no scenario data. On the server, one small endpoint exposes the OrgaTEX link state for the status strip.

### Completed Work

- [x] `src/web/App.tsx` - Restores the station from the API on load; chooses sign-in, Select batch or the interim Weigh screen; handles sign-out
- [x] `src/web/services/api-client.ts` - Typed `fetch` client over the shared contract types; API errors carry their stable code
- [x] `src/web/i18n/messages.ts` - English catalogue for every operator-facing string, prototype wording kept
- [x] `src/web/shell/Shell.tsx`, `TopBar.tsx`, `StatusStrip.tsx` (+ CSS modules) - HMI frame, brand/crumb/operator chip with Sign out, status strip refreshed every 2 s with text for every state
- [x] `src/web/shared/ScanEntry.tsx`, `useScanFeed.ts`, `usePolling.ts`, `format.ts` - Scanner feed and typed entry sharing one path; non-overlapping polling; time and quantity formatting
- [x] `src/web/screens/sign-in/` - Sign-in by badge
- [x] `src/web/screens/select-batch/` - Scan prompt, queue table, not-released reasons, OrgaTEX-unavailable message with Retry, and the Step 19 call sequence on selection
- [x] `src/web/screens/weigh/WeighPlaceholder.tsx` - Interim display of the session's recipe snapshot (replaced in bolt 011)
- [x] `src/server/modules/orgatex-status/routes.ts` - `GET /api/orgatex/status` for "ORGATEX · LINKED hh:mm"
- [x] `src/server/integrations/orgatex/orgatex-port.ts`, `http-orgatex-adapter.ts` - `ping()` refreshes the link status without ever throwing
- [x] `src/shared/peripherals.ts` - `OrgatexStatusResponse`
- [x] `src/server/modules/peripherals/routes.test.ts` - A test that built the app without an in-memory WeighingMS database now gives it one (it was creating a stray `data/weighingms.db` on every run)
- [x] `package.json`, `package-lock.json` - Component-test libraries (dev only)

### Key Decisions

- **The UI never talks to `/ext`**: only `/api`, as the standards require.
- **Session restore from the API, not browser storage**: the server holds the operator and the session, so a reload (or another browser) shows the same station state.
- **Selection is three visible requests** (batch, recipe, start session) so the Network tab shows the Step 19 sequence.
- **Scans made before a screen opens are ignored**: the first poll only sets the cursor, so an old scan cannot trigger an action.
- **State is set in callbacks, not synchronously in effects** (required by the project's React lint rules).

### Deviations from Plan

- **`src/web/api/` renamed to `src/web/services/`.** Found only by checking the running UI in a real browser: the dev server proxies every path starting with `/api` to the backend, so the browser's request for `/api/client.ts` was answered by the API with a 404 and the page stayed blank. The production build and the unit tests could not have caught this. The folder name is now independent of the proxy prefix.
- The `api` client file is now `services/api-client.ts`.
- Component tests are written in Stage 3 as planned.

### Dependencies Added

- [x] `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event` (dev only) - component tests in a browser-like environment

### Developer Notes

- Verified in Chrome (second connected browser) against `npm run dev` with scratch data: blank page found and fixed (above); sign-in by typed `bdg-0417` → operator chip "Operator R. Karim · Shift A"; Select batch shows the four batches with the prototype columns, "Queue received from OrgaTEX at hh:mm", QUEUED rows dimmed; touching B-24190 shows "Batch B-24190: Not released by OrgaTEX"; touching B-24187 produces `GET /api/batches/B-24187` → `GET /api/batches/B-24187/recipe` → `POST /api/sessions` (201) and shows the five components with component 1 ACTIVE; a reload restores the session; the status strip shows both scales, scanner, printer and `ORGATEX · LINKED hh:mm`.
- Not exercised visually (session in progress blocks the queue until Quit exists in bolt 010): the OrgaTEX-unavailable message with Retry, scanner-driven selection, and an unknown-badge error. These are covered by the Stage 3 component tests.
- Typecheck, lint, format and `vite build` pass; all 253 existing tests pass.

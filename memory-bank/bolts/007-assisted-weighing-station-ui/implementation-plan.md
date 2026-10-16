---
stage: plan
bolt: 007-assisted-weighing-station-ui
created: 2026-10-16T09:11:17Z
---

## Implementation Plan: assisted-weighing-station-ui — shell, sign-in, Select batch (bolt 7 of 17)

### Objective

Build the first working screens of the station UI against the real WeighingMS API, reproducing the prototype's HMI frame and **1 · Select batch** view (workbook **Step 19**): the dark terminal frame with top bar and live status strip, operator sign-in by badge, and the batch queue from `GET /api/batches`, where selecting B-24187 calls `GET /api/batches/B-24187`, `GET /api/batches/B-24187/recipe` and starts the weighing session. No scenario data lives in the UI.

### Stories and requirements implemented

| Story | Requirements | What it delivers |
|-------|--------------|------------------|
| `001-app-shell-top-bar-and-status-strip` | FR-32, NFR-13, ux-guide | HMI frame, top bar (brand, crumb, operator chip), live status strip, English message catalogue |
| `002-sign-in-screen` | FR-1 (presentation) | Sign-in by scanned or typed badge; other screens inaccessible until signed in |
| `003-select-batch-screen` | FR-2, FR-3, FR-4, FR-36 (presentation); workbook Step 19 | Scan prompt, queue table, selection by touch/scan/typing, not-released reason, OrgaTEX-unavailable message + Retry |

Out of scope: the Weigh screen itself (bolt 011) — after a session starts, this bolt shows a clearly marked **interim Weigh placeholder** (batch, recipe shade, five components, "Weighing screen arrives in bolt 011"); write-back pending count (bolt 014); Training Panel (bolt 016).

---

### 1. What will change

**UI (src/web):**
1. **API client** (`api/client.ts`): typed `fetch` wrapper over the shared contract types; error bodies become an `ApiError` carrying the error `code`.
2. **Message catalogue** (`i18n/messages.ts` + `t()`): every operator-facing string in one English catalogue (NFR-13); prototype wording kept ("Scan a batch card to begin", "Or touch a row below. Queue received from OrgaTEX at hh:mm.", column headers, tags).
3. **App shell** (`app/App.tsx`, `shell/`): HMI frame; on load reads the current operator and the current session; chooses Sign-in, Select batch, or the interim Weigh placeholder (a reload resumes where the station was).
4. **Top bar**: "WeighingMS · STATION 01", crumb "BATCH B-24187 · ORDER SO-9931 · MACHINE JET-04" when a session is active, operator chip "Operator R. Karim · Shift A" with a small **Sign out** action (not in the prototype; needed to change operator — recorded as a UI addition).
5. **Status strip**: polls every 2 s — SCALE 3 kg / SCALE 32 kg (READY / OFFLINE / CAL EXPIRED), SCANNER (READY / OFFLINE), PRINTER (READY / OFFLINE / OUT OF PAPER), ORGATEX (LINKED hh:mm / OFFLINE), EN, live clock. Coloured dot plus text for every state.
6. **Scan input** (`shared/useScanFeed.ts` + typed entry field): polls `/api/scanner/scans?since=cursor` (~300 ms) while a screen accepts scans; typed entry posts to `/api/scanner/manual`; both arrive as the same classified `ScanEvent`.
7. **Sign-in screen**: "Scan your badge to sign in" + typed field; BADGE scans sign in; errors shown ("Badge not recognised or operator inactive").
8. **Select batch screen**: scan prompt with animated beam; queue table with the prototype columns; status tags (RELEASED / WEIGHING highlighted / QUEUED / WEIGHED); non-selectable rows dimmed, touching them shows the reason; a BATCH scan or typed ID selects; selection runs `GET /api/batches/:id` → `GET /api/batches/:id/recipe` → `POST /api/sessions`; `SESSION_IN_PROGRESS` and other errors shown in place; OrgaTEX unreachable → "OrgaTEX not reachable" + **Retry** instead of the table.
9. **Styles**: CSS Modules per component using the `--hmi-*` tokens (ux-guide); dark terminal in every theme; touch targets ≥ 56 px rows, keys ≥ 62 × 150 px; tabular mono for codes.

**Server (small addition):**
10. `GET /api/orgatex/status` → `{ state: ONLINE | OFFLINE, lastContactAt }` for the strip's "ORGATEX · LINKED hh:mm". Implemented with a new `OrgatexPort.ping()` (calls the existing `/ext/orgatex/ping`, 2 s timeout) so the link time stays fresh.

### 2. Files to be created / modified

```text
src/web/
  main.tsx, App.tsx                         (modified: real app)
  api/client.ts                             typed API client + ApiError
  i18n/messages.ts                          English catalogue + t()
  shell/Shell.tsx, TopBar.tsx, StatusStrip.tsx (+ .module.css)
  shared/useScanFeed.ts, ScanEntry.tsx, usePolling.ts, format.ts
  screens/sign-in/SignInScreen.tsx (+ .module.css)
  screens/select-batch/SelectBatchScreen.tsx, BatchQueueTable.tsx (+ .module.css)
  screens/weigh/WeighPlaceholder.tsx        interim, replaced in bolt 011
  styles/tokens.css                         (modified: base typography)
  **/*.test.tsx                             component tests
src/server/integrations/orgatex/orgatex-port.ts, http-orgatex-adapter.ts   + ping()
src/server/modules/orgatex-status/routes.ts (+ test)                        GET /api/orgatex/status
src/shared/peripherals.ts                                                    + OrgatexStatusResponse
vitest.config.ts, package.json                                               jsdom + Testing Library (dev)
```

### 3. APIs involved

Consumed (all existing unless noted): `GET /api/operators/current`, `POST /api/operators/sign-in`, `POST /api/operators/sign-out`, `GET /api/sessions/current`, `GET /api/batches`, `GET /api/batches/:id`, `GET /api/batches/:id/recipe`, `POST /api/sessions`, `GET /api/scales`, `GET /api/scanner/status`, `GET /api/printer/status`, `GET /api/scanner/scans?since=`, `POST /api/scanner/manual`, **new** `GET /api/orgatex/status`. The UI never calls `/ext/*`.

### 4. Dependencies (dev only)

`jsdom`, `@testing-library/react`, `@testing-library/user-event` — component tests in a browser-like environment. No runtime dependency added.

### 5. Technical approach

- **No global state library**: a small `useReducer` at the App level holds screen + operator + session; data fetched through the client. The full weighing state machine arrives with the Weigh screen (bolt 011).
- **Polling hooks** with cleanup on unmount; status strip 2 s, scan feed ~300 ms only while a scan-accepting screen is shown.
- **Network evidence (Step 19)**: selection is three sequential requests so the Network tab shows `/api/batches/B-24187` then `/api/batches/B-24187/recipe` then `POST /api/sessions`.
- **No scenario data in UI code**: enforced by a test that scans `src/web` for batch IDs, order numbers and dyestuff codes.
- **Accessibility**: native buttons/inputs, visible focus, `aria-live` for status messages, text with every coloured state.

### 6. How this will be tested

| Level | Tests |
|-------|-------|
| Component (Vitest + Testing Library, mocked `fetch`) | Shell: sign-in shown when no operator; Select batch when signed in; resume to Weigh placeholder when a session is current. Top bar: brand, crumb, operator chip. Status strip: READY / OFFLINE / CAL EXPIRED / OUT OF PAPER texts; ORGATEX LINKED hh:mm; clock. Sign-in: typed and scanned badge; unknown badge error. Select batch: queue rendered from the API with prototype columns and received time; selecting B-24187 issues the three requests in order; QUEUED row shows the reason; OrgaTEX unavailable → message + Retry → table after retry; `SESSION_IN_PROGRESS` shown |
| Source check | `src/web` contains no scenario data (B-2418x, SO-99xx, DYE-/AUX- codes, recipe values) |
| Server | `/api/orgatex/status` ONLINE with time; OFFLINE when Dummy OrgaTEX is offline; port `ping()` |
| Regression | all 253 existing tests; typecheck, lint, format; `vite build` |
| Manual / visual | `npm run dev`, browser: compare frame, top bar, strip and Select batch view with `docs/customize-weighing-station.html`; Network tab shows the Step 19 calls; sign-in by typed badge; simulated scans via `/ext/scanner/_sim/scan`; OrgaTEX offline/online |

### Acceptance Criteria (bolt level)

- [ ] Dark HMI frame with "WeighingMS STATION 01", crumb and operator chip, prototype tokens
- [ ] Status strip shows both scales, scanner, printer, ORGATEX · LINKED hh:mm, EN and a live clock; changes visible within 2 s; text with every non-ready state
- [ ] All UI strings come from the English catalogue
- [ ] Without an operator only sign-in is reachable; a typed or scanned badge signs in and opens Select batch; unknown badge shows an error
- [ ] Queue from `GET /api/batches` with prototype columns and "Queue received from OrgaTEX at hh:mm"
- [ ] Touch or scan of B-24187 → `GET /api/batches/B-24187` → `GET /api/batches/B-24187/recipe` → session started → Weigh (interim placeholder)
- [ ] QUEUED batch visibly not selectable, reason on touch; OrgaTEX unreachable → message + Retry
- [ ] No batch data in UI source; all tests, typecheck, lint, format and build pass

### Notes

- **UI additions not in the prototype** (recorded for the Step 28 UI comparison): sign-in screen, Sign out action, typed-entry fields, the interim Weigh placeholder.
- The write-back pending count in the ORGATEX status item appears with bolt 014.

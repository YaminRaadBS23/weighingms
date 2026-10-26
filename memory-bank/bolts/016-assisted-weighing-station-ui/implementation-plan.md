---
stage: plan
bolt: 016-assisted-weighing-station-ui
created: 2026-10-26T14:00:00Z
---

## Implementation Plan: assisted-weighing-station-ui — Confirm & print screen and Training Panel (bolt 16 of 17)

### Objective

Build the last operator screen, **3 · Confirm & print**, and the separate **Training Panel** (workbook **Step 26 UI**, **Step 27 ticket on screen**, preparing **Step 28**). The screen shows the completion summary, the OrgaTEX write-back state with Retry, the ticket preview with Print ticket (F1), printer failure with Retry, Reprint, and Next batch (F3). The Training Panel is a separate page that drives every `_sim` control so a trainer can demonstrate each scenario without touching code. The UI shows and requests; the server decides (ADR-5, ADR-10, ADR-11). All the APIs already exist (bolts 014 and 015).

### Stories and requirements implemented

| Story | Requirements | What it delivers |
|-------|--------------|------------------|
| `011-confirm-and-print-screen` | FR-26, FR-27, FR-28, FR-29, FR-30, FR-31, FR-35 (presentation) | "Batch B-24187 weighed" with Components weighed, All within tolerance, Total dispensed, Elapsed, Operator, "Written to OrgaTEX CONFIRMED hh:mm:ss" (or PENDING + Retry); Print ticket F1 with a ticket preview and barcode; printer error + Retry; Reprint; Next batch F3 |
| `012-training-panel` | DB-7, DB-6 | `/training` page with every simulation control; nothing of it on the operator screens |

Out of scope: Playwright end-to-end suite (bolt 017), Step 28 comparison document, automatic background retry (TD-1), a stored-ticket archive, changing label size or printer language (Q18), a `/training` entry in the operator's navigation (the trainer types the address).

---

### 1. What will change

**A. Confirm & print screen (`src/web/screens/done/`, replaces the interim `BatchWeighedNotice`)**

1. **On opening** (session COMPLETED): `GET /api/batches/:id/summary`, then `POST /api/batches/:id/consumption` once (idempotent, ADR-10; the server keeps the key) and `GET /api/batches/:id/tickets` (a ticket may exist after a reload). The write-back result is shown as soon as it arrives; the summary does not wait for it.
2. **Summary panel** (prototype `.summary`): Components weighed `5 of 5`, All within tolerance `YES` (green) / `NO`, Total dispensed `35.322 kg`, Elapsed `6 min 41 s`, Operator, and **Written to OrgaTEX** `CONFIRMED hh:mm:ss` (green) or `PENDING` (amber) with the reason (OrgaTEX unreachable, …) and a **Retry** key (`POST …/write-back/retry`, needs the signed-in operator, which this screen always has). A retry updates the row; no automatic retry. Attempts are shown small ("attempt 3").
3. **Ticket panel** (prototype `.ticket`): before Print the panel says the ticket is created when Print ticket (F1) is pressed. After F1 (`POST /api/tickets`, 201 or 200) it shows the **server's stored lines in monospace** (`content.lines`, exactly what is printed), the **Code 128 SVG** from the preview and the batch id under it, a status line ("Printed hh:mm" / "Not printed — printer OFFLINE"), and, for reprints, the REPRINT line that is already inside the lines.
4. **Printer failure** (503 `PRINTER_UNAVAILABLE`, 502): the ticket is shown anyway (the error carries `details.ticketId`; the UI loads it with `GET /api/tickets/:id`), the message reads "Printer offline — ticket kept. Fix the printer and press Retry" (or "out of paper"), and **Retry** calls `POST /api/tickets/:id/print` (same ticket, not a reprint). F1 does the same as the visible primary key: Print when there is no ticket, Retry when it failed.
5. **Reprint**: shown once the ticket is PRINTED (`POST /api/tickets/:id/reprint`); the new REPRINT ticket replaces the preview and a line "Copies printed: n" counts reprints. A reprint failing on the printer behaves like point 4 for the copy.
6. **Next batch (F3)**: leaves the screen (`onLeave`), so Select batch re-fetches the queue (B-24187 shows WEIGHED once OrgaTEX has the write-back; while the write-back is PENDING the batch is still WEIGHING there — see D-1). If the write-back is PENDING when F3 is pressed the screen asks for no confirmation (the pending count in the status strip keeps it visible, point 7).
7. **Status strip** gains a small **"WRITE-BACK n PENDING"** item (amber) from `GET /api/write-backs/pending-count`, hidden at 0. This is the pending count promised in bolt 014; it is the only reminder an operator has after pressing Next batch.
8. **Keys**: `F1` Print ticket / Retry print, `F3` Next batch (window `keydown` handler as the Weigh screen, `preventDefault`, ignored while a request is in flight). Each large key shows its F-key label.
9. **Strings** in `i18n/messages.ts` (NFR-13): summary labels, write-back states and errors by code (`ORGATEX_UNAVAILABLE`, `ORGATEX_PROTOCOL_ERROR`, `CONSUMPTION_REJECTED`, `IDEMPOTENCY_CONFLICT`, …), printer states, ticket statuses, keys.

**B. Training Panel (`src/web/training/`, page `/training`)**

1. **Entry**: `main.tsx` renders `TrainingPanel` when `location.pathname` is `/training`, otherwise `App`. No router library. Nothing in the operator UI links to it or imports it.
2. **Availability ("dev mode")**: the panel probes `GET /ext/orgatex/_sim/state`; 200 → controls are shown, 404 → "Simulation is disabled on this server (production mode)" and no control is rendered. No server change.
3. **Controls** (each is one button/field posting to the `_sim` route; the result and any error are shown beside it):

| Control | Call |
|---------|------|
| Simulate dispense (lands exactly on the active component's target) | `POST /ext/scale/_sim/:scale/dispense {landing}` |
| Simulate overshoot (lands at target + 3 × tolerance, clearly OVER) | same, different landing |
| Set exact weight (scale, value, unit) | `POST /ext/scale/_sim/:scale/weight {net}` |
| Place container (scale, weight, unit) | `POST /ext/scale/_sim/:scale/container {weight}` |
| Disconnect / reconnect scale | `POST /ext/scale/_sim/:scale/disconnect` · `reconnect` |
| Expire / restore calibration | `POST /ext/scale/_sim/:scale/calibration {expired}` |
| Scanner offline / online | `POST /ext/scanner/_sim/offline` · `online` |
| Inject scan (free text) | `POST /ext/scanner/_sim/scan {code}` |
| Printer READY / OFFLINE / OUT OF PAPER | `POST /ext/printer/_sim/state {state}` |
| OrgaTEX offline / online | `POST /ext/orgatex/_sim/offline` · `online` |
| Reset scenario | `POST` `_sim/reset` of scales, scanner, printer and OrgaTEX (see D-3) |

   The scale list and the active component (scale, target, tolerance) come from the **normal API** (`GET /api/scales`, `GET /api/sessions/current`), so the panel needs no scenario data of its own. A state block (scales with reading, scanner, printer, OrgaTEX) refreshes every 2 s from `GET …/_sim/state` and the status API.
4. **Look**: distinct from the operator screens — `--page-*` tokens, a "TRAINING — not part of the station" banner, like the prototype's `.controls` bar but on its own page.

### 2. Files to be created / modified

```text
src/web/screens/done/ConfirmPrintScreen.tsx (+ .module.css)   screen, effects, keys                               (new)
src/web/screens/done/SummaryPanel.tsx                           summary rows, write-back row + Retry               (new)
src/web/screens/done/TicketPanel.tsx                            stored lines, SVG, status, Retry / Reprint         (new)
src/web/screens/done/done-model.ts (+ test)                     pure: elapsed text, hh:mm:ss, write-back row, ticket status text, key states (new)
src/web/screens/weigh/WeighScreen.tsx                           COMPLETED → ConfirmPrintScreen; BatchWeighedNotice removed (modified)
src/web/shell/StatusStrip.tsx (+ test)                          pending write-back item                           (modified)
src/web/services/api-client.ts                                  + summary, postConsumption, writeBack, retryWriteBack, pendingCount,
                                                                  createTicket, ticket, ticketsForBatch, printTicket, reprintTicket,
                                                                  and the _sim calls used only by the training panel (separate export) (modified)
src/web/i18n/messages.ts                                        + strings                                         (modified)
src/web/training/TrainingPanel.tsx (+ .module.css)              page                                              (new)
src/web/training/sim-client.ts                                  the only code that calls /ext/…/_sim             (new)
src/web/training/training-model.ts (+ test)                     pure: landing weights (decimal strings), control availability (new)
src/web/main.tsx                                                /training switch                                  (modified)
src/web/no-scenario-data.test.ts                                /ext rule narrowed to "operator UI never; training only _sim" (modified)
src/web/test/mock-api.ts                                        + summary, write-back, ticket, sim fixtures       (modified)
src/web/**/*.test.tsx                                           component tests per state                         (new)
server (D-1, D-4) — small:
src/server/modules/weighing/application/session-starter.ts      a COMPLETED batch resumes into its completed session instead of starting a new one (+ test)
src/server/modules/completion/domain/ticket-composer.ts         table header "COMPONENT" instead of "NAME" (+ tests, docs)
```

### 3. APIs involved

Consumed (all existing): `GET /api/batches/:id/summary`, `POST /api/batches/:id/consumption`, `GET /api/batches/:id/write-back`, `POST …/write-back/retry`, `GET /api/write-backs/pending-count`, `POST /api/tickets`, `GET /api/tickets/:id`, `GET /api/tickets/:id/preview`, `POST /api/tickets/:id/print`, `POST /api/tickets/:id/reprint`, `GET /api/batches/:id/tickets`, `GET /api/sessions/current`, `GET /api/scales`, `GET /api/batches` (queue on Next batch). The operator screens never call `/ext/*`; only `training/sim-client.ts` does, and only `_sim` paths (enforced by a source test).

### 4. Technical approach

- **Pure view-model first** (`done-model.ts`, `training-model.ts`): elapsed seconds → "6 min 41 s", `hh:mm:ss` of the OrgaTEX receipt time, write-back row (tone, text, Retry visible), ticket status text, key states (F1 label Print / Retry, Reprint visible, Next batch), overshoot/dispense landing weights by `decimal.js` strings. No React, no timers; tested at every boundary.
- **One request at a time**: Print, Retry, Reprint and Retry-write-back disable all keys while in flight, so a double click or a held F-key cannot send twice (the server is idempotent as well: ADR-10, ADR-11).
- **The preview is the stored ticket**: the screen renders `content.lines` and the server's SVG (`dangerouslySetInnerHTML` is **not** used for text; the SVG comes from our own server and is injected through an `<img src="data:image/svg+xml,…">` so no markup is executed in the page).
- **Failure is shown, not hidden**: the ticket FAILED state and the write-back PENDING state persist on screen until a retry succeeds; neither blocks the other (ADR-11 independence), and Next batch is always available.
- **Server stays authoritative**: no totals, verdicts or ticket text are computed in the UI; they are displayed as received.

### 5. Decisions to confirm (recommended option first)

| # | Question | Recommendation |
|---|----------|----------------|
| D-1 | **Found while planning:** a completed batch whose write-back is still PENDING stays WEIGHING in OrgaTEX, so Select batch shows it as selectable, and `startOrResume` would **start a second session** for it (it only looks for IN_PROGRESS/SUSPENDED sessions). That would give the batch two sessions and make the write-back and ticket ambiguous. | **Fix it in this bolt:** when the batch already has a COMPLETED session, `startOrResume` returns it (`resumed: true`), so the operator lands on Confirm & print and can Retry or print. A small server change with tests; the 910/1000 existing tests stay valid. Without it Next batch with a PENDING write-back is a trap. |
| D-2 | The prototype shows the ticket before Print. The server creates the ticket when Print is pressed (ADR-11: stored = printed attempt). | **Show the ticket only after F1** (placeholder text before). A pre-print preview would need a server endpoint that composes without storing, which the approved design does not have. Recorded as a deviation for Step 28. |
| D-3 | What does **Reset scenario** reset? | **Dummy devices and Dummy OrgaTEX only** (scales, scanner, printer, batch statuses, postings). WeighingMS's own sessions, records, write-backs, tickets and audit trail are immutable by design (ADR-1, ADR-10, ADR-11) and stay. The panel says so. To repeat the whole demo on a clean slate, restart with a fresh `DATA_DIR`, or use another released batch. |
| D-4 | The ticket's table header reads `NAME … UNIT`; the prototype reads `COMPONENT … TGT … ACT`. | **Change the header to `COMPONENT`** (9 characters, fits the 10-character name column); tests and docs updated. Existing tickets are stored as printed and are not affected. |
| D-5 | How does the Training Panel know it is allowed ("dev mode")? | **Probe the Dummy's `_sim/state`** (404 when simulation is disabled). No new server flag. |
| D-6 | Reload while on Confirm & print. | The session is no longer IN_PROGRESS, so the app opens on Select batch; choosing the batch again returns to Confirm & print (D-1), and the strip's pending count reminds the operator. |
| D-7 | Time zone of the times on screen. | Screen times (receipt time) are **station-local**, like the rest of the UI; the ticket text is **UTC** (open point O-4 with FCI). Both are labelled in the evidence; no change now. |

### 6. How this will be tested

| Level | Tests |
|-------|-------|
| View-model | elapsed text (seconds, minutes, hours), `hh:mm:ss`, write-back row for CONFIRMED / PENDING (+ error text by code) / never-sent, ticket status text for NOT_SENT / PRINTED / FAILED (OFFLINE, OUT_OF_PAPER), F1 meaning, Reprint visibility, landing weights for dispense and overshoot in g and kg (exact decimals) |
| Component — Confirm & print | summary rows with all six values; CONFIRMED shows hh:mm:ss; PENDING shows reason + Retry and Retry calls the endpoint once and updates the row; opening posts the consumption once; F1 → `POST /api/tickets` and the preview shows the server's lines and the barcode image; printer OFFLINE → error, ticket still shown, Retry → `POST …/print` → PRINTED; OUT_OF_PAPER wording; Reprint → new ticket with REPRINT line and copy count; F3 and the Next batch key leave; keys disabled while a request runs; write-back PENDING does not block printing and the printer failure does not block the write-back |
| Component — strip | pending item shows `n`, hidden at 0, amber |
| Component — Training Panel | every control calls the right `_sim` path with the right body; dispense/overshoot use the active component's scale and target; simulation disabled → notice and no control; errors from a `_sim` call shown; Reset calls four resets and states what stays |
| Source checks | existing no-scenario-data scan (the training page too, so inject-scan has no preset code); `/ext` appears only in `training/sim-client.ts` and only with `_sim`; the operator UI imports nothing from `training/` and has no `/training` link; no `dangerouslySetInnerHTML` |
| Server (D-1, D-4) | `startOrResume` of a COMPLETED batch returns that session with `resumed: true` and creates nothing; composer header |
| Regression | all 1000 tests; typecheck, lint, format, `vite build` |
| Real browser (`npm run dev`, scratch `DATA_DIR`, Chrome) | weigh B-24187 to the end through the UI; Confirm & print with CONFIRMED; OrgaTEX offline → PENDING → Retry; Print ticket; printer OFFLINE → error → Retry; Reprint; Next batch shows WEIGHED; Training Panel drives dispense, overshoot, disconnect and the outages while the Weigh screen reacts only through the normal APIs |

### Acceptance Criteria (bolt level)

- [ ] After the last confirmation the screen shows "Batch B-24187 weighed" with Components weighed, All within tolerance, Total dispensed, Elapsed, Operator and "Written to OrgaTEX CONFIRMED hh:mm:ss", taken from the API
- [ ] With the write-back PENDING the screen shows PENDING and Retry; Retry succeeds when OrgaTEX is back and never creates a second posting
- [ ] Print ticket (F1) creates and prints the ticket; the preview shows the server's stored lines with the Code 128 barcode; with the printer down the error and Retry are shown and the ticket is kept; Reprint gives a REPRINT-marked copy
- [ ] Next batch (F3) returns to Select batch, where B-24187 shows WEIGHED; a completed batch whose write-back is pending returns to Confirm & print, not to a second session
- [ ] The status strip shows the pending write-back count
- [ ] `/training` offers every control of the table; the operator screens contain none of them and never call `/ext`
- [ ] All strings come from the catalogue; all tests, typecheck, lint, format and `vite build` pass; both screens have been seen in a real browser

### Notes

- **Deviations from the prototype to record for Step 28**: the ticket appears after Print ticket (D-2); the Retry keys, the printer-error message, the Reprint key, the copy count and the strip's pending item are additions; the Training Panel is a separate page instead of the `.controls` bar.
- **Evidence this bolt prepares**: `STEP-26-ui.png` (Confirm & print with "Written to OrgaTEX CONFIRMED"), `STEP-27-ticket.png` (the ticket preview with barcode), and the screens for `STEP-28-ui-validation/screen-3-comparison.png`. I can capture them with Chrome from a scratch run if you want them; you take the final ones.

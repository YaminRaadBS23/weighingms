# Implementation Walkthrough — Bolt 016 (Confirm & print screen and Training Panel)

Implements the approved plan (decisions D-1..D-7 as recommended). The UI shows what the server says; no summary figure, verdict or ticket text is computed in the browser.

## What was built
| Area | Files |
|------|-------|
| API client | `services/api-client.ts`: summary, postConsumption, retryWriteBack, pendingCount, createTicket, ticketsForBatch, printTicket, reprintTicket |
| Confirm & print | `screens/done/`: `ConfirmPrintScreen.tsx` (effects, one request at a time, F1/F3), `SummaryPanel.tsx`, `TicketPanel.tsx` (stored lines in monospace + Code 128 as an `<img>` data URL), `done-model.ts` (pure texts, tones, key states), `ConfirmPrintScreen.module.css` (keys reuse the Weigh screen's); `WeighScreen.tsx` shows it when the session is COMPLETED; the interim `BatchWeighedNotice` is removed |
| Status strip | "WRITE-BACK n PENDING" (amber), hidden at 0 |
| Training Panel | `training/TrainingPanel.tsx` + `.module.css` (own light/dark page tokens), `sim-client.ts` (the only code that calls `/ext`, and only `_sim` routes), `training-model.ts` (active target, landing weights, weight parsing); `main.tsx` shows it at `/training`; availability probed through `GET /ext/orgatex/_sim/state` (D-5) |
| Strings | `i18n/messages.ts`: `done.*`, `strip.writeback*`, `training.*` |
| Server (D-1) | `SessionStarter.startOrResume`: a batch with a COMPLETED session resumes into it (`resumed: true`) instead of starting a second one |
| Server (D-4) | ticket table header `COMPONENT` (was `NAME`); model/design text updated |
| Tests touched | outdated "Batch weighed notice" test replaced; `mock-api.ts` gained completion fixtures and a default pending count; source-scan tests narrowed (see below) |

## Rules kept
- Opening the screen sends the consumption once; the server keeps the key (ADR-10). A pending write-back never blocks printing and a printer failure never blocks the write-back (ADR-11).
- Print/Retry/Reprint/Retry-write-back run one at a time; F1 = Print ticket, or Retry print for a ticket that did not print; F3 = Next batch.
- A refused print keeps the ticket on screen and says why (offline, out of paper, other) with Retry.
- Source scans: the operator UI never calls `/ext`; `training/sim-client.ts` is the only file that does, and only `_sim` routes; the operator UI does not import or link the Training Panel; no `dangerouslySetInnerHTML`; no scenario data in any UI source (the scan covers the training page too).

## Real run (scratch data, Chrome)
Four components weighed through the API; the browser opened on the last one. Dyestuff typed in the UI; **Training Panel** (second tab) "Simulate dispense" → the Weigh screen followed through its normal polling; F1 confirmed → **Confirm & print**: 5 of 5, YES, 35.320 kg, 54 s, R. Karim, **CONFIRMED 15:27:43**. F1 printed the ticket (server lines, `COMPONENT` header, barcode `B-24187`, "Printed 15:27"). Printer OFFLINE from the panel, Reprint → red message "The printer is offline. The ticket is kept…", the REPRINT ticket stays shown "Not printed", key reads **Retry print**. Printer READY, F1 → printed, "Copies printed: 1". F3 → Select batch, B-24187 shows **WEIGHED**.

## Notes
- Times: the receipt time on screen is station-local (15:27:43), the ticket's DATE is UTC (09:27 here) — open point O-4 with FCI (D-7).
- Reset scenario in the panel resets the Dummy devices and OrgaTEX only (D-3).
- The pending write-back path (OrgaTEX offline at completion, Retry) is covered by component tests in the Test stage; the Step 27 JSON evidence is regenerated there because the ticket header changed.
- Browser screenshots taken during this run: `/tmp/claude-chrome-screenshots-1lErvv/screenshot-1793006868300-0.jpg` (ticket printed) and `…-1793006874350-1.jpg` (printer offline, Retry).

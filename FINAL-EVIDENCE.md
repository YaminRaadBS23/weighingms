# WeighingMS: Final Evidence Matrix

Workbook Step 34. Intent `001-assisted-weighing-station`: 6 units, 17 bolts, 52 stories, all complete.
Training build: the scales, OrgaTEX, scanner and printer are dummy substitutes (requirements DB-1 to DB-7).

Verified on 2026-10-26: Vitest **1075 of 1075** pass (67 files). Playwright **16 of 16** pass
(`STEP-29-results.json`).

## Matrix

✓ = implemented and shown in that layer. — = not applicable to that layer.

| Requirement                              | UI  | API | Code | Test | Evidence                                                                                    | Result                                                                                     |
| ---------------------------------------- | --- | --- | ---- | ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Batch queue (FR-2, FR-4)                 | ✓   | ✓   | ✓    | ✓    | `STEP-17-api-response.json`, `STEP-18-api-tests.txt`, `STEP-29-e2e-video.mp4`               | PASS                                                                                       |
| Batch selection (FR-3, FR-5)             | ✓   | ✓   | ✓    | ✓    | `STEP-28-ui-validation/screen-1-comparison.png`, `STEP-29-e2e-video.mp4`                    | PASS                                                                                       |
| Recipe (FR-5, FR-6)                      | ✓   | ✓   | ✓    | ✓    | `STEP-17-dummy-data.json`, `STEP-28-ui-validation/screen-2-comparison.png`                  | PASS                                                                                       |
| Scale selection (FR-11, FR-12, FR-13)    | ✓   | ✓   | ✓    | ✓    | `STEP-19-test.txt`, `STEP-28-ui-validation/validation.md` (scale switching)                 | PASS. Calibration expiry (AC-14) is covered by component and server tests only.            |
| Live weight (FR-14, NFR-1)               | ✓   | ✓   | ✓    | ✓    | `STEP-19-network.txt`, `STEP-29-e2e-video.mp4`                                              | PASS                                                                                       |
| Tolerance (FR-16, FR-17, FR-18)          | ✓   | —   | ✓    | ✓    | `STEP-22-tolerance-tests.txt`, `STEP-30-failure-tests.md` (tolerance matrix 93.4 to 94.6 g) | PASS                                                                                       |
| Lot tracking (FR-8)                      | ✓   | ✓   | ✓    | ✓    | `STEP-25-transaction.json` (lot and container on the confirmed record)                      | PASS                                                                                       |
| Container/tare (FR-9, FR-10)             | ✓   | ✓   | ✓    | ✓    | `STEP-25-transaction.json` (lot and container on the confirmed record)                      | PASS                                                                                       |
| Component progression (FR-25, FR-26)     | ✓   | ✓   | ✓    | ✓    | `STEP-29-e2e-video.mp4`, `STEP-30-failure-tests.md` (incomplete batch)                      | PASS                                                                                       |
| Overshoot (FR-20, FR-21, FR-22)          | ✓   | ✓   | ✓    | ✓    | `STEP-24-overshoot-decision.md`, `STEP-24-overshoot-test.txt`, `STEP-30-failure-tests.md`   | PASS by escalation (TD-10, Option A). The real compensation rule is pending FCI (Q25/Q26). |
| OrgaTEX write-back (FR-27, FR-28, NFR-7) | ✓   | ✓   | ✓    | ✓    | `STEP-26-request.json`, `STEP-26-response.json`, `STEP-25-transaction.json`                 | PASS                                                                                       |
| Ticket (FR-29, FR-30)                    | ✓   | ✓   | ✓    | ✓    | `STEP-27-ticket.json`, `STEP-27-printer-api.json`, `STEP-27-ticket-test.txt`                | PASS. Layout is an assumption until FCI answers Q18.                                       |

## Where each requirement lives

| Requirement           | UI                                                 | API                                                                                     | Code                                                                                            | Tests                                                                                              |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Batch queue           | `src/web/screens/select-batch/BatchQueueTable.tsx` | `GET /api/batches`                                                                      | `src/server/modules/batches/batch-service.ts`, `src/shared/domain/batch-selection.ts`           | `batch-service.test.ts`, `routes.test.ts`, `batch-selection.test.ts`, `SelectBatchScreen.test.tsx` |
| Batch selection       | `SelectBatchScreen.tsx`                            | `POST /api/sessions`                                                                    | `modules/weighing/application/session-starter.ts`                                               | `modules/weighing/routes.test.ts`, `SelectBatchScreen.test.tsx`                                    |
| Recipe                | `RecipeRail.tsx`                                   | `GET /api/batches/:batchId/recipe`                                                      | `batch-service.ts`, `modules/weighing/domain/weighing-session.ts`                               | `batch-service.test.ts`, `WeighScreen.test.tsx`                                                    |
| Scale selection       | `WeighHeader.tsx`, `SupervisorDialog.tsx`          | `GET /api/scales`, `GET /api/scales/:scaleId`                                           | `src/shared/domain/scale-selection.ts`, `modules/weighing/application/component-preparation.ts` | `scale-selection.test.ts`, `modules/scales/routes.test.ts`, `preparation-routes.test.ts`           |
| Live weight           | `Readout.tsx`                                      | `GET /api/scales/:scaleId/weight`                                                       | `modules/weighing/application/component-measurement.ts`                                         | `scale-device.test.ts`, `WeighScreen.test.tsx`                                                     |
| Tolerance             | `ToleranceBar.tsx`                                 | enforced when a component is confirmed                                                  | `src/shared/domain/tolerance.ts`, `weigh-model.ts`                                              | `tolerance.test.ts`, `weigh-model.test.ts`, `component-confirmation.test.ts`                       |
| Lot tracking          | `ScanPrompt.tsx`                                   | `POST /api/materials/lots/validate`                                                     | `modules/materials/material-service.ts`                                                         | `material-service.test.ts`, `modules/materials/routes.test.ts`                                     |
| Container/tare        | `ScanPrompt.tsx`, action key Re-tare               | `POST /api/containers/validate`, `POST /api/scales/:scaleId/tare`                       | `modules/materials/container-repository.ts`, `component-retare.ts`                              | `container-repository.test.ts`, `WeighExceptions.test.tsx`                                         |
| Component progression | `RecipeRail.tsx`                                   | `POST /api/sessions/:sessionId/complete`                                                | `modules/weighing/application/component-confirmation.ts`, `component-activation.ts`             | `confirmation-routes.test.ts`, `e2e-full-flow.spec.ts`                                             |
| Overshoot             | `SurplusPanel.tsx`, `SupervisorDialog.tsx`         | `TOLERANCE_VIOLATION` on confirm, override route                                        | `component-override.ts`, `supervisor-authorisation.ts`                                          | `component-override.test.ts`, `override-routes.test.ts`, `failures-weighing.spec.ts`               |
| OrgaTEX write-back    | `ConfirmPrintScreen.tsx`, `StatusStrip.tsx`        | `POST /api/batches/:batchId/consumption`, `POST /api/batches/:batchId/write-back/retry` | `modules/completion/application/consumption-write-back.ts`, `domain/posting-builder.ts`         | `modules/completion/routes.test.ts`, `http-orgatex-adapter.test.ts`, `failures-batch.spec.ts`      |
| Ticket                | `TicketPanel.tsx`                                  | `GET /api/tickets/:ticketId/preview`, `POST /api/tickets/:ticketId/print`, `/reprint`   | `modules/completion/domain/ticket-composer.ts`, `application/ticket-service.ts`                 | `ticket-composer.test.ts`, `ticket-routes.test.ts`, `ConfirmPrintScreen.test.tsx`                  |

## Step 29 and Step 30 end-to-end runs

- `STEP-29-playwright-report/`, `STEP-29-results.json`, `STEP-29-e2e-video.mp4`
- `STEP-30-failure-tests.md`: 15 of 15 scenarios PASS (scale unavailable, OrgaTEX unavailable on load and at completion,
  printer offline, printer out of paper, over tolerance, under tolerance, invalid weight, Re-tare, Quit, incomplete batch,
  inactive operator, Training Panel, tolerance matrix, supervisor override).

## Acceptance criteria (brief section 15)

| AC                                                                  | Status                                                                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 Scan a released batch and see the recipe within 3 s           | Met in tests. The 3 s was not re-measured on a live run.                                                                          |
| AC-02 Correct scale picked without operator input                   | Met                                                                                                                               |
| AC-03 Live weight without perceptible lag                           | Met (10 Hz polling)                                                                                                               |
| AC-04 Confirmation impossible outside tolerance                     | Met                                                                                                                               |
| AC-05 Over-dose compensation or escalation                          | Met via escalation (TD-10). The real compensation rule is pending FCI (Q25/Q26).                                                  |
| AC-06 Override needs supervisor authentication and a reason         | Met                                                                                                                               |
| AC-07 Every weighing retrievable with its details                   | Met                                                                                                                               |
| AC-08 Consumption appears correctly in OrgaTEX                      | Met (one posting, idempotent)                                                                                                     |
| AC-09 Offline batch, then records reach OrgaTEX without duplication | Met by two scenarios: OrgaTEX down at completion and idempotent retry. There is no single test that weighs a whole batch offline. |
| AC-10 Ticket has FCI's agreed content                               | Layout implemented. Content pending FCI (Q18).                                                                                    |
| AC-11 New operator completes a batch unaided                        | Needs a human trial                                                                                                               |
| AC-12 No slower than the paper process                              | Unmeasurable without a baseline (brief)                                                                                           |
| AC-13 All text in the agreed language                               | Met (English, one catalogue)                                                                                                      |
| AC-14 Weighing blocked on an expired calibration                    | Met by component and server tests. No browser test.                                                                               |

## Known limits and open points

- **Open with FCI:** Q18 label layout, Q25/Q26 surplus compensation, four-eyes rule, time zone (O-4: the ticket date is UTC, screen times are
  station-local), permanent OrgaTEX refusal.
- **No PIN lock-out** after repeated wrong supervisor PINs.
- **F-1 (fixed):** opening Confirm & print posted the consumption twice in the dev build (React StrictMode). OrgaTEX always received exactly one
  posting (the server is idempotent). A guard in `ConfirmPrintScreen` now sends the request once per opening. It is covered by a StrictMode
  component test and a request count in the Playwright full flow and the OrgaTEX-down scenario.
- **Video format:** the recording is `STEP-29-e2e-video.mp4`, converted from Playwright's WebM (`STEP-29-e2e-video.webm`, kept as the source) with a static ffmpeg.
- **Not verified on a live run:** NFR-2 (3 s recipe time) and NFR-10 (touch-target sizes).

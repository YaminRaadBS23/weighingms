# Test Walkthrough — Bolt 016 (Confirm & print screen, Training Panel)

**Result:** 1074 tests pass (1004 before + 70 new). Typecheck, ESLint, Prettier and `vite build` clean.

## New tests
| File | Tests | Covers |
|------|-------|--------|
| `done/done-model.test.ts` (23) | `elapsedText` (8 cases), `writeBackRow` (confirmed, pending with reason and attempt, never sent, unknown, SENDING… hides Retry), `writeBackError` wording, `currentTicket`, `printedCopies` (not the original, not a failed copy), `printerFailureText` (offline, out of paper, other, protocol error, plain failure), `doneKeys` (Print, Retry for NOT_SENT and FAILED, Reprint after print, all keys off while busy), `svgDataUrl` never carries markup |
| `training/training-model.test.ts` (13) | `activeTarget` (scale, no scale, none), `landingWeight` (exact = target, overshoot = target + 3 × tolerance, tolerance converted exactly across units), `parseWeight` (accepts plain decimals, rejects 7 malformed inputs) |
| `done/ConfirmPrintScreen.test.tsx` (16) | Summary values; consumption sent once on opening; NO when overridden; **PENDING with reason, attempt and Retry → CONFIRMED**; Retry that fails stays pending; summary still shown when the first send is refused; load failure with Reload; no ticket until F1; Print shows the server's lines and the barcode as an image; existing ticket shown after reload without printing; **printer OFFLINE keeps the ticket, shows why, Retry reuses the same ticket**; stored FAILED ticket after reload; Reprint with refusal and copy count; **print works while the write-back is pending and a printer failure leaves the write-back alone**; F1 prints and F3 leaves; F1 twice sends one request; Next batch off while busy |
| `shell/StatusStrip.test.tsx` (+3) | No write-back item at 0; "WRITE-BACK · n PENDING"; no item when the count cannot be read |
| `training/TrainingPanel.test.tsx` (15) | Disabled simulation shows no control and sends no POST; unreachable server; state block from the normal APIs; no active component; dispense/overshoot aim at the active scale with exact and target + 3 × tolerance; no component → refused with no call; Set exact weight / Place container bodies and units; invalid weight refused with no call; other scale; disconnect, reconnect, expire and restore calibration; scanner, printer (3 states) and OrgaTEX routes; Scan only with a code; **Reset scenario calls the four `_sim` resets and no `/api` route**; failure shown in words |
| `no-scenario-data.test.ts`, `WeighScreen.test.tsx` (from the implementation) | Operator UI never calls `/ext`; only `sim-client.ts` does, and only `_sim` routes; Weigh opens Confirm & print for a COMPLETED session |

## Evidence regenerated
`STEP-27-ticket.json`, `STEP-27-printer-api.json` (fresh data folder; the table header now reads COMPONENT), `STEP-27-ticket-test.txt` (88 ticket tests) and the new `STEP-26-ui-test.txt` (106 UI tests, verbose).

## Not covered by automated tests
- `main.tsx` choosing the Training Panel for `/training`: one line, checked in the browser run.
- Real timing of the 2 s refresh and the layout against the prototype: browser run and Step 28.
- The full path with a real browser against a pending write-back is covered by component tests with a mocked API; the Playwright run (bolt 017) drives it end to end.

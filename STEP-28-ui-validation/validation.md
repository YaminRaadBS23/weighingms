# Step 28 — UI/UX validation against the prototype

Original: `docs/customize-weighing-station.html` (opened from disk). Implementation: the running
WeighingMS station UI on a fresh copy of the seed data. Both at 1280 × 800.

| File | Shows |
|------|-------|
| `screen-1-comparison.png` | 1 · Select batch |
| `screen-2-comparison.png` | 2 · Weigh, within tolerance and over tolerance, same component (Yellow RGB, 94.0 g ± 0.5 g, two components done) |
| `screen-3-comparison.png` | 3 · Confirm & print, on arrival and after Print ticket (F1) |
| `parts/` | the nine single screenshots behind them |

Regenerate: `npx playwright test -c playwright.validation.config.ts` (`playwright/validation/capture.spec.ts`).
The data on the right is the live run (real clock, real elapsed time, actuals equal to the targets);
the prototype's values are its own scripted ones (07:47, 6 min 41 s, 1241.5 g …). Differences in those
numbers are data, not design, and are not listed as deviations.

## Verdict
The three screens match the prototype in layout, structure, labels, units, colours and key
placement. Every difference is either an addition the prototype could not show (it is a mock-up with no
sign-in, devices or server) or a decision recorded in the construction documents. **No unplanned
deviation was found.**

## Comparison by area
| Area | Prototype | WeighingMS | Match |
|------|-----------|------------|-------|
| **States** | queue, weigh (locked / in tolerance / over), done | all of these, plus scale lost, scale back (re-tare), calibration expired, override dialog, quit dialog, printer failure, write-back pending | yes, extended |
| **Interactions** | touch rows, OK / Re-tare / Quit / Override, F1 F2 F3 F4 | same keys and F-keys; scan or type a code; Change scale; Reprint; Retry | yes, extended |
| **Data** | scripted B-24187 | B-24187 from Dummy OrgaTEX: 5 components, same targets, tolerances, scales, lots, containers | yes |
| **Labels** | "Scan a batch card to begin", "WITHIN TOLERANCE — PRESS OK TO CONFIRM", "OVER TOLERANCE — SURPLUS +2.4 g", "Batch B-24187 weighed", "Written to OrgaTEX" … | identical text (from `i18n/messages.ts`) | yes |
| **Units** | g to 1 decimal, kg to 3 | same (`formatValue`; exact decimal arithmetic) | yes |
| **Tolerance** | band ± 0.5 g, green inside, red outside | same band and zones; server decides on OK (ADR-7) | yes |
| **Scale switching** | "3 kg precision · automatic" badge | same badge; Change scale with supervisor PIN | yes, extended |
| **Component progression** | rail ✓ actual, next becomes active | same; "2 of 5 components weighed" | yes |
| **Completion** | goes to screen 3 after the 5th OK | same, automatic (ADR-8) | yes |
| **Ticket** | 32-column monospace ticket, Code 128 barcode, "Label content is invented." | same ticket from the server's stored lines, barcode drawn from the batch ID | yes (see D-3, D-5) |

## Deviations (all intended)
| # | Where | Prototype | WeighingMS | Why |
|---|-------|-----------|------------|-----|
| D-1 | Screen 1 | no sign-in; `WEIGHING` row dimmed | sign-in screen first (scan or type badge); type-a-code field; statuses come from OrgaTEX (RELEASED, WEIGHED …); Sign out | FR-1, FR-34; the prototype shows no authentication |
| D-2 | All screens | simulation buttons in a bar above the device | the Training Panel is a separate page `/training`; the operator UI has no simulation control | story 012 / DB-7: nothing training-only on the operator screen |
| D-3 | Screen 3 | ticket visible on arrival | ticket appears when Print ticket (F1) is pressed ("The ticket is created and printed when you press Print ticket (F1)") | bolt 016 D-2 / ADR-11: a ticket is stored and printed by the operator's action; it is not created speculatively |
| D-4 | Screen 3 | Print ticket, Next batch | after printing: "Ticket printed", **Reprint** (marked REPRINT, audited), "Printed hh:mm", "Copies printed: n"; on failure "Retry print" and the reason | FR-30, FR-35 |
| D-5 | Screen 3, ticket | column header NAME, operator "R. Karim", date 07:48 | header COMPONENT, operator "R. Karim (OP-0417)", rule lines, date in UTC | bolt 016 D-4; order of columns kept; UTC is open point O-4 with FCI |
| D-6 | Screen 3, write-back | always CONFIRMED | CONFIRMED or **PENDING** with the reason, attempt count and Retry | FR-28: OrgaTEX may be unreachable; weighing and printing never wait for it |
| D-7 | Status strip | static | live device states every 2 s; an amber "WRITE-BACK n PENDING" item while a completed batch waits for OrgaTEX | FR-32; bolt 014 |
| D-8 | Screen 2, over tolerance | surplus panel proposes recalculating the remaining components (24.000 → 24.624 kg …) | panel states the surplus and the three ways out: remove the excess, Re-tare, supervisor override | Q25/Q26 (surplus compensation) are open with FCI; Step 24 / TD-10 Option A. Recalculation is deliberately not built |
| D-9 | Screen 2, keys | OK, Re-tare, Quit, Supervisor override | adds **Change scale**, a reason line beside the keys when OK is off ("The weight is not within tolerance") | supervisor scale reselection (story 009); accessibility: a disabled key says why |
| D-10 | Screen 2 | top bar shows the crumb always | crumb shown once a batch is open; same text | no batch on screens before selection |

## Visual notes
- Colours, fonts, spacing and the dark device look are the prototype's tokens; the UI fills the browser window instead of sitting in a device frame.
- The ticket, summary table and key styles are the same components in look; the ticket in WeighingMS is rendered from the server's stored text lines, so what is on screen is what is printed.

## Open points that touch the UI (not defects)
- Label layout, size and printer language (Q18); time zone of the ticket date (O-4); surplus compensation (Q25/Q26); four-eyes rule for overrides. All are on the FCI question list.

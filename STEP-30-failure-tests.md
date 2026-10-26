# Step 30 — Failure scenarios

Generated from the Playwright run of 2026-10-26T12:02:12.542Z (`STEP-29-results.json`)
by `scripts/step30-table.ts`. *Actual* is what each test observed on the screen and in the
servers while it ran; *Pass* is the test's result. The tests are in `playwright/tests/`.

| Scenario | Expected | Actual | Pass |
|----------|----------|--------|------|
| OrgaTEX unavailable (on load) | Defined behaviour: "OrgaTEX not reachable" with Retry, no weighing session starts; Retry works once OrgaTEX is back | "OrgaTEX not reachable The batch queue cannot be loaded. Check the connection and retry. Retry"; no session started; after OrgaTEX came back the queue loaded | PASS |
| OrgaTEX unavailable (at completion) | Weighing completes and the ticket prints; write-back shows PENDING with Retry and a strip item; Retry after OrgaTEX returns gives CONFIRMED | PENDING: "OrgaTEX is not reachable. The result is kept and is sent when you press Retry. attempt 1 Retry"; ticket printed meanwhile; after Retry CONFIRMED and exactly one posting reached OrgaTEX | PASS |
| Printer unavailable | Ticket kept and shown, error says the printer is offline, write-back unaffected; Retry prints the same ticket (not a reprint); Reprint adds a marked copy | "The printer is offline. The ticket is kept: fix the printer and press Retry."; Retry printed the same ticket (1 ticket, 1 job); Reprint added a copy marked REPRINT (2 jobs) | PASS |
| Printer out of paper | The error says the printer is out of paper and the ticket is kept | "The printer is out of paper. The ticket is kept: fix the printer and press Retry." | PASS |
| Quit | Safe exit: confirmed components are kept, the unfinished one is not recorded, the batch can be resumed | quit confirmed; 2 confirmed records kept, none for the unfinished component; choosing B-24187 again resumed at "2 of 5 components weighed" | PASS |
| Incomplete batch | Cannot complete: no ticket (422 BATCH_INCOMPLETE), no write-back, no Confirm & print screen | ticket refused (HTTP 422 BATCH_INCOMPLETE); completion refused (HTTP 422); write-back refused (HTTP 422); nothing posted, nothing printed | PASS |
| Inactive operator | Refused with a message; nothing else is reachable | "Badge not recognised or operator inactive"; no operator is signed in | PASS |
| Training Panel | Simulate dispense in the panel brings the operator screen to its target (the disabled-simulation case is covered by the component tests) | Simulate dispense in /training brought the operator screen to "WITHIN TOLERANCE" | PASS |
| Tolerance matrix 93.4 – 94.6 g | OK enabled only from 93.5 g to 94.5 g inclusive | 93.4 g → OK disabled; 93.5 g → OK enabled; 94.0 g → OK enabled; 94.5 g → OK enabled; 94.6 g → OK disabled | PASS |
| Over tolerance | Cannot confirm; surplus shown; confirmed once back in tolerance | status line "OVER TOLERANCE — SURPLUS +3.0 g", OK disabled, server refused with TOLERANCE_VIOLATION | PASS |
| Under tolerance | Cannot confirm; the amount still to dispense is shown | status line "DISPENSE — 4.0 g REMAINING", OK disabled, server refused with TOLERANCE_VIOLATION | PASS |
| Invalid weight | No weight on the scale cannot be confirmed; a non-numeric weight is refused by the scale; a wrong dyestuff is refused | wrong dyestuff: "Wrong dyestuff"; empty scale: OK disabled and server refused (HTTP 422 TOLERANCE_VIOLATION); scale refused "abc" with HTTP 400 | PASS |
| Re-tare | Weight reset to zero after Re-tare | before Re-tare "50.0 g", after "0.0 g" | PASS |
| Scale unavailable | Safe failure: notice shown, OK and Override disabled, nothing can be confirmed; after reconnect a Re-tare is required | lost: "Scale unavailable — check the scale connection."; OK and Override disabled; server refused (HTTP 503); reconnected: "The scale is back — re-tare to continue."; after Re-tare the component confirmed | PASS |
| Supervisor override | Wrong PIN refused with nothing changed; correct badge, PIN and reason confirm the component as OVERRIDDEN | wrong PIN: "Badge or PIN not accepted for a supervisor"; correct PIN: component 3 recorded as OVERRIDDEN | PASS |

15 scenarios, 15 passed.


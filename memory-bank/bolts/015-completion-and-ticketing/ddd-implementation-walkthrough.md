# Implementation Walkthrough — Bolt 015 (Weighing ticket, printing, retry and reprint)

Implements the approved model, design and ADR-11. No new port; the existing `PrinterPort` (HTTP adapter and Dummy Printer from unit 002) is used.

## What was built
| Layer | Files |
|-------|-------|
| Shared | `src/shared/ticket.ts` (`TicketView`, `TicketContent`, `TicketPreview`, `PrintStatus`, request/list shapes); error codes `TICKET_NOT_FOUND`, `TICKET_NOT_PRINTED` |
| Weighing (D-1) | `RecipeSnapshot` gains optional `orderRef`, `machineRef`; `SessionStarter` copies them from the released batch (stored in the existing JSON snapshot, no migration) |
| Domain | `modules/completion/domain/`: `ticket.ts` (aggregate), `ticket-composer.ts` (pure: `compose`, `asReprint`, `layout`), `code128.ts` (pure: `encode`, `toSvg`), `ticket-errors.ts`, `TicketRepository` in `repositories.ts` |
| Application | `ticket-service.ts` (generate, print, reprint, get, forBatch, view, preview; per-batch lock; send) |
| Infrastructure | `drizzle-ticket-repository.ts` |
| Persistence | migration `0010_tickets.sql` (table, unique partial index `one_original_per_batch`), `0011_ticket_protection.sql` (no delete, content and identity fixed, PRINTED final, job and time required, start NOT_SENT, reprint needs a PRINTED source) |
| Presentation | `modules/completion/ticket-routes.ts`, wiring in `module.ts` (needs `printer`) and `app.ts`; README endpoint rows |

## Rules kept
- The ticket is stored (NOT_SENT) before the printer is called; the printer gets exactly the stored lines and the batch id as barcode.
- A refusal is saved as FAILED, then thrown as the port's own error (503 or 502) with `ticketId` and `printStatus` in `details`. Any other error is not swallowed.
- PRINTED is final; Print on a PRINTED ticket does nothing; a retry is the same ticket, not marked REPRINT.
- Reprint needs a signed-in operator and a PRINTED source; the new ticket and the `REPRINT` audit event are stored in one transaction; the copy's lines are the original's structured content plus the REPRINT marking.
- No OrgaTEX call anywhere in the ticket path.
- Code 128 set B written without a library: 107 patterns (all distinct, 11 modules, stop 13), check digit mod 103, SVG with quiet zones.

## Real run (scratch data, Dummy OrgaTEX and Dummy Printer)
B-24187 weighed to completion through the API, then:
1. `POST /api/tickets` → 201 PRINTED; ticket text: title, BATCH B-24187, ORDER SO-9931, MACHINE JET-04, SHADE Teal 4C, five rows (1240.0 g, 386.0 g, 94.0 g, 24.000 kg, 9.600 kg), "ALL WITHIN TOLERANCE"; preview with SVG barcode.
2. Reprint → 201 marked `*** REPRINT ***`, PRINTED.
3. Printer OFFLINE, reprint → **503** `PRINTER_UNAVAILABLE` with `state: OFFLINE`, `ticketId`, `printStatus: FAILED`; the ticket is listed FAILED (attempt 1, last error kept).
4. Printer READY, `POST …/print` on that ticket → PRINTED (attempt 2), still a reprint copy, not a new ticket.

## Checks
Typecheck, ESLint and Prettier clean; the 910 existing tests pass (the four write-back test setups gained an unused printer stub). New tests are written in the Test stage.

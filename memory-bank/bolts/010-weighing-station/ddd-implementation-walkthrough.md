---
stage: implement
bolt: 010-weighing-station
created: 2026-10-24T18:00:14Z
---

## Implementation Walkthrough: weighing-station — tolerance, confirmation, progression, re-tare, quit (bolt 10)

### Summary

The station can now judge and record a weighing. Confirming makes the server read the scale itself; if the reading is stable and inside the tolerance band it writes an immutable weighing record, marks the component done and activates the next one — and after the last component completes the batch. The operator can re-tare, or quit the batch and resume it later at the first component not yet done. Everything works with OrgaTEX offline.

### Structure Overview

The tolerance rules are pure functions in `src/shared`, so the server decides and the UI will display with the same code. The session aggregate gained confirm, complete, re-tare, suspend and resume. Three application services orchestrate the scale, the records and the audit log; the session starter now resumes suspended sessions. Records live in a new append-only table protected by database triggers.

### Completed Work

- [x] `src/shared/domain/tolerance.ts` - `toleranceBand`, `evaluateZone` (UNDER / NEAR / OK / OVER, inclusive limits, NEAR from 90 % of target), `isConfirmable`, `surplus` (the one place to change at Step 24)
- [x] `src/shared/errors.ts`, `domain/errors.ts` - `TOLERANCE_VIOLATION`, `READING_UNSTABLE`, `BATCH_INCOMPLETE`, `SESSION_COMPLETED`
- [x] `domain/weighing-record.ts`, `domain/repositories.ts` - immutable record with builder; `WeighingRecordRepository` (no update or delete)
- [x] `domain/weighing-session.ts` - `confirm`, `complete`, `retare`, `suspend`, `resume`; a completed session refuses everything with `SESSION_COMPLETED`
- [x] `application/component-confirmation.ts` - confirm (one fresh reading, decision order of the model, record + state in one transaction, next component's scale) and complete
- [x] `application/component-retare.ts`, `application/session-suspension.ts` - re-tare; quit with the ABANDON audit event in the same transaction (best-effort weight in the audit detail)
- [x] `application/session-starter.ts` - resumes a SUSPENDED session after the one-in-progress check, activating the lowest unfinished component
- [x] `db/weighingms/schema.ts`, `migrations/0004_weighing_records.sql`, `0005_weighing_record_immutability.sql`, `infrastructure/drizzle-repositories.ts` - `weighing_records` (decimal text, unique per session + component), triggers refusing UPDATE and DELETE
- [x] `module.ts`, `routes.ts`, `context.ts` - wiring; endpoints `confirm`, `retare`, `quit`, `complete`, `records`; `SessionView` gains `completedAt` and per-component `confirmed`
- [x] `src/shared/weighing.ts`, `src/web/test/mock-api.ts` - contract types; fixtures updated
- [x] `integrations/scale/dummy/scale-device.ts`, `contract.ts` - Dummy Scale container placement refined (ADR-4, second refinement)
- [x] `src/server/app.ts` - a request body that is not valid JSON now answers 400 instead of 500
- [x] `README.md` - new endpoints

### Key Decisions

- **ADR-7 and ADR-8** as approved: no weight in the request; automatic completion without any OrgaTEX call.
- **A refused confirmation writes nothing**: all checks (including the scale) happen before the single transaction.
- **The record stores the weight as the scale measured it**; target and limits are stored in the recipe's unit exactly (for example `1234` for a 1240.0 ±6.0 g component) — display formatting belongs to the UI.
- **Quit does not touch the scale or OrgaTEX**; its audit detail contains the sequence, the dyestuff, the weight at the moment if readable, and the number of components done.

### Deviations from Plan

1. **ADR-4 refined a second time.** The first refinement ("unless something was added since the last tare") still let the previous component's dispensed weight leak into the next tare when two components used the same scale (found in the manual walk: Yellow recorded a tare of 600.0 g instead of 214.0 g). The Dummy Scale now places a fresh container on every hinted tare and keeps the load only for a container the trainer deliberately put on (`_sim/container`). ADR-4 and the decision index were amended.
2. **Two migrations, not one**: `0004` creates the table and `0005` adds the triggers (a custom SQL migration, as `0001` did for audit events).
3. **Malformed JSON → 400**: a request with `content-type: application/json` and an invalid body used to answer 500; any 4xx raised by the framework is now reported as the client's error with the standard body. Outside the bolt's stories, found during the manual check.

### Dependencies Added

None.

### Developer Notes

- Typecheck, lint and format pass; all 505 existing tests pass, plus 3 new Dummy Scale device tests for the refined rule (508). The tests of this bolt come in Stage 5.
- Manual check against `npm start` with a scratch database: locked confirm → `IDENTITY_NOT_VERIFIED`; 0 g → `TOLERANCE_VIOLATION` (UNDER); 93.4 g → NEAR, 94.6 g → OVER, both refused with the limits 93.5 – 94.5; 93.5 and 94.5 accepted; unstable → `READING_UNSTABLE`; scale offline → `SCALE_UNAVAILABLE`; expired → `SCALE_CALIBRATION_EXPIRED`; double click → `COMPONENT_ALREADY_DONE`; re-tare at 50.0 g → 0.0 g; quit with Red unlocked → SUSPENDED, ABANDON audit event, nothing active; component action while suspended → `SESSION_NOT_IN_PROGRESS`; resume → Red active and locked; five components Blue → Red → Yellow → Sodium Sulphate → Soda Ash with tares 214.0 g, 214.0 g, 214.0 g, 1.850 kg, 1.850 kg; complete at 4 of 5 → `BATCH_INCOMPLETE`; last confirmation → COMPLETED and `/sessions/current` empty; every action afterwards → `SESSION_COMPLETED`; `GET …/records` returns five records.
- Known gap carried to bolt 012: any weight outside the OK zone is refused here; the override and the overshoot rule (Step 24) come there.

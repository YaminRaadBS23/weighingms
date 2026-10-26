---
stage: implement
bolt: 012-weighing-station
created: 2026-10-26T10:00:00Z
---

## Implementation Walkthrough: weighing-station — supervisor override and the Step 24 rule (bolt 12)

### Summary

A supervisor can now authorise recording a weight outside tolerance. The server measures the weight itself, checks the supervisor's badge and PIN before touching the scale, and stores an OVERRIDDEN record with the supervisor, reason, zone and — for an over weight only — the surplus from the target. A read-only evaluation endpoint reports what the station would decide about the weight on the scale. Nothing is recalculated: no other component changes because of an overshoot (TD-10).

### Structure Overview

The weighing module gained three application services and two endpoints. `ComponentMeasurement` holds the steps confirm, override and evaluation share (active, unlocked, scale usable, one fresh reading); confirm was refactored onto it with no change in behaviour. The record gained an optional `override`, stored as four nullable columns guarded by an insert trigger (ADR-9).

### Completed Work

- [x] `src/shared/domain/tolerance.ts` - `isOverridable(zone, weight)`
- [x] `src/shared/errors.ts`, `domain/errors.ts` - `REASON_REQUIRED` (400), `OVERRIDE_NOT_NEEDED` (409), `NOTHING_TO_OVERRIDE` (409)
- [x] `src/shared/weighing.ts` - `RecordResult` + OVERRIDDEN, `OverrideView`, `OverrideRequest`, `ComponentEvaluationResponse`, `WeighingRecordView.override`
- [x] `domain/weighing-record.ts` - `override`, `buildRecord(override?)` (OVERRIDDEN, zone, surplus only for OVER; refuses an override on an in-tolerance weight)
- [x] `src/server/db/weighingms/schema.ts`, `migrations/0006_override_columns.sql`, `0007_override_consistency.sql` - override columns and the consistency trigger
- [x] `infrastructure/drizzle-repositories.ts` - override mapping
- [x] `application/component-measurement.ts` - shared measuring steps; `component-confirmation.ts` uses it
- [x] `application/component-override.ts` - the override use case (one transaction: record, session, `OVERRIDE` audit)
- [x] `application/component-evaluation.ts` - read-only evaluation
- [x] `module.ts`, `routes.ts` - wiring, `POST …/override`, `GET …/evaluation`, record view
- [x] `README.md` - endpoints
- [x] Two existing tests updated for the new `override: null` field

### Key Decisions

- Authorisation happens **before** the scale is read, outside the session lock.
- A refused override writes nothing — no record, no audit event — and is logged by code only; the reason and PIN are never logged.
- Under, near and over weights can all be overridden if above zero (TD-15); an unstable reading cannot (O-3).
- ADR-9: override facts are on the immutable record.

### Deviations from Plan

None.

### Dependencies Added

None.

### Developer Notes

Typecheck, lint, format pass; all 697 existing tests pass (two assertions updated). Verified on a scratch database with the real Dummy Scale and the training supervisor BDG-0901: evaluation at 1000 / 1190 / 1240 / 1300 g gives UNDER / NEAR / OK / OVER (surplus +60 g, 4.8 % at 1300 g); locked component → `IDENTITY_NOT_VERIFIED`; blank reason → 400 `REASON_REQUIRED`; missing PIN → 400; operator badge or wrong PIN → 403; weight 0 → 409 `NOTHING_TO_OVERRIDE`; 1240 g → 409 `OVERRIDE_NOT_NEEDED`; unstable → 409; 1300 g with a reason → OVERRIDDEN record with supervisor, reason, zone OVER, surplus; the audit trail holds exactly one `OVERRIDE` event after all the refusals; the other components' targets and tolerances were unchanged; an under-weight override (300 g on Red) is OVERRIDDEN with no surplus. New tests come in Stage 5.

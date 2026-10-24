---
stage: implement
bolt: 009-weighing-station
created: 2026-10-24T12:43:04Z
---

## Implementation Walkthrough: weighing-station — component preparation (bolt 9)

### Summary

The station can now prepare the active component for weighing. Activating a component picks its scale automatically (smallest usable scale that can carry target + tolerance + container tare). Scanning the dyestuff verifies it, settles the default lot and container, tares the scale with the container in place and unlocks weighing. A supervisor can choose another scale with badge + PIN, which writes an audit event. A scale whose calibration has expired or that is offline is never selected or used. The Weigh screen in bolt 011 builds on these endpoints.

### Structure Overview

The pure selection and calibration rules live in `src/shared`. The `WeighingSession` aggregate carries each active component's scale assignment and preparation. Two new application services orchestrate the scale, the material checks of bolt 008 and the audit log; activation and session start also assign the scale. The new data lives in extra nullable columns of `component_weighings`, so existing databases keep working.

### Completed Work

- [x] `src/shared/domain/scale-selection.ts` - Pure rule: `scaleRequirement`, `fitsCapacity` (inclusive), `isScaleUsable`, `selectScale` (smallest capacity, lowest ID on a tie), calibration/display state (moved here from the scales routes)
- [x] `src/shared/errors.ts`, `src/server/modules/weighing/domain/errors.ts` - `WRONG_DYESTUFF`, `COMPONENT_NOT_ACTIVE`, `IDENTITY_NOT_VERIFIED`, `NO_SUITABLE_SCALE`, `SCALE_CAPACITY_INSUFFICIENT`, `SCALE_CALIBRATION_EXPIRED`, `NOT_AUTHORISED`
- [x] `src/server/modules/weighing/domain/preparation.ts` - `ScaleAssignment`, `Preparation`, derived preparation state
- [x] `src/server/modules/weighing/domain/weighing-session.ts` - Aggregate operations `assignScale`, `verifyIdentity`, `setLot`, `setContainer`, `applyTare`, `reselect` via `assignScale`, guards `requireUnlocked` and `requireScaleUsable` (for bolt 010); deactivation discards preparation
- [x] `src/server/modules/weighing/application/component-preparation.ts` - Scale assignment, identity, lot, container, reselection, scale options; accepted calls report `preparation.issue` (ADR-5); container change and reselection are all-or-nothing
- [x] `src/server/modules/weighing/application/supervisor-authorisation.ts` - Badge + PIN; same `NOT_AUTHORISED` for every failure; PIN hashed work is always done
- [x] `src/server/modules/weighing/application/session-lock.ts` - Per-session serialisation (ADR-6)
- [x] `src/server/modules/weighing/application/component-activation.ts`, `session-starter.ts` - Assign the scale when a component becomes active (also component 1 at start); activation is now asynchronous
- [x] `src/server/modules/weighing/domain/repositories.ts`, `infrastructure/pin-hash.ts` - `PinVerifier` interface and scrypt implementation with a decoy hash
- [x] `src/server/db/weighingms/schema.ts`, `migrations/0003_component_preparation.sql`, `infrastructure/drizzle-repositories.ts` - Preparation columns, mapping, old active components load as "no scale / awaiting identity"
- [x] `src/server/modules/weighing/module.ts`, `routes.ts`, `context.ts`, `src/server/app.ts` - Wiring, `atomically()` for reselection + audit, endpoints `identity`, `lot`, `container`, `scale`, `scale-options`; `SessionView` gains per-component `scale`, `requirement`, `preparation`
- [x] `src/server/integrations/scale/` - `ScalePort.tare(scaleId, { containerTare })`, adapter sends `containerWeight`, Dummy Scale places the container (ADR-4)
- [x] `src/shared/weighing.ts`, `src/web/test/mock-api.ts`, `application.test.ts` - Contract types; existing fixtures updated for the new fields
- [x] `README.md` - New endpoints and tare body

### Key Decisions

- **ADR-4/5/6** as approved. ADR-4 was refined during this stage (see Deviations).
- **Accepted-but-locked is state**: identity is kept when the tare fails; `preparation.issue` says why. Reading a session later derives `LOT_REQUIRED`, `CONTAINER_REQUIRED`, `NO_SUITABLE_SCALE` or `TARE_PENDING`; the call that just ran reports the exact cause (for example `SCALE_UNAVAILABLE`).
- **Re-submitting the dyestuff retries** a pending unlock; submitting it again after unlocking changes nothing (no second tare).
- **Automatic assignment is re-checked when unlocking**: a scale that has since expired or gone offline is replaced if another one qualifies.

### Deviations from Plan

1. **ADR-4 refined**: the Dummy Scale places the container unless something was put on the platform since the last tare (it first said "only if the platform is empty"). Manual check: a drum left on the 32 kg scale made the next unlock tare the drum (1.850 kg) instead of a 214.0 g bucket. ADR-4 and the decision index were amended.
2. **Requirement columns**: `requirement_value/unit` were added to the persisted columns (not listed in the design) so the saved view can show the load without recomputing.
3. **Extra issue codes** on reads: `LOT_REQUIRED`, `CONTAINER_REQUIRED`, `TARE_PENDING` (the design named only the device causes).

### Dependencies Added

None.

### Developer Notes

- Typecheck, lint and format pass; the 356 existing tests pass unchanged except fixtures that needed the new fields. New tests come in Stage 5.
- Manual check against `npm start` with a scratch database: Blue/Red/Yellow select `scale-3kg`, Sodium Sulphate `scale-32kg`; Yellow + `dye-4471` → lot 2026-0387, C-12, tare 214.0 g, net 0.0 g; `DYE-2204` on Blue → 422 `WRONG_DYESTUFF`; second scan harmless; scanned lot 2026-0402 accepted, 2026-0341 → `LOT_MISMATCH`; C-13 → `CONTAINER_OUT_OF_SERVICE`; reselect with BDG-0417 → 403, with BDG-0901 / 2580 → MANUAL + one `SCALE_RESELECT` audit event, 3 kg for Sodium Sulphate → `SCALE_CAPACITY_INSUFFICIENT`; `scale-3kg` expired → Blue goes to `scale-32kg` (tare 0.214 kg); both scales offline → `NO_SUITABLE_SCALE` shown as an issue, identity kept, retry after reconnect unlocks; container change refused with nothing changed when no usable scale remains.
- Known gaps: no lock-out after repeated wrong PINs; an unlocked component whose scale later expires is detected at the next use (re-tare, confirm in bolt 010).

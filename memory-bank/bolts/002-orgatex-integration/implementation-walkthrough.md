---
stage: implement
bolt: 002-orgatex-integration
created: 2026-10-15T12:53:51Z
---

## Implementation Walkthrough: orgatex-integration (bolt 2)

### Summary

Dummy OrgaTEX now accepts actual-consumption postings exactly once per idempotency key, lists stored postings, and applies forward-only batch status updates. `OrgatexPort` exposes the matching write operations, and the adapter translates every OrgaTEX answer into WeighingMS domain errors. Training-only simulation controls can take Dummy OrgaTEX offline, bring it back, and reset it to the seed scenario; they exist only when simulation is enabled.

### Structure Overview

The write side lives entirely inside the Dummy OrgaTEX module: a posting/status service that owns idempotency and validation, a simulation module that owns the offline switch and the `_sim` routes, and the route plugin that exposes both. The plugin turns the service's rejections into standard error bodies, so the dummy still behaves as an independent external system. On the WeighingMS side the port gained two operations and the adapter's transport became method-agnostic; the app factory wires the simulation state into the dummy only when the configuration allows it.

### Completed Work

- [x] `src/server/integrations/orgatex/dummy/schema.ts` - Added consumption posting and consumption line tables (idempotency key unique, quantities as decimal text + unit)
- [x] `src/server/integrations/orgatex/dummy/migrations/0001_consumption.sql` - Generated migration for the new tables
- [x] `src/server/integrations/orgatex/dummy/contract.ts` - Added posting request, receipt, listing and status-update wire types
- [x] `src/server/integrations/orgatex/dummy/consumption.ts` - Idempotent posting (key + body hash in one transaction), line validation against recipe and lots, posting listing, forward-only status transitions
- [x] `src/server/integrations/orgatex/dummy/simulation.ts` - Offline switch (503 for business endpoints) and `_sim` offline / online / reset / state routes
- [x] `src/server/integrations/orgatex/dummy/routes.ts` - Added consumption POST/GET and status PATCH; registers simulation only when configured; maps rejections to standard error bodies
- [x] `src/server/integrations/orgatex/dummy/seed.ts` - Seed reload also clears received postings (needed for reset)
- [x] `src/server/integrations/orgatex/orgatex-port.ts` - Added consumption posting/receipt types, weighing status type, `postConsumption`, `setBatchStatus`
- [x] `src/server/integrations/orgatex/http-orgatex-adapter.ts` - Method-agnostic transport, the two new operations, translation of 404/409/422 answers to domain errors, unchanged timeout/logging/link-status behaviour
- [x] `src/server/errors.ts`, `src/shared/errors.ts` - New errors: batch not released, idempotency conflict, invalid status transition, consumption rejected
- [x] `src/server/app.ts` - Simulation state created per app and passed to the dummy only when simulation is enabled; inject transport supports all methods, headers and bodies
- [x] `src/server/integrations/orgatex/http-orgatex-adapter.test.ts` - Existing stub transports renamed to the new transport method (no new tests yet; Stage 3)
- [x] `README.md` - API table extended; reset instructions

### Key Decisions

- **Idempotency check before validation, in the same transaction as the insert**: a retry of an already-stored posting always returns the original receipt, even if the batch has since moved to WEIGHED; no window for double insertion.
- **Body hash over a canonical form** (lines sorted by sequence): a semantically identical retry is not a conflict.
- **Offline switch as a request hook inside the dummy plugin**: no WeighingMS code can observe or bypass it; WeighingMS only sees 503s through the adapter, exactly like a real outage.
- **Rejections as a dummy-local error type** mapped by the dummy's own error handler: keeps the dummy independent of WeighingMS error classes.
- **404 answers still logged as `not-found` (info)**, other 4xx as `rejected` (warn): keeps logs readable and existing log expectations stable.
- **RELEASED → WEIGHED allowed directly**: covers a WEIGHING update that never reached OrgaTEX during an outage.

### Deviations from Plan

None in scope. Two small implementation details beyond the plan text: a dummy-local rejection type (instead of ad-hoc replies) and keeping the `not-found` log outcome for 404s.

### Dependencies Added

None.

### Developer Notes

- Verified manually against `npm start`: two posts with the same key return the same posting ID and store one posting with five lines; same key with a changed body → 409 `IDEMPOTENCY_CONFLICT`; status RELEASED → WEIGHING → WEIGHED, then WEIGHING → 409; `_sim/offline` → 503 `ORGATEX_OFFLINE`; `_sim/reset` → online, no postings, B-24187 RELEASED again.
- Typecheck, lint, format pass; the 46 existing tests pass on the new transport.
- The posting body is a training contract (brief A-02 unresolved).

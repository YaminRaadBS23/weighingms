---
unit: 004-weighing-station
bolt: 010-weighing-station
stage: test
status: complete
updated: 2026-10-24T18:06:00Z
---

# Test Report - Weighing Station (bolt 10: tolerance, confirmation, progression, re-tare, quit)

## Test Summary

| Category | Passed | Failed | Skipped | Coverage |
|----------|--------|--------|---------|----------|
| Unit — pure tolerance rule (`tolerance.test.ts`) | 34 | 0 | 0 | not measured |
| Unit — aggregate: confirm, progression, complete, re-tare, suspend/resume, record builder (`weighing-session-confirmation.test.ts`) | 21 | 0 | 0 | not measured |
| Integration — application with fake scale and real `MaterialService` (`component-confirmation.test.ts`) | 44 | 0 | 0 | not measured |
| Persistence — records, triggers, unique key, new session states (`weighing-record-repository.test.ts`) | 10 | 0 | 0 | not measured |
| API — real Dummy Scale (ManualClock) and Dummy OrgaTEX, restart with real files (`confirmation-routes.test.ts`) | 36 | 0 | 0 | not measured |
| Dummy Scale — refined container placement (`scale-device.test.ts`, written in Stage 4) | 3 | 0 | 0 | not measured |
| **New in this bolt** | **148** | 0 | 0 | |
| Regression (bolts 001–009) | 505 | 0 | 0 | |
| **Total** | **653** | **0** | **0** | — |

Quality gates: `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run format:check` ✅. Full suite run three times in a row: 653/653 each time. No test created `data/weighingms.db`.

Coverage percentage is not measured — the project standard (`coding-standards.md`) uses a critical-path list instead of a coverage gate; every acceptance criterion and every aggregate invariant of this bolt below has a test.

Evidence files (repository root): `STEP-22-tolerance-tests.txt` (verbose test output for the boundary cases, pure rule and API), `STEP-25-transaction.json` (the real record of Yellow RGB confirmed at 94.2 g, from `npm start`).

## Acceptance Criteria Validation

| Story | Criteria | Status |
|-------|----------|--------|
| 008-tolerance-evaluation-rules | Yellow 94.0 ±0.5: 93.4 not confirmable; 93.5, 94.0, 94.5 OK; 94.6 OVER | ✅ pure rule and over HTTP (422 / 200) |
| 008-tolerance-evaluation-rules | 84.6 g (90 % of target) NEAR, 84.5 g UNDER | ✅ |
| 008-tolerance-evaluation-rules | Sodium Sulphate 24.000 ±0.120 kg: 23.879 not confirmable, 23.880 / 24.120 OK, 24.121 OVER | ✅ pure rule and over HTTP |
| 008-tolerance-evaluation-rules | 96.4 g → +2.4 g and +2.6 % | ✅ |
| 008-tolerance-evaluation-rules | Decimal arithmetic; 0 and negative → UNDER | ✅ (0.1 + 0.2 limit, mixed g/kg, zero, negative) |
| 009-confirm-weighing-in-tolerance | Yellow unlocked, stable 94.2 g → record with actual, target, limits, lot, container, tare, scale, operator, time, IN_TOLERANCE; component DONE | ✅ (application and API; `STEP-25-transaction.json`) |
| 009-confirm-weighing-in-tolerance | Scale reads 94.6 g, client claims 94.2 → 422 `TOLERANCE_VIOLATION`, nothing recorded | ✅ (three crafted bodies; the record of an in-tolerance weight holds the measured value, not the claim) |
| 009-confirm-weighing-in-tolerance | Unstable → 409 `READING_UNSTABLE`; disconnected → 503 `SCALE_UNAVAILABLE` | ✅ |
| 009-confirm-weighing-in-tolerance | Records immutable: no update/delete endpoint | ✅ (PUT / PATCH / DELETE answer 404/405) and the database triggers refuse UPDATE / DELETE |
| 009-confirm-weighing-in-tolerance | `GET /api/sessions/:id/records` | ✅ |
| 009-confirm-weighing-in-tolerance | Double click → 409 `COMPONENT_ALREADY_DONE` | ✅ (two simultaneous requests: one record) |
| 009-confirm-weighing-in-tolerance | Durable after restart (NFR-5) | ✅ (real database files, fresh app) |
| 004 (bolt 009 carry) | Not unlocked → confirm gives 409 `IDENTITY_NOT_VERIFIED` | ✅ over HTTP |
| 007 (bolt 009 carry) | Scale expired → confirm gives 422 `SCALE_CALIBRATION_EXPIRED` | ✅ over HTTP |
| 010-component-progression-and-batch-completion | Blue confirmed → Red ACTIVE; whole sequence Blue → Red → Yellow → Sodium Sulphate → Soda Ash | ✅ (scales and units switch; an invalid weight never completes a component) |
| 010-component-progression-and-batch-completion | 4 of 5 done → complete gives 422 `BATCH_INCOMPLETE` | ✅ |
| 010-component-progression-and-batch-completion | All 5 done → COMPLETED (automatically after the last confirmation); explicit complete is idempotent | ✅ |
| 010-component-progression-and-batch-completion | Completed session → component actions give 409 `SESSION_COMPLETED` | ✅ |
| 010-component-progression-and-batch-completion | OrgaTEX offline at completion → the session still completes | ✅ (whole batch weighed with OrgaTEX offline; no OrgaTEX call after the start) |
| 010-component-progression-and-batch-completion | OrgaTEX status WEIGHED | ➡️ moved to bolt 014 (ADR-8, approved); asserted here that completion makes no OrgaTEX call |
| 011-re-tare | Yellow at 50.0 g, re-tare → net 0.0 g | ✅ |
| 011-re-tare | Over state clears; new tare is the one recorded; no record written | ✅ |
| 011-re-tare | DONE component → 409; scale unavailable → 503 and state unchanged | ✅ |
| 012-quit-and-resume | Quit mid-batch: unconfirmed weighing abandoned, `ABANDON` audit event, SUSPENDED, batch stays WEIGHING | ✅ |
| 012-quit-and-resume | Select the batch again → Blue and Red DONE with records, Yellow ACTIVE (locked) | ✅ |
| 012-quit-and-resume | Reload mid-batch → `/sessions/current` returns the in-progress session | ✅ |
| 012-quit-and-resume | Quit with nothing weighed allowed; audit records no weight | ✅ |

### Model invariants (ddd-01) and decisions

| Item | Covered by |
|------|-----------|
| (16) confirm only when unlocked, scale usable, stable, zone OK; the server's reading decides | aggregate, application (decision order, reads once), API |
| (17) record + DONE + next ACTIVE + COMPLETED are one transaction | application (failed append and failed save roll back everything), API restart |
| (18) progression to the lowest pending component, also after out-of-order activation | aggregate, application, API |
| (19) complete needs all DONE; terminal; `SESSION_COMPLETED` | aggregate, application, API |
| (20) re-tare replaces the tare, writes no record, state unchanged on failure | aggregate, application, API |
| (21) quit suspends, audit in the same transaction, resume activates the lowest pending (O-3), ADR-3 check | aggregate, application, API |
| ADR-7 the server measures | one scale read per confirmation; no weight parameter; crafted bodies ignored |
| ADR-8 automatic completion without OrgaTEX | application and API |
| NFR-8 immutable records | triggers, unique key, no repository or HTTP method |
| ADR-4 (second refinement) fresh container on every hinted tare | device tests; five-component run records 214.0 g / 1.850 kg tares |

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| The previous component's dispensed weight leaked into the next tare when two components used the same scale (Yellow recorded 600.0 g instead of 214.0 g) — found by the manual walk in Stage 4 | Medium (wrong recorded tare in the demo) | **Fixed** in Stage 4 (ADR-4 refined); covered by device tests and the five-component API run |
| A request with an invalid JSON body answered 500 | Low | **Fixed** in Stage 4; covered by an API test |
| Three test expectations were wrong (90 % of 1240 g is 1116 g; a re-tare test mislabelled the locked case; the tolerance unit tests) | — (test data) | Fixed |

No defect was found in the Stage 4 code by the tests written in this stage.

## Notes

- Not covered here (by design): the Weigh screen, OK button and Quit dialog (bolt 011 onwards); overshoot recovery and supervisor override (bolt 012 — everything outside zone OK is refused here); write-back, summary and ticket (bolts 014, 015).
- Known open point for FCI (training assumption O-4): a re-tare mid-weighing makes the recorded actual the net after the last tare; dyestuff dispensed before it is not part of the record.
- The record stores tolerance limits exactly (for example `1234` for 1240.0 ±6.0 g); the UI formats them with the display precision.

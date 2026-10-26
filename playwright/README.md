# End-to-end suite (Playwright)

Drives the real station UI in Chromium against the real server and the Dummy systems.

```
npm run test:e2e          # all tests, about 1½ minutes
npm run test:e2e:report   # open STEP-29-playwright-report/
npx playwright test e2e-full-flow    # one spec
```

**Isolation.** Every test starts its own API and web server on free ports with a fresh copy of
`data/seed` (`support/stack.ts`). WeighingMS keeps its sessions, records, write-backs, tickets and
audit trail immutable, so a clean scenario means a clean data folder; B-24187 is released and
untouched in every test and tests can run in any order. Nothing needs to be running beforehand.

**Set-up and steering.** `support/api.ts` signs in and confirms the first components through the
API for tests that begin part-way; `support/sim.ts` calls the same `_sim` routes the Training Panel
uses (weights, scale connection, printer, OrgaTEX). The behaviour under test is always driven and
read through the screen, and each test also checks the server-side fact behind it.

| Spec                        | Covers                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `e2e-full-flow.spec.ts`     | Step 29: sign-in → B-24187 → five components → Confirm & print → write-back CONFIRMED → ticket → Next batch                                |
| `failures-weighing.spec.ts` | Step 30: tolerance matrix, over, under, invalid weight, Re-tare, scale unavailable, supervisor override                                    |
| `failures-batch.spec.ts`    | Step 30: OrgaTEX unavailable (load, completion), printer offline / out of paper, Quit, incomplete batch, inactive operator, Training Panel |

Tests that are rows of the Step 30 table call `scenario()` and `observed()`
(`support/evidence.ts`); `npx tsx scripts/step30-table.ts STEP-29-results.json > STEP-30-failure-tests.md`
turns the run's results into that table.

Credentials are the project's training seed values (operator BDG-0417, supervisor BDG-0901 with
the documented training PIN, inactive BDG-0999).

# Test Walkthrough — Bolt 017 (Playwright end-to-end and failure suite)

This bolt is the test suite, so its Test stage checks the suite itself: that it is stable, that it can fail, and that its evidence matches the run.

## Stability
| Run | Result |
|-----|--------|
| Evidence run (`STEP-29-results.json`) | 16 passed, 1.5 min |
| Repeat 1 and repeat 2, whole suite | 16 passed, 16 passed, no retries, no flaky tests |
| Repeat 3, full flow + weighing failures | 8 passed |

Each test runs on its own stack and data folder, so a pass does not depend on another test or on order.

## Can the tests fail?
With the tolerance rule removed from `okKeyState` (restored afterwards), the matrix, over, under and invalid-weight tests failed. Three of them had passed too early (OK disabled only because the reading was still settling) and were corrected to judge a settled reading.

## Coverage against story 013
| Criterion | Test |
|-----------|------|
| Full flow: sign-in → B-24187 → five components in order → completion → CONFIRMED → ticket | `e2e-full-flow.spec.ts` |
| Scale, OrgaTEX, printer unavailable; invalid weight; over; under; Re-tare; Quit; incomplete batch | `failures-weighing.spec.ts`, `failures-batch.spec.ts` (15 scenarios, `STEP-30-failure-tests.md`) |
| 93.4 / 93.5 / 94.0 / 94.5 / 94.6 g | "tolerance matrix" |
| HTML report and video | `STEP-29-playwright-report/`, `STEP-29-e2e-video.webm` (mp4 pending an encoder) |

Also covered beyond the story: OrgaTEX down on load and at completion, printer out of paper, supervisor override with a wrong and a correct PIN, inactive operator, Training Panel steering the station.

## Gaps and open items
- `.mp4` video: waiting for an ffmpeg (see the implementation walkthrough).
- F-1 (development build sent the consumption twice on opening Confirm & print; one posting reached OrgaTEX): **fixed** after the bolt. `ConfirmPrintScreen` now shares one request between the effect's re-runs; a StrictMode component test and a request count in the Playwright full flow and the OrgaTEX-down scenario guard it. The OrgaTEX-down row now reads "attempt 1".
- One browser (Chromium); no cross-browser or load testing, by plan.
- Calibration expiring mid-session is covered by component tests (bolt 013), not by an end-to-end test.

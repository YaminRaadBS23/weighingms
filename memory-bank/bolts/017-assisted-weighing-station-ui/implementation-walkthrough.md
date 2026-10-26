# Implementation Walkthrough — Bolt 017 (Playwright end-to-end and failure suite)

**Result:** 16 Playwright tests pass in about 1½ minutes (`npm run test:e2e`); the 1074 Vitest tests, typecheck, ESLint and Prettier stay clean. No file under `src/` changed.

## What was built
| Item | Where |
|------|-------|
| Playwright 1.59.1 (exact devDependency; its Chromium 1217 and ffmpeg 1011 were already in `~/.cache/ms-playwright`) | `package.json`, `package-lock.json` |
| Config: Chromium 1280×800, video on, trace and screenshot on failure, HTML + JSON reporters, one worker | `playwright.config.ts` |
| **A fresh stack per test** (D-2): copy of `data/seed`, API on a free port, Vite on a free port, both stopped and the folder removed afterwards | `playwright/support/stack.ts` |
| `Api` (sign-in, start, confirm the first n components, refusals returned as data), `Sim` (the `_sim` routes), `Station` (the screens as an operator sees them), `scenario()` / `observed()` evidence notes | `playwright/support/` |
| Step 29: the full B-24187 flow | `playwright/tests/e2e-full-flow.spec.ts` |
| Step 30: 15 scenarios in two specs | `failures-weighing.spec.ts` (7), `failures-batch.spec.ts` (8) |
| Step 30 table generator (JSON results → `Scenario | Expected | Actual | Pass`) | `scripts/step30-table.ts` |
| How to run | `playwright/README.md`, `README.md` |

Recipe data (codes, targets, tolerances) is read from the API at run time; the tests hold no copy of scenario data. Credentials are the training seed values.

## Evidence produced
`STEP-29-playwright-report/` (HTML report), `STEP-29-results.json`, `STEP-29-e2e-video.webm` (the full-flow test, 1280×800), `STEP-30-failure-tests.md` (15 scenarios, 15 PASS; *Actual* is what each test observed).

## How I checked the tests can fail
With the tolerance rule removed from `okKeyState` (temporarily, then restored), the tolerance matrix, over, under and invalid-weight tests failed. That showed the over/under/invalid tests were passing too early (OK was disabled only because the fresh reading was not stable yet); they now wait for a settled reading before judging the key.

## Findings
- **F-1 (minor, development build only):** opening Confirm & print sends `POST …/consumption` twice, because React StrictMode runs the mount effect twice in dev. The server is idempotent (exactly one posting reaches OrgaTEX, asserted in the suite), but when OrgaTEX is down the PENDING row shows "attempt 2" before the operator pressed anything. A production build sends once. Not changed (D-7); a guard in `ConfirmPrintScreen` would remove it. **Update:** fixed after the bolt with a guard in `ConfirmPrintScreen` (one shared request per opening).
- By design, a scale that is disconnected for less than 2 s and comes back does not force a Re-tare (bolt 013); the suite stays disconnected for 3 s.

## Open
- `STEP-29-e2e-video.mp4`: this machine has no ffmpeg and Playwright's own ffmpeg writes WebM only, so the video exists as `.webm` until an mp4 encoder is available.

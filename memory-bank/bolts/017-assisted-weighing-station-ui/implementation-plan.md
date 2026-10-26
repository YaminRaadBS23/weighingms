---
stage: plan
bolt: 017-assisted-weighing-station-ui
created: 2026-10-26T16:00:00Z
---

## Implementation Plan: assisted-weighing-station-ui — Playwright end-to-end and failure suite (bolt 17 of 17)

### Objective

Prove the whole product automatically: the full **B-24187** flow in a real browser (workbook **Step 29**) and every failure scenario (**Step 30**), with an HTML report and a video. The suite drives the real UI against the real server and the Dummy systems; simulation is steered only through the `_sim` routes (the same ones the Training Panel uses). No production code changes are planned; if the suite finds a defect, it is reported to you and fixed only with your approval.

### Story and requirements implemented

| Story | Requirements | What it delivers |
|-------|--------------|------------------|
| `013-end-to-end-test-suite` | NFR testability, Workbook Steps 22, 29, 30 | Playwright suite for the full flow and the failure scenarios, tolerance matrix, HTML report and video |

Out of scope: unit/component tests (done in earlier bolts), load or cross-browser testing (one Chromium), changing the product, the Step 28 UI-vs-prototype document (see D-8).

---

### 1. What will change

**A. Tooling (`playwright/`, as in the workbook's project tree)**

1. `@playwright/test` as a pinned devDependency (D-1), `playwright.config.ts` in the repo root, scripts `test:e2e` (run) and `test:e2e:report` (open report). Vitest keeps `src/**` only, so the two runners never pick up each other's files.
2. Config: one Chromium project, 1280×800 (a station screen), `video: 'on'`, `trace: 'retain-on-failure'`, HTML reporter written to `STEP-29-playwright-report/` plus a JSON reporter for the Step 30 table. Workers: 1 (the stack per test is already isolated; see 3).
3. **A fresh stack per test (D-2)**: a fixture copies `data/seed` into a temp folder and starts the API (`tsx src/server/main.ts`, `DATA_DIR` = that folder, a free port) and Vite (proxying to it, a free port), waits until both answer, hands the test its `baseURL`, and stops both afterwards. WeighingMS's own records are immutable, so a clean run needs a clean data folder; this also makes every test independent and repeatable in any order.

**B. Helpers (`playwright/support/`)**

- `stack.ts` (the fixture above), `sim.ts` (calls the `_sim` routes through Playwright's request context: dispense, weight, container, disconnect, reconnect, calibration, printer, OrgaTEX, scanner), `station.ts` (page object: sign in with badge BDG-0417, select a batch, scan or type a dyestuff code, read the readout and the OK key state, press OK, F1/F2/F3/F4, quit, the Confirm & print screen). Test credentials are the project seed's training ones (operator BDG-0417, supervisor BDG-0901 with the documented training PIN); no real credential is used.
- Seed values for B-24187 are read from `data/seed/orgatex-seed.json` by the helpers (codes, targets, default lots and containers), so the tests hold no copy of scenario data.

**C. Step 29 — the complete flow (`playwright/tests/e2e-full-flow.spec.ts`)**

Open WeighingMS → sign in → select **B-24187** → recipe loads (5 components) → for each of Blue RSPL, Red RB, Yellow RGB, Sodium Sulphate, Soda Ash in order: scan the dyestuff code, the lot and container default in, the scale is chosen automatically (g components on the precision scale, kg on the floor scale), dispense to target through the simulator, the tolerance bar turns green, OK → next component activates → after the fifth: **Confirm & print** shows 5 of 5, YES, total dispensed, "Written to OrgaTEX CONFIRMED", **Print ticket** shows the stored ticket with COMPONENT header and barcode `B-24187`, status Printed → **Next batch** → B-24187 shows WEIGHED. The test also checks, through the API and the Dummy OrgaTEX state, that exactly one posting of 5 lines exists and the printer received one job. This test's video is the Step 29 video.

**D. Step 30 — failure scenarios (`playwright/tests/failures-*.spec.ts`)**

| Scenario | How it is driven | Expected (defined behaviour) |
|----------|------------------|------------------------------|
| Scale unavailable | disconnect the active scale for more than 2 s mid-weigh | "scale lost" notice, OK and Override disabled, no confirmation possible; reconnect asks for Re-tare, Re-tare clears it |
| OrgaTEX unavailable (on completion) | OrgaTEX offline, finish the batch | weighing completes, summary shows write-back PENDING with reason, strip shows "WRITE-BACK 1 PENDING", ticket still prints; OrgaTEX online + Retry → CONFIRMED, strip item disappears |
| OrgaTEX unavailable (on load) | OrgaTEX offline before selecting | Select batch shows the unavailable notice and the last queue is not trusted; no session starts |
| Printer unavailable | printer OFFLINE, press Print ticket | ticket kept, "printer is offline" with Retry, write-back unaffected; READY + Retry prints the same ticket (not a reprint); Reprint then adds a marked copy |
| Printer out of paper | same with OUT OF PAPER | wording says out of paper |
| Invalid weight | scale with a container only / no stable reading / negative net | OK disabled with the reason; confirm refused |
| Over tolerance | dispense target + 3 × tolerance | OK disabled, surplus panel with the amount to remove; recovery by Re-tare or by removing the excess (Step 24, TD-10 Option A) |
| Under tolerance | dispense target − 3 × tolerance | OK disabled, "add more" state |
| Tolerance matrix | 93.4 / 93.5 / 94.0 / 94.5 / 94.6 g on a 94.0 g target | OK disabled / enabled / enabled / enabled / disabled |
| Re-tare | place a container, F2 | reading returns to zero; confirmation of the new tare shown |
| Quit | F4 mid-batch, confirm | session ends safely, nothing recorded for the unfinished component, the batch is selectable again |
| Incomplete batch | try to create a ticket for the batch with 4 of 5 confirmed (API from the page's request context) and look for Confirm & print | 422 `BATCH_INCOMPLETE`, no ticket, no write-back, the UI never shows Confirm & print |
| Supervisor override and scale change | override an over-tolerance component with the supervisor PIN; wrong PIN | override accepted and shown on the ticket as EXCEPTION; wrong PIN refused, nothing changes |
| Inactive operator | badge BDG-0999 | refused with the defined message |

Each test asserts the user-visible result **and** the server-side fact behind it (API read), so a passing test cannot be a cosmetic pass.

**E. Evidence (Steps 29 and 30)**

- `STEP-29-playwright-report/` — the Playwright HTML report of the full run (videos and traces of failures inside).
- `STEP-29-e2e-video.mp4` — the video of the full-flow test (D-3).
- `STEP-30-failure-tests.md` — the workbook table `Scenario | Expected | Actual | Pass`, generated from the run's JSON results (so *Actual* is what the run observed, not a hand-written claim), with the extra scenarios above.
- `playwright/README.md` — how to run, what each spec covers.

### 2. Files

New: `playwright.config.ts`, `playwright/support/{stack,sim,station}.ts`, `playwright/tests/*.spec.ts`, `playwright/README.md`, `scripts/step30-table.ts` (turns the JSON results into the table), the three evidence items. Changed: `package.json` (devDependency, two scripts), `package-lock.json`, `README.md` (one paragraph), `.gitignore` (`test-results/` already ignored). No `src/` change.

### 3. Decisions for you

| # | Question | Recommendation |
|---|----------|----------------|
| D-1 | Add `@playwright/test` (devDependency, exact version, needs npm network access). Browsers are already cached in `~/.cache/ms-playwright` (Chromium 1217, ffmpeg 1011), so I will pick the version that matches them; if that does not exist I will tell you before any download. | Yes |
| D-2 | A fresh API + web stack and data folder per test (about 3 s each) instead of one shared stack. | Fresh per test: independent, order-free, B-24187 is usable in every test |
| D-3 | **Video format.** Playwright records WebM; this machine has no `ffmpeg` binary to make an `.mp4` (Playwright's own ffmpeg only writes VP8 WebM). Options: (a) deliver `STEP-29-e2e-video.webm` and say so in the evidence; (b) you install ffmpeg (`sudo apt install ffmpeg`) and I convert to the exact `.mp4` name the workbook asks for. | (b) if you can install it, otherwise (a) |
| D-4 | Use the Training Panel page itself in one test (second tab) to prove the panel drives the operator screen; all other tests call the same `_sim` routes directly. | Yes |
| D-5 | Supervisor PIN and badges come from the seed/README training values. | Yes |
| D-6 | Incomplete batch is proved through the ticket API plus "UI never shows Confirm & print", because the UI offers no way to request a ticket for an unfinished batch. | Yes |
| D-7 | If a test finds a product defect, I stop, show it, and fix only after you agree (the fix and a regression test then belong to this bolt). | Yes |
| D-8 | Step 28 (UI vs prototype comparison, `STEP-28-ui-validation/`) is served by this bolt but is a different kind of work. Do it as its own step after this bolt's Implement is approved, reusing Playwright screenshots. | Separate step, after Implement |

### 4. Risks

- Timing: the scale-lost rule needs more than 2 s of failing polls; tests wait on visible states, never on fixed sleeps except that deliberate gap.
- Port clashes: the fixture picks free ports; the Vite proxy target comes from `PORT`, and Vite's port from the command line.
- A run takes roughly 1–2 minutes; acceptable.

### 5. Acceptance mapping (story 013)

| Criterion | Where |
|-----------|-------|
| Full flow passes on a reset scenario | C |
| Scale, OrgaTEX, printer unavailable, invalid weight, over, under, re-tare, quit, incomplete batch pass | D |
| 93.4 / 93.5 / 94.0 / 94.5 / 94.6 | D (tolerance matrix) |
| HTML report and video produced | E |

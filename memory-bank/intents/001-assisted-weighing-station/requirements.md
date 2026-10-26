---
intent: 001-assisted-weighing-station
phase: inception
status: complete
created: 2026-10-15T12:01:55.000Z
updated: 2026-10-15T12:12:10.000Z
---

# Requirements: Assisted Weighing Station

> **Status:** Intent approved (2026-10-15T12:03:16Z, Checkpoint 1). Requirements **approved (2026-10-15T12:12:10Z, Checkpoint 2)**. FR-21 decided at workbook Step 24 (2026-10-26, TD-10: Option A).

**How to read this document**

| Section | Contains |
|---------|----------|
| Intent Overview → Scope | The approved Intent (unchanged except for the scope decisions recorded in Step 7) |
| Functional Requirements (FR-1 … FR-37) | **Confirmed requirements** for this build — each traces to the Product Brief (`BR-`, `FR-`, `IR-`, `AC-` refs = `docs/brief.md`), the prototype (`UI:`), or the workbook (`WB:`) |
| Non-Functional Requirements (NFR-1 … NFR-14) | Intent-specific quality requirements (project-wide standards are not repeated) |
| Training Decisions (TD-1 … TD-15) | **Assumptions** decided for this build where the sources are silent or unconfirmed. Each is unconfirmed by FCI |
| Training-only Dummy Behaviour (DB-1 … DB-7) | Behaviour that exists only because the real systems are unavailable. **Not** claims about real OrgaTEX/device interfaces |
| Open Questions | **Unresolved questions** that remain open after this step |
| Traceability | The 20 workbook requirement areas → requirement IDs |

"Confirmed" means *confirmed for this training build* by the sources and the user's decisions — **nothing in the Product Brief has been confirmed by FCI**.

---

## Intent Overview

**WeighingMS** is an **assisted dyestuff weighing station** for FCI's textile dyehouse. It sits between **OrgaTEX MES** (SETEX) — which remains the system that owns batches and recipes — and the **weighing operator**, who still dispenses dyestuffs and auxiliaries **by hand**.

WeighingMS receives the batch and its recipe digitally, selects the correct scale for each component, guides the operator in real time against the target, refuses out-of-tolerance weights, records exactly what was weighed (with lot, container, tare, scale, operator and time), writes actual consumption back to OrgaTEX, and prints a ticket that travels with the container to the dyeing machine.

**This intent delivers a working, demonstrable training product** that reproduces the functional experience of the supplied operator-terminal prototype, running against **Dummy APIs** that stand in for the real external systems, which are not available.

| Attribute | Value |
|-----------|-------|
| Intent type | New Feature (green-field product) |
| Client / domain | FCI — textile dyehouse, dye-batch weighing |
| Product sources | `docs/brief.md` (Business Requirements Document v1.1, draft), `docs/customize-weighing-station.html` (operator-terminal UI/UX prototype) |
| Project standards | `memory-bank/standards/*` (approved during project initialisation) |

### Business problem

Today (assumed — brief A-13) the recipe is printed on paper, the operator weighs by eye against a printed figure, and **what was actually dispensed is never recorded**. When a batch fails shade approval, nobody can tell a bad recipe from a bad weighing, so failures cannot be attributed and the same error recurs. Actual dyestuff consumption is never reconciled against theory. (brief §2, §6.1)

### Primary user and stakeholders

| Role | Relationship to WeighingMS |
|------|----------------------------|
| **Weighing operator** (primary user) | Uses the station all day: selects the batch, weighs each component, confirms, prints the ticket. Works with gloves in a dusty environment; may have limited computer literacy (brief C-05) |
| **Dyehouse supervisor** | Authorises tolerance overrides and manual scale reselection; follows batch progress |
| Lab / QA | Uses the weighed-vs-recipe record to investigate shade failures |
| Store / inventory | Uses actual consumption and lot data for stock reconciliation |
| FCI IT / SETEX | Own OrgaTEX and its interface — **not available to this project** |

### Desired outcome

An operator can take batch **B-24187** (order SO-9931, machine JET-04, shade Teal 4C) from the station's batch queue through **all five recipe components** — Remazol Brill. Blue RSPL, Remazol Red RB, Remazol Yellow RGB, Sodium Sulphate, Soda Ash — with:

- the correct scale chosen per component (3 kg precision / 32 kg floor),
- live weight guidance against target and tolerance,
- confirmation possible **only** inside tolerance (or via an authorised override),
- a defined, recorded response to over-dosing (overshoot),
- a complete traceability record for every confirmed component,
- actual consumption written back to (Dummy) OrgaTEX, and
- a printed / previewed weighing ticket,

all demonstrable end-to-end in the running application and proven by automated tests, including failure scenarios (scale, OrgaTEX or printer unavailable; under/over tolerance; re-tare; quit; incomplete batch).

### Business goals

| Goal | Success metric (training product) | Brief ref | Priority |
|------|-----------------------------------|-----------|----------|
| Prevent out-of-tolerance weighings reaching production | Confirmation is impossible outside tolerance without authorised override (automated tests at boundary values) | BO-01, BR-07, AC-04 | Must |
| Component-level traceability for every batch | 100% of confirmed weighings carry target, actual, operator, scale, lot, container, tare, timestamp | BO-02, BR-11, AC-07 | Must |
| Reconcile actual vs theoretical consumption | Completed batch's actual consumption is stored by (Dummy) OrgaTEX against the correct batch | BO-04, BR-12, AC-08 | Must |
| Guide the operator, not slow them down | Live weight updates continuously; the full B-24187 flow is completable without leaving the station screen | BO-06, BR-06 | Must |
| Make failures and the unknowns visible | Every dependency failure produces a defined, safe, visible state; every unconfirmed assumption is recorded | BR-16, brief §12 | Must |

---

## Scope

### In scope (this intent)

1. **Batch queue and selection** — batch queue from OrgaTEX, select by touch or (simulated) barcode scan, batch context, recipe retrieval.
2. **Component preparation** — recipe sequence with done / active / pending states; automatic scale selection; dyestuff identity and lot; container and tare.
3. **Guided weighing** — live weight, weighed now / still to weigh / target, progress bar with tolerance band, in-tolerance and over-tolerance signalling, re-tare, quit.
4. **Tolerance enforcement and confirmation** — confirm only within tolerance; full traceability record on confirmation.
5. **Overshoot handling** — a defined training rule, decided explicitly with the user (workbook Step 24), not copied from the prototype.
6. **Supervisor override** — authorised and logged with reason.
7. **Component progression and batch completion** — cannot complete a component with an invalid weight, nor a batch with incomplete components.
8. **OrgaTEX consumption write-back** on batch completion, held and retried if OrgaTEX is unreachable.
9. **Weighing ticket** generation and print / print preview, including reprint.
10. **Operator identification** and traceability.
11. **Failure behaviour** for scale, scanner, printer and OrgaTEX unavailability.
12. **Scale calibration status** with blocking of expired scales.
13. **Dummy integrations as product artifacts** (see below), seeded with the prototype's training scenario.

### Dummy integrations (training substitutes)

| Real (conceptual) system | Training substitute | Role |
|--------------------------|---------------------|------|
| OrgaTEX MES | **Dummy OrgaTEX API** | Batch queue, batch detail, recipe/components, dyestuff lots, consumption write-back |
| Weighing scales (3 kg precision, 32 kg floor) | **Dummy Scale API** | Scale list, status, calibration, live weight, tare |
| Barcode scanner | **Dummy Scanner** | Batch / dyestuff / lot / container scans |
| Ticket printer | **Dummy Printer** | Ticket printing, print preview, printer status |

**These are training contracts only.** They make no claim about the real OrgaTEX, scale, scanner or printer interfaces. The brief's illustrative endpoint shapes (§10.1) are unconfirmed (A-01) and are not adopted as real contracts.

### Out of scope (this intent)

From brief §5.2: dispensing-machine connection/control; automated container transport; dissolving stations, liquid dosing, bulk salt/soda systems; recipe authoring or modification (C-01); replacing or modifying OrgaTEX (C-02); lab colour matching / shade approval; procurement; machine-side dyeing control.

Training-product exclusions: any real integration with OrgaTEX or physical devices; production deployment; multi-station / multi-site; production-grade authentication.

### Scope decisions (Step 7)

| Item | Brief ref | Decision | Record |
|------|-----------|----------|--------|
| Behaviour when OrgaTEX is unreachable | BR-16–18, FR-30–33, A-03 | **Hold & retry** — weighing never blocked; write-back held PENDING with manual retry. Full background sync **deferred** | TD-1 |
| Surplus compensation vs simpler overshoot handling | FR-20–24, A-08 | **Decided at Step 24: block, recover, supervisor override; no compensation** | TD-10 |
| Ticket reprint marked as reprint | FR-28 | **In scope** (Should) | TD-4 |
| Scale calibration status and blocking | BR-24, FR-12, AC-14 | **In scope** (Should) | TD-4 |
| Batch weighing history / reporting | FR-29, BR-14, BR-23 | **Deferred** — records are stored so it can be added later | TD-4 |
| Supervisor remote progress view | BR-22 | **Deferred** | TD-4 |
| Multi-language interface | BR-21, FR-37, A-10 | **English only**, all text externalised | TD-11 |

### UI/UX source

The supplied prototype `docs/customize-weighing-station.html` is a **primary source**. The product reproduces its operator screen:

- **1 · Select batch** — "Scan a batch card to begin / Or touch a row below"; queue table (Batch, Order, Machine, Fabric / lot, Shade, Comp., Status) with B-24187, B-24188, B-24190, B-24191
- **2 · Weigh** — recipe rail ("Recipe · Teal 4C", "n of 5 components weighed"), component name, code · LOT · CONTAINER · TARE, "Scale selected … automatic" badge, "Weighed now" / "Still to weigh" / "Target", progress bar with tolerance band and caption "TOLERANCE ±x (lo – hi)", status line, surplus panel, keys **OK · Confirm F1**, **Re-tare F2**, **Quit F4**, **Supervisor override**
- **3 · Confirm & print** — "Batch B-24187 weighed", Components weighed, All within tolerance, Total dispensed, Elapsed, Operator, **Written to OrgaTEX CONFIRMED hh:mm:ss**, **Print ticket F1**, **Next batch F3**, ticket (batch, order, machine, shade, date, operator, component / TGT / ACT, tolerance verdict, barcode)
- **Status bar** — SCALE 3 kg · READY, SCALE 32 kg · READY, SCANNER, PRINTER, ORGATEX · LINKED hh:mm, EN, clock; top bar with "WeighingMS STATION 01", batch/order/machine crumb, operator chip

The prototype's reviewer notes, question pins and simulation controls are not reproduced on the operator screen (`memory-bank/standards/ux-guide.md`). It tests three assumptions: continuous weight reading, surplus compensation by recalculation, and one operator weighing one component at a time against an OrgaTEX-owned queue.

---

## Functional Requirements

### Operator and batch selection

### FR-1: Operator identification
- **Description**: At session start the operator identifies by badge ID (scanned or typed). The identified operator is shown in the top bar operator chip (name and shift) for the whole session and is attributed to every weighing.
- **Acceptance Criteria**: (1) No batch can be selected before an operator is identified. (2) An unknown or inactive badge ID is rejected with a message. (3) The operator chip shows the operator's name and shift (e.g. "R. Karim · Shift A"). (4) Every weighing record and the ticket carry this operator.
- **Priority**: Must
- **Sources**: FR-34, BR-19, A-09, UI: operator chip; TD-6
- **Related Stories**: 004/001, 006/002

### FR-2: Batch queue
- **Description**: The Select batch screen shows the batch queue for this station, obtained from OrgaTEX through the WeighingMS API (never hard-coded in the UI). Columns: Batch, Order, Machine, Fabric / lot, Shade, Comp. (component count), Status. The screen shows when the queue was received.
- **Acceptance Criteria**: (1) The UI obtains the queue only from `GET /api/batches`. (2) With the training seed, the queue lists B-24187, B-24188, B-24190, B-24191 with the prototype's order, machine, fabric, shade and component-count values. (3) Each row shows its status. (4) "Queue received from OrgaTEX at hh:mm" is shown.
- **Priority**: Must
- **Sources**: FR-01, FR-04, BR-01, IR-01, UI: queue view, WB: Step 19
- **Related Stories**: 001/002, 001/003, 003/001, 006/003

### FR-3: Batch selection by touch or scan
- **Description**: The operator selects a batch by touching its row or by scanning its batch barcode. Selection loads the batch detail and its recipe and opens the Weigh screen.
- **Acceptance Criteria**: (1) Touching B-24187 calls `GET /api/batches/B-24187` then `GET /api/batches/B-24187/recipe` and opens Weigh. (2) A scan of `B-24187` has the same effect. (3) The top bar crumb shows "BATCH B-24187 · ORDER SO-9931 · MACHINE JET-04". (4) A scanned ID not in the queue is rejected with a message.
- **Priority**: Must
- **Sources**: FR-02, FR-05, BR-02, UI: "Scan a batch card to begin / Or touch a row below", WB: Step 19
- **Related Stories**: 003/002, 006/003

### FR-4: Reject batches that are not released
- **Description**: Only batches in a selectable state (RELEASED, or WEIGHING to resume) can be weighed. Others are visibly not selectable and selection attempts show the reason.
- **Acceptance Criteria**: (1) Selecting a QUEUED (not released) batch is refused with the reason shown. (2) The server also refuses (409 `BATCH_NOT_RELEASED`). (3) A WEIGHING batch resumes its existing session (see FR-24).
- **Priority**: Must
- **Sources**: FR-03, BR-03, TD-7
- **Related Stories**: 003/002, 004/002, 006/003

### FR-5: Recipe loading
- **Description**: On selection, WeighingMS retrieves the recipe and its components from OrgaTEX: sequence, dyestuff (name, code, colour), target quantity and unit, tolerance, and suggested lot. The recipe rail header shows "Recipe · {shade}", the batch ID and "{n} of {total} components weighed".
- **Acceptance Criteria**: (1) For B-24187 the recipe "Teal 4C" lists exactly five components in this order: Remazol Brill. Blue RSPL 1240.0 g ±6.0 g, Remazol Red RB 386.0 g ±2.0 g, Remazol Yellow RGB 94.0 g ±0.5 g, Sodium Sulphate 24.000 kg ±0.120 kg, Soda Ash 9.600 kg ±0.048 kg. (2) Values arrive from the API; none are embedded in the UI. (3) Recipe displayed ≤ 3 s after selection (NFR-2).
- **Priority**: Must
- **Sources**: FR-05, BR-04, IR-02, UI: recipe rail, WB: Steps 17, 19
- **Related Stories**: 001/002, 001/003, 003/003

### Component preparation

### FR-6: Component list and states
- **Description**: The recipe rail lists every component in recipe sequence with colour swatch, name, code · scale, target quantity with unit, and state: **done** (with "✓ actual"), **active** ("WEIGHING"), **pending** ("PENDING"). The first pending component in sequence becomes active by default; the operator may touch another pending component to make it active instead.
- **Acceptance Criteria**: (1) Exactly one component is active while the batch is in progress. (2) Done components show their confirmed actual and cannot be re-activated. (3) Touching a pending component makes it active, resets any unconfirmed weighing on the previous one, and returns the previous one to pending. (4) The header count matches the number of done components.
- **Priority**: Must
- **Sources**: FR-06, UI: `.comp` states, TD-13
- **Related Stories**: 004/003, 006/004

### FR-7: Dyestuff identity verification
- **Description**: Before weighing is unlocked for the active component, the operator verifies the dyestuff by scanning its barcode (Dummy Scanner or typed entry). The scanned code must match the component's dyestuff code.
- **Acceptance Criteria**: (1) Live weighing and confirmation are locked until identity is verified. (2) Scanning `DYE-4471` for Remazol Yellow RGB unlocks it. (3) Scanning a different dyestuff code is rejected with a clear "wrong dyestuff" message and nothing unlocks. (4) Verification is recorded with the weighing.
- **Priority**: Must
- **Sources**: FR-09, BR-10, A-10, R-08, TD-3
- **Related Stories**: 004/004, 006/006

### FR-8: Dyestuff lot
- **Description**: Each component shows the lot to be consumed ("LOT 2026-0387"). The lot defaults to the suggested lot from OrgaTEX data and can be changed by scanning a lot label; a scanned lot must belong to the component's dyestuff.
- **Acceptance Criteria**: (1) The default lot is displayed for each component. (2) A valid scanned lot replaces it. (3) A lot of another dyestuff is rejected. (4) The lot in force at confirmation is recorded.
- **Priority**: Must
- **Sources**: FR-10, BR-11, A-09, Q28, UI: "LOT …", TD-3
- **Related Stories**: 001/002, 001/003, 003/005, 004/004, 006/006

### FR-9: Container
- **Description**: Each component is weighed into one container ("CONTAINER C-12"). The container defaults from the station's container data and can be changed by scanning a container label; the container's master tare is shown.
- **Acceptance Criteria**: (1) Default container and its tare are displayed. (2) Scanning an in-service container replaces it. (3) An unknown or out-of-service container is rejected. (4) The container at confirmation is recorded.
- **Priority**: Must
- **Sources**: FR-11, Q29, UI: "CONTAINER … · TARE …", TD-3, TD-8
- **Related Stories**: 003/006, 004/004, 006/006

### FR-10: Tare
- **Description**: When weighing is unlocked, WeighingMS tares the selected scale with the container on it, so "Weighed now" starts at zero net. The tare value used is recorded.
- **Acceptance Criteria**: (1) After unlock, `POST /api/scales/:scaleId/tare` is issued and the net reading is 0. (2) The tare value applied is recorded with the weighing. (3) Displayed values are net of tare.
- **Priority**: Must
- **Sources**: FR-11, IR-12, UI: TARE, TD-8
- **Related Stories**: 002/003, 004/004

### FR-11: Automatic scale selection
- **Description**: For each component, WeighingMS selects the scale automatically: the smallest-capacity available scale whose capacity covers target + tolerance + container tare. The badge shows "Scale selected / {scale} / automatic". Units and display precision follow the component.
- **Acceptance Criteria**: (1) Blue RSPL, Red RB and Yellow RGB select the **3 kg precision** scale. (2) Sodium Sulphate and Soda Ash select the **32 kg floor** scale. (3) Switching from Yellow RGB to Sodium Sulphate switches the badge, the live-weight source and the units from g to kg. (4) Selection is a pure rule, unit-tested including the capacity boundary.
- **Priority**: Must
- **Sources**: FR-07, BR-05, A-06, Q15, AC-02, UI: scale badge, WB: Step 21, TD-2
- **Related Stories**: 002/001, 004/005, 006/004

### FR-12: Supervisor manual scale reselection
- **Description**: A supervisor can override the automatic scale choice for the active component (e.g. if a scale is out of service), provided the alternative scale has sufficient capacity.
- **Acceptance Criteria**: (1) Requires supervisor PIN. (2) Only scales with sufficient capacity are offered. (3) The badge shows "manual" instead of "automatic". (4) An audit event (SCALE_RESELECT) records supervisor, scale and time.
- **Priority**: Should
- **Sources**: FR-08, FR-35, FR-36
- **Related Stories**: 004/006, 006/009

### FR-13: Scale calibration status
- **Description**: Each scale has a calibration due date. The status bar shows each scale's state; a scale past its due date shows "CAL EXPIRED" and cannot be used for weighing.
- **Acceptance Criteria**: (1) With seed data both scales show READY. (2) When a scale's calibration is expired (via Dummy Scale simulation), it shows CAL EXPIRED, weighing on it is blocked with a message, and the server refuses confirmation on it. (3) Automatic selection never chooses an expired scale; if no valid scale has capacity, the component cannot be weighed and the reason is shown.
- **Priority**: Should
- **Sources**: BR-24, FR-12, AC-14, A-06, Q20, TD-4
- **Related Stories**: 002/001, 004/007, 006/008

### Guided weighing

### FR-14: Live weight
- **Description**: While a component is unlocked, the "Weighed now" readout shows the current net weight from the selected scale, updating continuously.
- **Acceptance Criteria**: (1) The UI reads weight from `GET /api/scales/:scaleId/weight` (never simulated in the UI). (2) Readings update at ≥ 10 Hz with display lag ≤ 200 ms (NFR-1). (3) Weight is shown in the component's unit at its display precision (g: 1 decimal, kg: 3 decimals). (4) The reading's stability is available to the UI.
- **Priority**: Must
- **Sources**: FR-13, BR-06, IR-10, IR-11, A-05, UI: "Weighed now", WB: Step 21
- **Related Stories**: 002/002, 006/005

### FR-15: Target, weighed now, still to weigh
- **Description**: The readout shows three cells: **Weighed now** (live net), **Still to weigh** (max(0, target − weighed now)), **Target**, all with the component's unit.
- **Acceptance Criteria**: (1) For Yellow RGB at 0.0 g: Still to weigh 94.0 g, Target 94.0 g. (2) At 90.0 g: Still to weigh 4.0 g. (3) Above target, Still to weigh shows 0.0 (never negative). (4) Arithmetic is decimal, not floating point.
- **Priority**: Must
- **Sources**: FR-14, BR-06, NFR-16, UI: readout cells, WB: Step 20
- **Related Stories**: 006/005

### FR-16: Progress bar with tolerance band
- **Description**: A graphical bar shows weighed-now against a full-scale value, with the tolerance band and target line marked, and a caption "TOLERANCE ±{tol} {unit} ({lo} – {hi})" and the full-scale value. The bar colour follows the tolerance zone (FR-17).
- **Acceptance Criteria**: (1) Yellow RGB caption reads "TOLERANCE ±0.5 g (93.5 – 94.5)". (2) The band spans exactly lower to upper limit; the target line is at target. (3) The bar exposes value, target and band to assistive technology.
- **Priority**: Must
- **Sources**: FR-15, UI: `.bar`, `.band`, caption, TD-12
- **Related Stories**: 006/005

### FR-17: Tolerance evaluation and signalling
- **Description**: The weight is classified against the component's tolerance band **[target − tol, target + tol], boundaries inclusive**: *under* (below the band), *ok* (inside, inclusive), *over* (above the band); *under* is shown as *near* once the weight reaches 90% of target. Each zone has a distinct colour and status text: under/near → "DISPENSE — {x} REMAINING", ok → "WITHIN TOLERANCE — PRESS OK TO CONFIRM", over → "OVER TOLERANCE — SURPLUS +{x}".
- **Acceptance Criteria**: For Yellow RGB (94.0 g ±0.5 g): 93.4 g → under (cannot confirm); 93.5 g → ok; 94.0 g → ok; 94.5 g → ok; 94.6 g → over (cannot confirm). Equivalent boundary tests for a kg component (Sodium Sulphate 24.000 kg ±0.120 kg). Colour is never the only signal.
- **Priority**: Must
- **Sources**: FR-16, FR-17, BR-07, AC-04, UI: `zone()` and status texts, WB: Step 22, TD-5
- **Related Stories**: 004/008, 006/005

### FR-18: Confirmation gating
- **Description**: **OK · Confirm (F1)** is enabled only when identity is verified, the scale is connected, calibrated and stable, and the weight is in the *ok* zone — or after an authorised override (FR-22). The server re-evaluates all conditions with its own fresh scale reading and rejects a confirmation that fails them.
- **Acceptance Criteria**: (1) OK is disabled at 93.4 g and 94.6 g and enabled at 93.5, 94.0, 94.5 g (stable). (2) OK is disabled while the reading is unstable, with the reason shown. (3) A crafted confirm request while out of tolerance is rejected (422 `TOLERANCE_VIOLATION`) and nothing is recorded. (4) F1 triggers OK when enabled.
- **Priority**: Must
- **Sources**: FR-18, BR-07, IR-11, AC-04, WB: Step 25, TD-9
- **Related Stories**: 004/009, 006/007

### FR-19: Confirmation record
- **Description**: On confirmation WeighingMS permanently records the weighing: batch, component, dyestuff code, **actual weight**, unit, **target and tolerance limits (snapshot)**, **lot**, **container**, **tare**, **scale**, **operator**, **timestamp**, result (IN_TOLERANCE / OVERRIDDEN / per Step 24 decision), and surplus if any. The component becomes done and shows "✓ {actual}".
- **Acceptance Criteria**: (1) The record contains every listed field. (2) It is durable before the UI shows the component as done (NFR-5). (3) Records are immutable; no update/delete endpoint exists (NFR-8). (4) The record is retrievable via the API for evidence (WB: Step 25 `STEP-25-transaction.json`).
- **Priority**: Must
- **Sources**: FR-25, BR-11, BR-14, AC-07, DR-02, §9.2 WEIGHING_RECORD, WB: Step 25
- **Related Stories**: 004/009

### FR-20: Overshoot detection
- **Description**: When the weight exceeds the upper tolerance limit, WeighingMS shows the over state, blocks confirmation, and shows the surplus: "Surplus +{x} {unit} (+{p}%) — over tolerance", where surplus = weighed now − target and p = surplus / target.
- **Acceptance Criteria**: (1) At 96.4 g for Yellow RGB the panel reads "Surplus +2.4 g (+2.6%) — over tolerance". (2) OK is disabled. (3) The panel disappears when the weight returns within tolerance or the component is re-tared.
- **Priority**: Must
- **Sources**: FR-20, BR-08, UI: surplus panel, WB: Step 24
- **Related Stories**: 004/008, 004/014, 006/010

### FR-21: Overshoot recovery
- **Description**: An over-dosed component must have a **defined** recovery path. The specific rule (e.g. remove excess and re-weigh, discard and re-weigh, supervisor override, or proportional compensation of remaining components as the prototype proposes) was **decided at workbook Step 24** (2026-10-26) and recorded in TD-10 (Option A): an over-dosed component stays unconfirmed; the operator removes the excess until the weight is back in tolerance, or uses Re-tare to restart the component; a supervisor may override (FR-22). **No automatic recipe recalculation is performed.** Surplus is measured from the **target** (weight − target, with percent of target).
- **Acceptance Criteria**: (1) An over-dosed weight is never confirmable without override; re-tare/restart is available. (2) The surplus is shown as "+x g (+y %)" measured from the target. (3) No remaining component's target changes because of an overdose; the recipe snapshot stays as received. (4) An overridden over-dose stores the surplus on the record.
- **Priority**: Must
- **Sources**: FR-21–FR-24, BR-08, A-08, Q25, Q26, UI: surplus "Proposal", WB: Step 24, TD-10
- **Related Stories**: 004/014, 006/010

### FR-22: Supervisor override
- **Description**: When the weight is outside tolerance (and > 0), **Supervisor override** lets a supervisor authorise confirmation of that weight. The supervisor enters their PIN and a mandatory reason. The record's result is OVERRIDDEN and an OVERRIDE audit event is written. While awaiting the supervisor, the status reads "OVERRIDE REQUESTED — AWAITING SUPERVISOR".
- **Acceptance Criteria**: (1) Override cannot complete without a valid supervisor PIN **and** a non-empty reason (AC-06). (2) An operator badge/PIN is not accepted as a supervisor. (3) The override record stores supervisor, reason, time, and the weight. (4) Decided at Step 24 (TD-10): override is allowed for any out-of-tolerance weight above zero, including over-dosed ones; the record keeps the surplus (if over) and no recalculation follows.
- **Priority**: Must
- **Sources**: BR-07, BR-13, FR-23, FR-24, FR-35, AC-06, Q33, UI: "Supervisor override", "OVERRIDE REQUESTED — AWAITING SUPERVISOR", TD-6
- **Related Stories**: 004/013, 006/009

### FR-23: Re-tare
- **Description**: **Re-tare (F2)** re-zeroes the selected scale with the container in place and resets the unconfirmed weighing for the active component.
- **Acceptance Criteria**: (1) After Re-tare, Weighed now is 0 and Still to weigh equals target. (2) Any surplus/over state clears. (3) The new tare value is the one recorded at confirmation. (4) Re-tare never affects confirmed components.
- **Priority**: Must
- **Sources**: IR-12, FR-19, UI: "Re-tare F2", WB: Step 30
- **Related Stories**: 004/011, 006/007

### FR-24: Quit and resume
- **Description**: **Quit (F4)** safely exits the weighing in progress: after confirmation by the operator, the unconfirmed weighing of the active component is abandoned (nothing recorded for it), the operator returns to the batch queue, and the batch stays WEIGHING with all confirmed components preserved. Re-selecting the batch — or reloading the application — resumes at the next not-done component.
- **Acceptance Criteria**: (1) Quit asks for confirmation. (2) After Quit, no record exists for the abandoned component; confirmed records are unchanged. (3) An ABANDON audit event is written. (4) Re-selecting the batch shows the same done components and resumes. (5) Reloading the browser mid-batch resumes at the in-progress component (NFR-6).
- **Priority**: Must
- **Sources**: FR-19, NFR-06, UI: "Quit F4", WB: Step 30 "Quit → Safe exit"
- **Related Stories**: 004/002, 004/012, 006/007

### Progression and completion

### FR-25: Component progression
- **Description**: After a component is confirmed, it becomes done and the next pending component in recipe sequence becomes active automatically (scale, units and readouts switch accordingly). For B-24187: Blue RSPL → Red RB → Yellow RGB → Sodium Sulphate → Soda Ash.
- **Acceptance Criteria**: (1) A component can only become done via a valid confirmation (FR-18) or authorised override (FR-22). (2) Confirming a component activates the next pending one. (3) Confirming the last pending component leads to batch completion (FR-26).
- **Priority**: Must
- **Sources**: FR-06, BR-07, UI: `btn-ok` handler, WB: Step 23
- **Related Stories**: 004/010, 006/004

### FR-26: Batch completion
- **Description**: When all components are done, the batch is complete and the **Confirm & print** screen shows: "Batch {id} weighed", Components weighed {n} of {n}, All within tolerance YES/NO, Total dispensed (sum of actuals converted to kg, 3 decimals), Elapsed (session time), Operator, and the OrgaTEX write-back status.
- **Acceptance Criteria**: (1) The batch cannot be completed while any component is not done — UI and server (422 `BATCH_INCOMPLETE`). (2) "All within tolerance" is NO if any record is OVERRIDDEN (or per Step 24 rule). (3) Total dispensed is the decimal sum of actuals in kg. (4) Batch status moves to WEIGHED.
- **Priority**: Must
- **Sources**: BR-11, IR-06, UI: done view, WB: Steps 23, 26, 30
- **Related Stories**: 001/004, 004/010, 005/003, 006/011

### FR-27: OrgaTEX consumption write-back
- **Description**: On batch completion, WeighingMS posts the actual consumption per component (dyestuff, lot, actual quantity and unit, target, result) to OrgaTEX against the batch, with an idempotency key. On success the screen shows "Written to OrgaTEX **CONFIRMED** {hh:mm:ss}" and "Actual consumption posted against the batch. Container released for transport to {machine}."
- **Acceptance Criteria**: (1) `POST /api/batches/B-24187/consumption` returns 200 and Dummy OrgaTEX stores one consumption record with all five components. (2) The stored record can be shown (WB: Step 26 evidence). (3) Re-sending with the same idempotency key does not create a second record. (4) The batch's OrgaTEX status becomes WEIGHED.
- **Priority**: Must
- **Sources**: FR-26, BR-12, IR-05, IR-06, IR-08, AC-08, A-02, UI: "Written to OrgaTEX CONFIRMED", WB: Step 26
- **Related Stories**: 001/004, 005/001, 006/011

### FR-28: Write-back hold and retry
- **Description**: If OrgaTEX is unreachable or rejects the posting, the batch remains complete locally, the write-back is held **PENDING**, and the screen shows "Written to OrgaTEX **PENDING**" with a **Retry** action. The status bar shows ORGATEX as offline and the count of pending write-backs. Retry re-sends with the same idempotency key.
- **Acceptance Criteria**: (1) With Dummy OrgaTEX offline, completing B-24187 shows PENDING; no weighing data is lost. (2) Pending count ≥ 1 is visible. (3) After OrgaTEX is back, Retry produces CONFIRMED and exactly one consumption record. (4) Ticket printing is not blocked by a pending write-back.
- **Priority**: Must
- **Sources**: BR-16, BR-17, BR-18, A-03, Q13, UI: pin 11, WB: Step 30 "OrgaTEX unavailable → Defined behaviour", TD-1
- **Related Stories**: 001/004, 001/005, 005/002, 006/011

### FR-29: Ticket generation and print / preview
- **Description**: **Print ticket (F1)** generates the weighing ticket and sends it to the printer, showing a preview. Ticket content (prototype layout): "FCI DYEING — WEIGHING TICKET"; BATCH, ORDER, MACHINE, SHADE, DATE, OPER.; per component: short name, TGT, ACT, unit; tolerance verdict ("ALL WITHIN TOLERANCE" or the exceptions); barcode of the batch ID.
- **Acceptance Criteria**: (1) `POST /api/tickets` returns the ticket and the printer accepts it. (2) For B-24187 the ticket lists all five components with target and actual, the operator and the date/time of completion. (3) The barcode encodes the batch ID. (4) The preview matches the printed content.
- **Priority**: Must
- **Sources**: FR-27, BR-15, IR-16, A-04, Q18, UI: `.ticket`, WB: Step 27
- **Related Stories**: 002/007, 005/004, 006/011

### FR-30: Ticket reprint
- **Description**: A ticket can be reprinted from the Confirm & print screen; the reprint is visibly marked "REPRINT" and the reprint is audited.
- **Acceptance Criteria**: (1) Reprint produces the same content plus a "REPRINT" marking. (2) A REPRINT audit event records operator and time.
- **Priority**: Should
- **Sources**: FR-28, TD-4
- **Related Stories**: 002/007, 005/006, 006/011

### FR-31: Next batch
- **Description**: **Next batch (F3)** returns to the batch queue; the completed batch shows its updated status.
- **Acceptance Criteria**: (1) The queue is re-fetched from the API. (2) B-24187 shows WEIGHED and is no longer selectable for weighing.
- **Priority**: Must
- **Sources**: UI: "Next batch F3"
- **Related Stories**: 006/011

### Peripherals, failures and traceability

### FR-32: Peripheral and connection status bar
- **Description**: A status bar continuously shows: each scale ("SCALE 3 kg · READY" / OFFLINE / CAL EXPIRED), SCANNER (ready/offline), PRINTER (ready/offline/out of paper), ORGATEX ("LINKED hh:mm" / OFFLINE, pending write-back count), interface language (EN) and the station clock. The top bar shows "WeighingMS STATION 01".
- **Acceptance Criteria**: (1) Each indicator reflects the corresponding dummy's state within 2 s of a change. (2) Every non-ready state has text, not only colour.
- **Priority**: Must
- **Sources**: IR-18, FR-32, UI: status bar and top bar
- **Related Stories**: 001/003, 002/001, 006/001

### FR-33: Scale unavailable
- **Description**: If the selected scale disconnects or stops responding, the station enters a safe state: the readout shows the scale as unavailable, confirmation is disabled, and the reason is shown. When the scale returns, weighing continues (a re-tare is required).
- **Acceptance Criteria**: (1) Disconnection is detected within 2 s (IR-13). (2) OK is disabled and the server rejects confirmation (503 `SCALE_UNAVAILABLE`). (3) No weighing is recorded during the outage; confirmed records are unaffected. (4) On reconnection the operator can re-tare and continue.
- **Priority**: Must
- **Sources**: IR-13, AC-04, WB: Step 30 "Scale unavailable → Safe failure"
- **Related Stories**: 002/005, 006/008

### FR-34: Scanner unavailable
- **Description**: If the scanner is unavailable, every scan input (badge, batch, dyestuff, lot, container) can be entered by typing, and the status bar shows SCANNER offline.
- **Acceptance Criteria**: (1) With the Dummy Scanner offline, the B-24187 flow can still be completed using typed entry. (2) Typed entries are validated exactly like scans.
- **Priority**: Must
- **Sources**: IR-15, R-08, WB: Steps 16, 30
- **Related Stories**: 002/006, 006/006

### FR-35: Printer unavailable
- **Description**: If the printer is unavailable when printing, the ticket is still generated and stored, the preview is shown, "Printer unavailable" is displayed, and the operator can retry printing. Batch completion and write-back are not affected.
- **Acceptance Criteria**: (1) With the Dummy Printer offline, Print ticket shows a defined error and a Retry action; the ticket preview remains available. (2) After the printer returns, Retry prints the same ticket (not marked as reprint). (3) No batch or weighing data changes.
- **Priority**: Must
- **Sources**: IR-16, IR-18, WB: Step 30 "Printer unavailable → Defined behaviour"
- **Related Stories**: 002/007, 004/006, 005/005, 006/011

### FR-36: OrgaTEX unavailable when loading
- **Description**: If OrgaTEX is unreachable when loading the queue or a recipe, the station shows a defined message ("OrgaTEX not reachable") with a **Retry** action instead of empty or stale data; ORGATEX shows OFFLINE in the status bar. A batch already in progress continues (its recipe is already held by the session).
- **Acceptance Criteria**: (1) Queue load with Dummy OrgaTEX offline shows the message and Retry, not an empty queue. (2) Retry after OrgaTEX returns shows the queue. (3) An in-progress batch can be weighed to completion while OrgaTEX is offline (write-back then follows FR-28).
- **Priority**: Must
- **Sources**: BR-16, NFR-03, A-03, TD-1, WB: Step 30
- **Related Stories**: 001/005, 003/004, 006/003

### FR-37: Audit trail
- **Description**: Every privileged or exceptional action writes an immutable audit event with actor, type, detail and timestamp: OVERRIDE, SCALE_RESELECT, ABANDON (quit), REPRINT, WRITEBACK_RETRY.
- **Acceptance Criteria**: (1) Each listed action produces exactly one audit event. (2) Audit events cannot be modified or deleted via any endpoint. (3) Audit events are retrievable via the API for evidence.
- **Priority**: Must
- **Sources**: FR-36, BR-13, NFR-13, §9.2 AUDIT_EVENT
- **Related Stories**: 004/006, 004/013, 004/015

---

## Non-Functional Requirements

Project-wide standards (`memory-bank/standards/`) are not repeated; only intent-specific targets are listed.

### Performance

| ID | Requirement | Metric | Target | Source |
|----|-------------|--------|--------|--------|
| NFR-1 | Live weight responsiveness | Polling rate / display lag behind Dummy Scale state | ≥ 10 Hz / ≤ 200 ms on localhost | NFR-01, IR-10 |
| NFR-2 | Recipe display | Time from batch selection to recipe shown (OrgaTEX reachable) | ≤ 3 s | NFR-02, AC-01 |
| NFR-3 | Disconnection detection | Time from scale/peripheral loss to visible unavailable state | ≤ 2 s | IR-13 |

### Reliability and data integrity

| ID | Requirement | Target | Source |
|----|-------------|--------|--------|
| NFR-4 | Quantity arithmetic | Decimal arithmetic for every quantity; no floating-point results in records, API payloads or displays | NFR-16 |
| NFR-5 | Durability | A confirmed weighing is committed to disk before the UI shows it as done | NFR-05 |
| NFR-6 | Resume | After browser reload or server restart, an in-progress batch resumes at the in-progress component with all confirmed components intact | NFR-06 |
| NFR-7 | Idempotent write-back | Repeated consumption posts with the same key produce exactly one OrgaTEX record | IR-08 |
| NFR-8 | Immutability | Weighing records, overrides and audit events are append-only; corrections are new records | DR-02, NFR-13 |
| NFR-9 | Snapshotting | Target and tolerance limits are copied onto each weighing record at confirmation | §9.2 |

### Usability

| ID | Requirement | Target | Source |
|----|-------------|--------|--------|
| NFR-10 | Glove operation | Action keys ≥ 62 × 150 px; every touch target ≥ 15 mm | NFR-07, UI: `.key` |
| NFR-11 | Legibility | Live weight ≥ 52 px tabular monospace; other readouts ≥ 30 px | NFR-08, UI: `.cell` |
| NFR-12 | Keyboard / 21-key terminal | Every action reachable by keyboard; F1 OK/Print ticket, F2 Re-tare, F3 Next batch, F4 Quit | IR-17, UI: key labels |
| NFR-13 | Language | All operator text in English from one externalised catalogue | NFR-11, A-10, TD-11 |

### Security

| ID | Requirement | Target | Source |
|----|-------------|--------|--------|
| NFR-14 | Privileged actions | Override and scale reselection require a supervisor PIN verified server-side (stored hashed); operators cannot authorise; PINs never logged; `/ext/*/_sim` disabled outside development/test | FR-35, NFR-12 |

### Testability (acceptance evidence)

All Must requirements are covered by automated tests per `coding-standards.md`; in particular: tolerance boundaries (FR-17/18), scale selection (FR-11), progression and completion guard (FR-25/26), write-back and idempotency (FR-27/28), ticket content (FR-29), and the failure scenarios FR-33–FR-36, FR-23, FR-24 via Playwright (WB: Steps 22, 29, 30).

### Not applicable to this training build

Scalability (single station, single user), availability SLAs (NFR-04), environmental ratings (NFR-10), capacity (NFR-15), retention period (DR-01) — recorded as product requirements of the real system, not testable here.

---

## Training Decisions (assumptions for this build)

Each is **unconfirmed by FCI** and replaceable when FCI answers the linked question.

| ID | Decision | Why / source | Linked question | Decided by |
|----|----------|--------------|-----------------|------------|
| TD-1 | OrgaTEX unreachable: weighing never blocked; write-back held PENDING with manual Retry and pending count; idempotent. No background sync engine | Brief prefers continuity (BR-16–18); full sync deferred | Q13 / A-03 | User, Step 7 |
| TD-2 | Scale selection: smallest-capacity available, calibrated scale whose capacity ≥ target + tolerance + container tare | Reproduces prototype assignments; brief gives no threshold | Q15 / A-06 | User, Step 7 |
| TD-3 | Dyestuff identity verified by scan before weighing unlocks; lot and container default from data and can be changed by scan; typed entry always allowed | Brief FR-09/BR-10; prototype shows pre-filled values | Q19, Q28, Q29 / A-10 | User, Step 7 |
| TD-4 | Include ticket reprint (FR-30) and calibration status (FR-13); defer batch history (FR-29 brief) and supervisor remote view (BR-22) | Small, fit existing prototype screens | Q20, Q30, Q32 | User (recommended), Step 7 |
| TD-5 | Tolerance is an absolute ± per component supplied with the recipe; band boundaries inclusive | Prototype data (e.g. 94.0 g ±0.5 g) and workbook boundary cases; brief's A-07 (percentage with floor) not adopted | Q24 / A-07 | Sources (prototype + workbook) |
| TD-6 | Operator identified by badge ID; supervisor authorises with PIN; only supervisors may override or reselect scales | Brief FR-34/35; training-grade security | Q33, Q37 / A-09 | Standards (tech-stack) |
| TD-7 | Seed statuses: B-24187 and B-24188 RELEASED; B-24190 and B-24191 QUEUED (not released). Prototype shows B-24187 as WEIGHING only because it is mid-scenario | Lets the full 5-component flow start from zero and demonstrates FR-4 | — | Agent proposal |
| TD-8 | One container per component (prototype); tare taken automatically when weighing unlocks; recorded tare = scale tare applied | Prototype shows per-component container and tare | Q29 | Agent proposal |
| TD-9 | Confirmation requires a stable reading | Brief IR-11 distinguishes settling from settled | Q16 / A-05 | Agent proposal |
| TD-10 | **Overshoot rule (Step 24, Option A):** an over-dosed component stays unconfirmed; recovery is removing the excess or Re-tare; supervisor override allowed for any out-of-tolerance weight > 0; surplus measured from the **target**; **no recipe recalculation** (prototype proposal not adopted) | Brief: "most likely misunderstanding"; ui-analysis Q-UI-3/4/5 | Q25, Q26 / A-08 | **Decided — user, 2026-10-26** (`STEP-24-overshoot-decision.md`) |
| TD-11 | English only; all strings externalised | Brief A-10 assumes English | Q35 | Standards (ux-guide) |
| TD-12 | Display precision: g → 1 decimal, kg → 3 decimals; progress bar full-scale per component from recipe data (prototype values) | Prototype `dp()` and `max` values | — | Sources (prototype) |
| TD-13 | Default order is recipe sequence; operator may activate another pending component (prototype behaviour) | Prototype `select()` | — | Sources (prototype) |
| TD-14 | Quit = abandon the unconfirmed component weighing and return to the queue; batch stays WEIGHING and is resumable | Workbook "Quit → Safe exit"; brief FR-19, NFR-06 | — | Agent proposal |
| TD-15 | Override available whenever the weight is outside tolerance and > 0 (under or over), subject to the Step 24 rule | Brief BR-07 ("outside its tolerance") | Q33 | Agent proposal |

---

## Training-only Dummy Behaviour

Exists only because the real systems are unavailable. **These are training contracts, not real OrgaTEX or device interfaces.** All dummy data lives in the dummy systems' seed data, never in the UI.

### DB-1: Dummy OrgaTEX — data
- Seeds four batches from the prototype: B-24187 (SO-9931, JET-04, "100% CTN knit · 480 kg", Teal 4C, 5 comp.), B-24188 (SO-9931, JET-07, "100% CTN knit · 520 kg", Teal 4C, 5), B-24190 (SO-9944, JET-02, "CVC fleece · 310 kg", Navy 12, 7), B-24191 (SO-9947, WINCH-01, "Viscose jersey · 190 kg", Rose 08, 4), statuses per TD-7.
- Recipe Teal 4C with the five prototype components (name, code, colour, target, unit, tolerance, bar full-scale) and suggested lots (2026-0341, 2026-0298, 2026-0387, 2026-0112, 2026-0155). Recipes for Navy 12 and Rose 08 are not in the prototype; those batches are QUEUED and need no recipe.
- Stores received consumption postings keyed by idempotency key; moves batch status RELEASED → WEIGHING → WEIGHED.

### DB-2: Dummy Scale
- Two scales: `scale-3kg` (precision, 3 kg) and `scale-32kg` (floor, 32 kg), with resolution and calibration due dates (valid in seed).
- Holds simulated gross weight and tare per scale server-side; reports net weight, `stable` (true once unchanged for ≥ 500 ms), `connected`.
- When weighing is unlocked, the container is considered placed (gross = container tare) so the tare command zeroes it.

### DB-3: Dummy Scanner
- Accepts injected scans (badge, batch, dyestuff, lot, container) and delivers them to the station; can be set offline.

### DB-4: Dummy Printer
- Accepts tickets, stores them, returns a printable preview; states READY / OFFLINE / OUT_OF_PAPER.

### DB-5: Station master data (WeighingMS training seed)
- Operator R. Karim (Shift A) and one supervisor with PIN; containers C-09, C-11, C-12 (tare 214 g) and D-03, D-05 (tare 1.850 kg) with the prototype's default component→container mapping. (Owned by WeighingMS per brief §9.3, but seeded for training.)

### DB-6: Simulation controls
- `/ext/{system}/_sim/...` controls (development/test only): set exact weight; **simulate dispense** (easing towards a landing weight inside tolerance — prototype: target + 0.4 × tol); **simulate overshoot** (prototype: target + 4.8 × tol); scale disconnect/reconnect; expire calibration; scanner/printer/OrgaTEX offline; inject scans; reset scenario.

### DB-7: Training Panel
- A separate, clearly labelled page exposing DB-6 controls for demonstrations (replaces the prototype's controls bar). Never part of the operator screen; not used by WeighingMS application logic.

---

## Constraints

### Technical constraints

**Project-wide standards**: loaded from `memory-bank/standards/` by the Construction Agent.

Intent-specific:

- The UI obtains all scenario data through APIs; no batch/recipe data hard-coded in UI components (workbook Rule 5).
- The prototype's JavaScript is a behavioural reference only; it is not copied (workbook Step 20).
- Dummy API contracts must not be presented as real OrgaTEX/device contracts.

### Business constraints

- C-01: OrgaTEX remains the single source of truth for batches and recipes.
- C-02: No modification of OrgaTEX.
- C-03: No connection to or control of dispensing machinery.
- C-05: The interface must not assume high computer literacy.
- Every unresolved question is asked, recorded and decided explicitly — never silently invented (workbook Rule 2).

---

## Assumptions

All business content in `docs/brief.md` is **unconfirmed by FCI**. This intent carries the brief's assumption register (A-01 … A-15, brief §12). Training decisions above (TD-1 … TD-15) state how each relevant assumption is handled in this build. Severe/high assumptions:

| ID | Assumption | Risk if invalid | Mitigation in this intent |
|----|------------|-----------------|---------------------------|
| A-01 | OrgaTEX exposes a documented REST API | Severe — premise fails / technology differs | All OrgaTEX access confined to one adapter; Dummy OrgaTEX is a training contract only |
| A-02 | OrgaTEX accepts consumption write-back | Severe — BO-04 unachievable | Write-back behind the adapter; held locally (TD-1) |
| A-05 | Scales stream weight continuously with a stability flag | Severe — guided weighing redesign | Dummy Scale simulates continuous weight with `stable`/`connected` |
| A-08 | Surplus compensation = proportional recalculation | High | **Resolved at Step 24 (TD-10): not adopted** |
| A-13 | Today's process is paper-based | High — business case | Recorded only; not a build dependency |

---

## Open Questions

Still unresolved after Step 7. The BRD refers to **41 open questions** in the original brief (§9); that list is **not included** in `docs/brief.md`, so questions are known through the assumptions and prototype pins.

| # | Question | Source | Handling in this build | Status |
|---|----------|--------|------------------------|--------|
| Q25–Q26 | What does "surplus compensation" mean; what if an overdose cannot be compensated? | Pin 25, A-08 | **Decided at Step 24** (TD-10) | **Resolved for training; real FCI meaning still unconfirmed** |
| Q6–Q10 | Does an OrgaTEX interface exist; technology; what data? | Pins 6, 10, A-01 | Dummy OrgaTEX | Open (FCI) |
| Q11–Q12 | Can OrgaTEX accept consumption and status write-back? | Pin 11, A-02 | Dummy OrgaTEX | Open (FCI) |
| Q13 | Continue during OrgaTEX outage? | Pin 11, A-03 | TD-1 | Open (FCI) — training decision made |
| Q15 | Scale models, protocol, auto-selection threshold | Pin 15, A-06 | TD-2 | Open (FCI) — training decision made |
| Q16 | Continuous or stabilised-only weight? | Pin 16, A-05 | Dummy Scale continuous; TD-9 | Open (FCI) |
| Q18 | Ticket printer and label content | Pin 18, A-04 | Prototype ticket ("Label content is invented") | Open (FCI) |
| Q19 | Are dyestuffs barcoded? | A-10 | TD-3 (typed fallback) | Open (FCI) |
| Q20 | How is calibration status known? | A-06 | FR-13 with dummy data | Open (FCI) |
| Q24 | How are tolerances defined, by whom, from OrgaTEX? | Pin 24, A-07 | TD-5 | Open (FCI) — training decision made |
| Q28–Q29 | Lot capture; container identity and tare | Pin 29, A-09 | TD-3, TD-8 | Open (FCI) — training decision made |
| Q33 | Who may override, logging, approval | Pin 33 | TD-6, TD-15 | Open (FCI) — training decision made |
| Q35 | Interface language | Pin 35, A-10 | TD-11 | Open (FCI) — training decision made |
| Q37 | Operator login and traceability | Pin 37, A-09 | TD-6 | Open (FCI) — training decision made |
| Q21, Q23, Q1–Q5, Q30, Q32 | Volume; liquids; as-is process; baselines; supervisor view/reporting | §12 | Not needed for training build | Open (FCI) |

---

## Traceability: workbook requirement areas → requirements

| # | Workbook area | Requirements |
|---|---------------|--------------|
| 1 | Batch queue | FR-2, FR-36 |
| 2 | Batch selection | FR-3, FR-4 |
| 3 | Recipe loading | FR-5 |
| 4 | Component identification | FR-6, FR-7 |
| 5 | Dyestuff lot | FR-8 |
| 6 | Container | FR-9 |
| 7 | Tare | FR-10, FR-23 |
| 8 | Scale selection | FR-11, FR-12, FR-13 |
| 9 | Live weight | FR-14, NFR-1 |
| 10 | Target quantity | FR-15 |
| 11 | Remaining quantity | FR-15, FR-16 |
| 12 | Tolerance | FR-16, FR-17 |
| 13 | Confirmation | FR-18, FR-19, FR-22 |
| 14 | Overshoot | FR-20, FR-21, FR-22 |
| 15 | Component progression | FR-6, FR-25 |
| 16 | Batch completion | FR-26, FR-31 |
| 17 | OrgaTEX write-back | FR-27, FR-28 |
| 18 | Ticket generation | FR-29, FR-30 |
| 19 | Operator traceability | FR-1, FR-19, FR-37 |
| 20 | Scale / scanner / printer failure | FR-32, FR-33, FR-34, FR-35, FR-36 |

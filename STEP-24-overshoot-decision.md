# STEP 24 — Overshoot decision

Decided by the user on 2026-10-26. Recorded as **TD-10** in `memory-bank/intents/001-assisted-weighing-station/requirements.md`.

## Observed problem

The prototype shows "Surplus +2.4 g (+2.6%) — over tolerance" for 96.4 g against a 94.0 g target, and proposes recalculating the remaining components "to preserve the shade ratio". Two findings from the UI analysis make that proposal unsafe to copy:

- **Q-UI-3** — the prototype measures surplus from the target; the brief's glossary says "above the tolerance maximum".
- **Q-UI-4** — the proposal scales only the auxiliaries by the dye's surplus %, leaving the already-weighed dyes unchanged, so the dye-to-dye ratio is **not** preserved.
- **Q-UI-5 / Q26** — nothing says what happens when an overdose cannot be compensated (last component, or capacity exceeded).
- What FCI actually means by "surplus compensation" (Q25) is unknown.

## Options considered

| Option | Rule | Impact |
| --- | --- | --- |
| **A (chosen)** | Block; recover by removing the excess or Re-tare; supervisor override; no recalculation | Smallest change; recipe stays as received; overdoses cost time or a supervisor |
| B | A plus a display-only "would become" preview | More UI; depends on Q-UI-4; may be read as an instruction |
| C | Apply the prototype's proportional recalculation | Recipe snapshot diverges from OrgaTEX; shade may be wrong; needs new rules, ADRs and an approval flow |

## Business rule (training implementation)

1. An over-dosed component **remains unconfirmed**. OK stays disabled while the weight is above the tolerance band; the server refuses a confirm with TOLERANCE_VIOLATION.
2. The operator recovers by **removing the excess** until the weight is within tolerance, or by **Re-tare** to restart the component.
3. A **supervisor may override** any out-of-tolerance weight above zero (under, near or over) with a valid supervisor PIN and a mandatory reason (FR-22). The record is OVERRIDDEN, keeps the surplus when over, and an OVERRIDE audit event is written.
4. **Surplus is measured from the target**: weight − target, and that as a percentage of the target to one decimal (the `surplus()` rule already in `src/shared/domain/tolerance.ts`). The brief's "above the maximum" wording is noted, not adopted.
5. **No automatic recipe recalculation** is performed. No remaining component's target changes because of an overdose. Nothing in this rule can be "uncompensatable".
6. The surplus panel shows the surplus and the three recovery actions only, with no compensation table.

## Implementation

Observed problem → business rule (above) → implementation in bolt 012 (override and surplus on the record) and bolt 013 (surplus panel, supervisor dialog) → test (`STEP-24-overshoot-test`).

## Still unconfirmed with FCI

The real meaning of "surplus compensation" (Q25, Q26) is not confirmed; this rule is a safe training implementation and can be replaced once FCI states its rule.

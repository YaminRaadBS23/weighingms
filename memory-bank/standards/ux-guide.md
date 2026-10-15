# UX Guide

## Overview

UI/UX standards for the WeighingMS station UI. The supplied prototype `docs/customize-weighing-station.html` is the visual and interaction reference: the product reproduces its **HMI screen** faithfully, while the surrounding mockup material is either dropped or relocated.

### What is reproduced from the prototype

| Prototype element | Treatment in the product |
|-------------------|--------------------------|
| HMI screen: top bar, views `queue` (1 · Select batch), `weigh` (2 · Weigh), `done` (3 · Confirm & print), recipe rail, readout cells, progress bar with tolerance band, action keys, ticket | **Reproduced** — same layout, tokens, labels, units and states |
| Page masthead, standfirst, draft flag, explanatory notes (3), numbered annotation pins (14) | **Not reproduced.** Their business questions are carried into Requirements / open questions |
| Controls bar (view switching, scenario simulation) | **Relocated** to a separate, clearly labelled **Training Panel** that drives the Dummy systems via `/ext/*/_sim/...` (see `api-conventions.md`); never part of the operator screen |
| Device bezel ("15″ industrial touch terminal") | **Not reproduced.** The application is the terminal and fills the viewport |

The prototype's JavaScript is a reference for behaviour only; it is not copied (workbook Step 20).

## Design System / Component Library

**No third-party component library.** A small in-house React component set mirroring the prototype's elements, e.g.:

`TopBar`, `OperatorChip`, `BatchQueue`, `ComponentRail`, `ComponentRow`, `ScaleBadge`, `Readout` / `ReadoutCell`, `ToleranceBar`, `Key` (action key with function-key label), `StatusMessage`, `Ticket`, `Barcode`.

Components live under `src/web/shared/` (shared) or the owning screen folder (screen-specific).

## Styling Approach

**Plain CSS with CSS custom properties + CSS Modules** per component. No Tailwind, no CSS-in-JS.

Design tokens are taken from the prototype's `:root` and defined once in a global stylesheet:

| Token | Value | Meaning |
|-------|-------|---------|
| `--hmi-bezel` | `#0a0d11` | Outermost background |
| `--hmi-bg` | `#12161c` | Screen background |
| `--hmi-panel` | `#1a2029` | Panels, top bar, readout cells |
| `--hmi-panel-2` | `#212936` | Active row / raised panel |
| `--hmi-line` | `#2c3644` | Dividers, borders |
| `--hmi-ink` | `#e9eef4` | Primary text |
| `--hmi-muted` | `#8998a9` | Secondary text |
| `--hmi-dim` | `#63717f` | Labels, tertiary text |
| `--ok` | `#2fbf6b` | Inside tolerance, done, confirm |
| `--warn` | `#f0a726` | Active component, approaching target |
| `--over` | `#e8503a` | Over tolerance / error |
| `--steel` | `#5b8cc4` | Scale information |
| `--mono` | `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace` | Numbers, codes, IDs |
| `--sans` | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | Labels and text |

- **The operator screen is always dark**, regardless of OS theme — it represents a physical HMI panel (as the prototype specifies).
- The Training Panel may use the prototype's light/dark `--page-*` tokens to make it visibly distinct from the operator screen.
- No hard-coded colours in components; use tokens.

### State colour semantics

| State | Colour | Always paired with text |
|-------|--------|-------------------------|
| Active component / approaching target | `--warn` | `ACTIVE`, progress zone "near" |
| Inside tolerance / complete | `--ok` | `OK`, `DONE` |
| Over tolerance / failure | `--over` | `OVER`, error message |
| Pending | `--hmi-dim` | `PENDING` |
| Scale information | `--steel` | Scale name and capacity |

Colour is never the only signal of state.

## Accessibility Standards

- **Glove operation (brief NFR-07):** action keys minimum **62 px high × 150 px wide** (prototype `.key`); every interactive target at least 15 mm (≈57 px at 96 dpi); recipe rows at least 56 px high; adequate spacing (≥12 px) between keys.
- **Legibility at 1.5 m (brief NFR-08):** live weight in `--mono`, tabular numerals, **≥52 px**; other readouts ≥30 px. Numeric values use `font-variant-numeric: tabular-nums` so digits do not shift.
- **Keyboard / 21-key terminal (brief IR-17):** every touch action is reachable by keyboard; action keys display their function-key label (as in the prototype); logical focus order; visible focus ring (`2px` outline).
- **Semantics:** native `<button>` for actions; ARIA labels as in the prototype (`Screen`, `Weighing progress`); progress bar exposes value, target and tolerance band to assistive tech; status changes announced via a polite live region.
- **Contrast:** WCAG 2.1 AA on the dark palette.
- **Disabled actions** are visibly disabled (prototype: reduced opacity, `not-allowed` cursor) and the reason is shown in text (e.g. "Below tolerance — keep dispensing").

## Responsive Design Strategy

- **Target device:** 15″ landscape industrial touch terminal; design for **1024×768 and larger** first.
- Keep the prototype's breakpoints: recipe rail + weighing stage stack to one column below **860 px**; readout cells stack below **700 px**.
- Phone layouts are out of scope.

## Text and Localisation

- All operator-facing strings live in a single English message catalogue (brief NFR-11, A-10); no literal UI strings in components.
- Labels, units and wording follow the prototype (e.g. "Weighed now", "Still to weigh", "Target", "Re-tare", "Quit", "Supervisor override") and the brief glossary.
- Quantities are always shown with their unit; display precision follows the scale resolution.

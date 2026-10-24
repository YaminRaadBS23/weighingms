---
bolt: 009-weighing-station
created: 2026-10-24T11:28:06Z
status: accepted
superseded_by: null
---

# ADR-4: The Dummy Scale places the expected container when asked to tare

## Context

Unlocking a component tares the selected scale **with the container in place** so that "Weighed now" starts at 0 (FR-10, TD-8). On a real scale the operator puts the container on the platform. The Dummy Scale has no hands: DB-2 says the container is "considered placed" when weighing unlocks. The only existing way to put something on the simulated platform is the `/ext/scale/_sim/:scaleId/container` control, which belongs to the Training Panel — the application must never call `_sim` (api-conventions: `_sim` is dev/test only). Without a decision, the unlock flow would tare an empty platform, and the container's weight would then show up as +214.0 g of "weighed" dyestuff.

## Decision

`ScalePort.tare(scaleId, { containerTare })` carries the container's expected tare. The **Dummy Scale's** `POST /ext/scale/:scaleId/tare` accepts an optional `containerWeight` in its body. It first places a container of that weight and then tares — **unless something has been put on the platform since the last tare** (net weight not zero, for example a container or a trainer's setup placed through the Training Panel), in which case it tares as it is. A container left from the previous component counts as removed, because the operator changes containers between components. This is documented as a training behaviour of the Dummy Scale contract. The real-scale adapter would send no placement request and may compare the tare it reads with `containerTare`. The application logs (does not block on) a difference between expected and applied tare.

## Rationale

It keeps the whole operator flow demonstrable without the Training Panel, keeps `_sim` out of application code, and confines the invention to the simulator whose purpose is to imitate hardware. The "unless something was added since the last tare" rule means a deliberately placed container (or a trainer's `_sim` setup, such as a wrong container) is respected, while the previous component's container never leaks into the next tare.

*Refinement during implementation (bolt 009, Stage 4):* the first wording said "only if the platform is empty (gross = 0)". A manual check showed that a drum still "on" the 32 kg scale from the previous component made the next unlock tare the drum instead of the new container; the rule was widened as above.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| The application calls `_sim/container` | No contract change | Application depends on a training-only route that is absent in production; breaks the facade rule | Violates the standard |
| An extra "place container" step in the operator UI | Mirrors the physical act | Not in the prototype flow; slows the demonstration; the physical act is not observable by the system anyway | Not in the reproduced UI |
| Tare an empty platform, show container weight as net | No contract change | Wrong weight displayed; defeats TD-8 | Incorrect behaviour |
| Dummy places the container on every tare | Simple | Would hide a trainer's "wrong container" scenario | Less faithful |
| Dummy places it only when the platform is completely empty (first wording) | Respects anything on the platform | A previous component's container is never removed in the simulator, so the next tare is wrong | Found wrong in the manual check |

## Consequences

### Positive

- The unlock demo works end to end with only the normal APIs.
- The simulator contract change is small, optional and backwards compatible (a body-less tare behaves as before).

### Negative

- The Dummy Scale does something a real scale cannot; a real adapter must verify the physical container differently.
- The tare port gains an options parameter used only by this flow.

### Risks

- If a real scale integration reads a different tare from the expected one, the non-blocking log is too weak; a later bolt may turn it into a refusal.

## Related

- **Stories**: `004-weighing-station/004-verify-dyestuff-identity-and-unlock`; `002-device-integration/003-tare-command`
- **Requirements**: FR-9, FR-10, TD-8, DB-2
- **Standards**: `api-conventions.md` (`_sim` dev/test only)
- **Previous ADRs**: none

---
bolt: 006-weighing-station
created: 2026-10-16T08:41:17Z
status: accepted
superseded_by: null
---

# ADR-2: Keep the signed-in operator as server-side station state

## Context

Every weighing must be attributable to an identified operator (brief BR-19, FR-34; requirements FR-1). The training product runs one station (`STN-01`) with one local station UI, served by a single process bound to `127.0.0.1` (`system-architecture.md`). Operators identify by badge; real authentication (SSO, directory) is an open question (A-09, Q37). We need to decide where "who is signed in" lives: in the browser (a token or cookie per client) or on the server (per station).

## Decision

The signed-in operator is **station state on the server** (`station_state` table: station, current operator, signed-in time). Signing in by badge sets it; signing out clears it; starting a session reads it and stamps the session with that operator. There are no browser tokens or cookies.

## Rationale

The thing being weighed at is the **station**, not a browser tab: the operator at the terminal is the operator for that station, and the UI may reload at any time (NFR-6) without losing who is signed in. With one local client and a loopback-only server, tokens would add machinery (issue, expiry, storage) without adding protection. Keeping it server-side also makes it visible to every module (weighing, completion) without passing credentials around.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Browser session cookie / JWT per client | Standard for multi-client web apps; supports several terminals | Token lifecycle to build; state lost on cookie clear; still needs a station↔operator link | Not needed for one local station |
| Operator passed with every request | Stateless server | Every client call must carry and trust an operator ID; easy to spoof or forget | Weak attribution |
| Server-side station state (chosen) | Simple; survives UI reloads; one source of truth for attribution | Assumes one client per station; anyone on the machine can call the API | Accepted for training |

## Consequences

### Positive

- Attribution is consistent across all modules and survives reloads and restarts.
- No token infrastructure in the training product.

### Negative

- Not suitable as-is for several terminals per station or remote clients.
- No protection against another local process calling the API (acceptable: loopback only, training).

### Risks

- If multi-station or remote access is added (A-11), this must be replaced by per-client authentication bound to a station → revisit this ADR at that point.

## Related

- **Stories**: `004-weighing-station/001-operator-sign-in`, `002-start-or-resume-weighing-session`
- **Requirements**: FR-1, FR-35 (supervisor authority uses PINs on top of this), NFR-14, TD-6
- **Standards**: `system-architecture.md` (security patterns)
- **Previous ADRs**: none

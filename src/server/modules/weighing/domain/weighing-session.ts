/**
 * WeighingSession — aggregate root of the weighing context: one batch being weighed at a station.
 *
 * Invariants (ddd-01-domain-model.md):
 *  (1) one ComponentWeighing per recipe line, same sequences as the snapshot;
 *  (2) while IN_PROGRESS and not all components DONE, exactly one component is ACTIVE;
 *  (3) a new session starts with the lowest-sequence component ACTIVE;
 *  (4) only a PENDING component can be activated; the previously ACTIVE one returns to PENDING
 *      and loses its unconfirmed weighing; activating the ACTIVE one is a no-op;
 *  (5) a DONE component never changes state;
 *  (6) the recipe snapshot never changes;
 *  (7) component actions only while IN_PROGRESS;
 *  (8) an ACTIVE component carries a scale assignment (possibly "none") and its preparation;
 *      no other component carries either — deactivation discards them;
 *  (10) a component is UNLOCKED only after the dyestuff matched, lot and container are settled and
 *      the scale reported a tare; a wrong dyestuff changes nothing;
 *  (12) changing the container or the scale discards the tare (the caller re-tares);
 *  (13) a scale in use must be usable now (calibrated and connected).
 */
import {
  isCalibrationExpired,
  type ScaleCandidate,
} from '../../../../shared/domain/scale-selection';
import type { Quantity } from '../../../../shared/quantity';
import { normaliseCode } from '../../../../shared/scan-codes';
import type { ComponentState, OrgatexStatusSync, SessionStatus } from '../../../../shared/weighing';
import { ScaleUnavailableError } from '../../../errors';
import {
  ComponentAlreadyDoneError,
  ComponentNotActiveError,
  ComponentNotFoundError,
  IdentityNotVerifiedError,
  ScaleCalibrationExpiredError,
  SessionNotInProgressError,
  WrongDyestuffError,
} from './errors';
import {
  emptyPreparation,
  noScale,
  preparationStateOf,
  type ChosenContainer,
  type ChosenLot,
  type Preparation,
  type ScaleAssignment,
} from './preparation';
import type { PreparationState } from '../../../../shared/weighing';

export interface ComponentSpec {
  sequence: number;
  dyestuff: { code: string; name: string; shortName: string; colourHex: string; type: string };
  target: Quantity;
  tolerance: Quantity;
  barMax: Quantity;
  suggestedLotId: string | null;
}

/** Immutable copy of the recipe taken when the session starts. */
export interface RecipeSnapshot {
  recipeId: string;
  version: string;
  shade: string;
  components: ComponentSpec[];
  takenAt: string;
}

export interface ComponentWeighing {
  sequence: number;
  state: ComponentState;
  activatedAt: string | null;
  /** Only while ACTIVE. */
  scale: ScaleAssignment | null;
  /** Only while ACTIVE. */
  preparation: Preparation | null;
}

export interface WeighingSessionProps {
  sessionId: string;
  batchId: string;
  stationId: string;
  startedBy: string;
  status: SessionStatus;
  recipe: RecipeSnapshot;
  components: ComponentWeighing[];
  orgatexStatusSync: OrgatexStatusSync;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface StartSessionInput {
  sessionId: string;
  batchId: string;
  stationId: string;
  startedBy: string;
  recipe: RecipeSnapshot;
  now: Date;
}

export class WeighingSession {
  private constructor(private props: WeighingSessionProps) {}

  /** Starts a new session: every component PENDING except the first, which is ACTIVE. */
  static start(input: StartSessionInput): WeighingSession {
    const sequences = input.recipe.components.map((c) => c.sequence);
    if (sequences.length === 0 || sequences.some((s, i) => s !== i + 1)) {
      throw new Error('Recipe snapshot must have components with sequences 1..n');
    }
    const at = input.now.toISOString();
    return new WeighingSession({
      sessionId: input.sessionId,
      batchId: input.batchId,
      stationId: input.stationId,
      startedBy: input.startedBy,
      status: 'IN_PROGRESS',
      recipe: input.recipe,
      components: sequences.map((sequence) => ({
        sequence,
        state: sequence === 1 ? 'ACTIVE' : 'PENDING',
        activatedAt: sequence === 1 ? at : null,
        scale: sequence === 1 ? noScale() : null,
        preparation: sequence === 1 ? emptyPreparation() : null,
      })),
      orgatexStatusSync: 'SYNCED',
      startedAt: at,
      updatedAt: at,
      completedAt: null,
    });
  }

  /** Rebuilds a persisted session (repositories only). */
  static restore(props: WeighingSessionProps): WeighingSession {
    return new WeighingSession(structuredClone(props));
  }

  get sessionId(): string {
    return this.props.sessionId;
  }

  get batchId(): string {
    return this.props.batchId;
  }

  get status(): SessionStatus {
    return this.props.status;
  }

  get activeSequence(): number | null {
    return this.props.components.find((c) => c.state === 'ACTIVE')?.sequence ?? null;
  }

  get doneCount(): number {
    return this.props.components.filter((c) => c.state === 'DONE').length;
  }

  /** Makes a PENDING component the one being weighed (invariant 4). */
  activate(sequence: number, now: Date): void {
    this.requireInProgress();
    const target = this.props.components.find((c) => c.sequence === sequence);
    if (!target) throw new ComponentNotFoundError(this.props.sessionId, sequence);
    if (target.state === 'DONE')
      throw new ComponentAlreadyDoneError(this.props.sessionId, sequence);
    if (target.state === 'ACTIVE') return;

    const at = now.toISOString();
    for (const c of this.props.components) {
      if (c.state === 'ACTIVE') {
        // Back to pending: its unconfirmed weighing is discarded.
        c.state = 'PENDING';
        c.activatedAt = null;
        c.scale = null;
        c.preparation = null;
      }
    }
    target.state = 'ACTIVE';
    target.activatedAt = at;
    target.scale = noScale();
    target.preparation = emptyPreparation();
    this.props.updatedAt = at;
  }

  // ── Preparation of the active component (bolt 009) ──────────────────────

  /** Records the scale chosen for the active component (automatic or by a supervisor). */
  assignScale(sequence: number, assignment: ScaleAssignment, now: Date): void {
    const c = this.activeComponent(sequence);
    const changed = c.scale?.scaleId !== assignment.scaleId;
    c.scale = { ...assignment };
    // A different scale has its own tare: the old one no longer counts (invariant 12).
    if (changed) this.discardTare(c);
    this.touch(now);
  }

  /** The scanned or typed code must be this component's dyestuff (invariant 10). */
  verifyIdentity(sequence: number, scannedCode: string, now: Date): void {
    const c = this.activeComponent(sequence);
    const expected = this.specOf(sequence).dyestuff.code;
    const scanned = normaliseCode(scannedCode);
    if (scanned !== expected) throw new WrongDyestuffError(expected, scanned);
    const p = c.preparation!;
    p.identityVerifiedAt ??= now.toISOString();
    this.touch(now);
  }

  setLot(sequence: number, lot: ChosenLot, now: Date): void {
    this.activeComponent(sequence).preparation!.lot = { ...lot };
    this.touch(now);
  }

  /** Choosing a container discards the tare — the scale must be tared with the new container. */
  setContainer(sequence: number, container: ChosenContainer, now: Date): void {
    const c = this.activeComponent(sequence);
    c.preparation!.container = { ...container, tare: { ...container.tare } };
    this.discardTare(c);
    this.touch(now);
  }

  /** Records the tare the scale reported; unlocks weighing (invariant 10). */
  applyTare(sequence: number, tare: Quantity, now: Date): void {
    const c = this.activeComponent(sequence);
    const p = c.preparation!;
    if (!p.identityVerifiedAt || !p.lot || !p.container) {
      throw new IdentityNotVerifiedError(this.props.sessionId, sequence);
    }
    p.tareApplied = { ...tare };
    p.unlockedAt = now.toISOString();
    this.touch(now);
  }

  preparationState(sequence: number): PreparationState {
    return preparationStateOf(this.activeComponent(sequence).preparation!);
  }

  /** Guard for confirmation and re-tare (bolt 010): the component must be unlocked. */
  requireUnlocked(sequence: number): void {
    this.activeComponent(sequence);
    if (this.preparationState(sequence) !== 'UNLOCKED') {
      throw new IdentityNotVerifiedError(this.props.sessionId, sequence);
    }
  }

  /** Guard for unlock, re-tare and confirmation (BR-24, invariant 13). */
  requireScaleUsable(scale: ScaleCandidate, now: Date): void {
    if (!scale.connected) throw new ScaleUnavailableError(scale.scaleId, 'not connected');
    if (isCalibrationExpired(scale.calibrationDueAt, now)) {
      throw new ScaleCalibrationExpiredError(scale.scaleId, scale.calibrationDueAt);
    }
  }

  /** The ACTIVE component's spec (target, tolerance, dyestuff). */
  specOf(sequence: number): ComponentSpec {
    const spec = this.props.recipe.components.find((c) => c.sequence === sequence);
    if (!spec) throw new ComponentNotFoundError(this.props.sessionId, sequence);
    return spec;
  }

  /** The active component with its preparation (copy), after the usual checks. */
  activeSnapshot(sequence: number): ComponentWeighing {
    return structuredClone(this.activeComponent(sequence));
  }

  /** Records that OrgaTEX could not be told the batch is being weighed (TD-1). */
  markOrgatexStatusDeferred(): void {
    this.props.orgatexStatusSync = 'DEFERRED';
  }

  /** A copy of the aggregate's state (for repositories and read models). */
  snapshot(): WeighingSessionProps {
    return structuredClone(this.props);
  }

  private activeComponent(sequence: number): ComponentWeighing {
    this.requireInProgress();
    const c = this.props.components.find((x) => x.sequence === sequence);
    if (!c) throw new ComponentNotFoundError(this.props.sessionId, sequence);
    if (c.state === 'DONE') throw new ComponentAlreadyDoneError(this.props.sessionId, sequence);
    if (c.state !== 'ACTIVE' || !c.preparation) {
      throw new ComponentNotActiveError(this.props.sessionId, sequence);
    }
    return c;
  }

  private discardTare(c: ComponentWeighing): void {
    if (c.preparation) {
      c.preparation.tareApplied = null;
      c.preparation.unlockedAt = null;
    }
  }

  private touch(now: Date): void {
    this.props.updatedAt = now.toISOString();
  }

  private requireInProgress(): void {
    if (this.props.status !== 'IN_PROGRESS') {
      throw new SessionNotInProgressError(this.props.sessionId, this.props.status);
    }
  }
}

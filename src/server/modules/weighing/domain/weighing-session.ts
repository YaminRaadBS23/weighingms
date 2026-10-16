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
 *  (7) component actions only while IN_PROGRESS.
 */
import type { Quantity } from '../../../../shared/quantity';
import type { ComponentState, OrgatexStatusSync, SessionStatus } from '../../../../shared/weighing';
import {
  ComponentAlreadyDoneError,
  ComponentNotFoundError,
  SessionNotInProgressError,
} from './errors';

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
      }
    }
    target.state = 'ACTIVE';
    target.activatedAt = at;
    this.props.updatedAt = at;
  }

  /** Records that OrgaTEX could not be told the batch is being weighed (TD-1). */
  markOrgatexStatusDeferred(): void {
    this.props.orgatexStatusSync = 'DEFERRED';
  }

  /** A copy of the aggregate's state (for repositories and read models). */
  snapshot(): WeighingSessionProps {
    return structuredClone(this.props);
  }

  private requireInProgress(): void {
    if (this.props.status !== 'IN_PROGRESS') {
      throw new SessionNotInProgressError(this.props.sessionId, this.props.status);
    }
  }
}

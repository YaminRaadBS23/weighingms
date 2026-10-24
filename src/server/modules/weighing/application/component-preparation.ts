/**
 * Use cases that prepare the active component for weighing (ddd-01/02, bolt 009): scale selection,
 * dyestuff identity, lot, container, tare and supervisor scale reselection.
 *
 * Calls are either refused (an error, nothing saved) or accepted (the saved session, with the
 * reason a component is still locked as an `issue`, ADR-5). Operations on one session are serialised
 * (ADR-6).
 */
import {
  fitsCapacity,
  isScaleUsable,
  scaleRequirement,
  selectScale,
} from '../../../../shared/domain/scale-selection';
import { compare, type Quantity } from '../../../../shared/quantity';
import { displayState } from '../../../../shared/domain/scale-selection';
import type { PreparationIssue, ScaleOptionsResponse } from '../../../../shared/weighing';
import { DomainError } from '../../../errors';
import type { ScaleInfo, ScalePort } from '../../../integrations/scale/scale-port';
import type { MaterialService } from '../../materials/material-service';
import {
  NoSuitableScaleError,
  ScaleCapacityInsufficientError,
  SessionNotFoundError,
} from '../domain/errors';
import { noScale } from '../domain/preparation';
import type { WeighingSession } from '../domain/weighing-session';
import type { AuditLog } from './audit-log';
import type { WeighingContext } from './context';
import type { OperatorIdentification } from './operator-identification';
import type { SessionLock } from './session-lock';
import type { SupervisorAuthorisationService } from './supervisor-authorisation';

export interface PreparationResult {
  session: WeighingSession;
  /** Why the component is still locked, when the accepted action could not finish unlocking it. */
  issue?: PreparationIssue;
}

const issueOf = (err: DomainError): PreparationIssue => ({ code: err.code, message: err.message });

export class ComponentPreparation {
  constructor(
    private readonly ctx: WeighingContext,
    private readonly scales: ScalePort,
    private readonly materials: MaterialService,
    private readonly identification: OperatorIdentification,
    private readonly authorisation: SupervisorAuthorisationService,
    private readonly auditLog: AuditLog,
    readonly lock: SessionLock,
  ) {}

  // ── Scale selection ──────────────────────────────────────────────────────

  /**
   * Chooses the scale for the active component by the selection rule (mode AUTO) and records it in
   * the session (not saved here). Never fails: no qualifying scale means "none" (invariant 8).
   */
  async assignScale(session: WeighingSession, sequence: number): Promise<void> {
    const now = this.ctx.now();
    const requirement = this.requirementFor(session, sequence);
    const chosen = selectScale(requirement, await this.listScales(), now);
    session.assignScale(
      sequence,
      chosen
        ? { scaleId: chosen.scaleId, mode: 'AUTO', reason: null, requirement }
        : noScale(requirement),
      now,
    );
    this.ctx.logger.info(
      {
        event: 'component-scale-assigned',
        sessionId: session.sessionId,
        sequence,
        scaleId: chosen?.scaleId ?? null,
        mode: 'AUTO',
      },
      'Scale assigned',
    );
  }

  // ── Identity, lot, container ─────────────────────────────────────────────

  verifyIdentity(sessionId: string, sequence: number, code: string): Promise<PreparationResult> {
    return this.lock.run(sessionId, async () => {
      this.identification.requireCurrent();
      const session = this.load(sessionId);
      session.activeSnapshot(sequence); // active component, session in progress
      try {
        session.verifyIdentity(sequence, code, this.ctx.now());
      } catch (err) {
        if (err instanceof DomainError) {
          this.ctx.logger.warn(
            { event: 'identity-rejected', sessionId, sequence },
            'Dyestuff identity rejected',
          );
        }
        throw err;
      }
      await this.settleDefaults(session, sequence);
      const issue =
        session.preparationState(sequence) === 'UNLOCKED'
          ? undefined
          : await this.tryUnlock(session, sequence);
      this.ctx.sessions.save(session);
      this.ctx.logger.info(
        {
          event: 'identity-verified',
          sessionId,
          sequence,
          state: session.preparationState(sequence),
        },
        'Dyestuff identity verified',
      );
      return { session, ...(issue ? { issue } : {}) };
    });
  }

  setLot(sessionId: string, sequence: number, code: string): Promise<PreparationResult> {
    return this.lock.run(sessionId, async () => {
      this.identification.requireCurrent();
      const session = this.load(sessionId);
      session.activeSnapshot(sequence);
      const dyestuffCode = session.specOf(sequence).dyestuff.code;
      const lot = await this.materials.validateLot(dyestuffCode, code);
      session.setLot(sequence, { lotId: lot.lotId, source: 'SCANNED' }, this.ctx.now());
      const issue = await this.tryUnlock(session, sequence);
      this.ctx.sessions.save(session);
      this.ctx.logger.info({ event: 'lot-set', sessionId, sequence, lotId: lot.lotId }, 'Lot set');
      return { session, ...(issue ? { issue } : {}) };
    });
  }

  setContainer(sessionId: string, sequence: number, code: string): Promise<PreparationResult> {
    return this.lock.run(sessionId, async () => {
      this.identification.requireCurrent();
      const session = this.load(sessionId);
      const before = session.activeSnapshot(sequence);
      const spec = session.specOf(sequence);
      const container = this.materials.validateContainer(code);
      const wasUnlocked = session.preparationState(sequence) === 'UNLOCKED';
      const now = this.ctx.now();

      // A scale chosen by a supervisor must still be able to carry the load with this container.
      const requirement = scaleRequirement(spec.target, spec.tolerance, container.tare);
      if (before.scale?.mode === 'MANUAL' && before.scale.scaleId) {
        const info = await this.scales.getScale(before.scale.scaleId);
        if (!fitsCapacity(requirement, info)) {
          throw new ScaleCapacityInsufficientError(info.scaleId, requirement);
        }
      }

      session.setContainer(
        sequence,
        { containerId: container.containerId, tare: container.tare, source: 'SCANNED' },
        now,
      );
      if (before.scale?.mode === 'MANUAL') {
        session.assignScale(sequence, { ...before.scale, requirement }, now);
      } else {
        await this.assignScale(session, sequence);
      }

      let issue: PreparationIssue | undefined;
      if (wasUnlocked) {
        await this.tareAssignedScale(session, sequence); // all-or-nothing: errors refuse the change
        this.ctx.logger.info(
          { event: 'component-retared', sessionId, sequence, containerId: container.containerId },
          'Component re-tared with new container',
        );
      } else {
        issue = await this.tryUnlock(session, sequence);
      }
      this.ctx.sessions.save(session);
      this.ctx.logger.info(
        { event: 'container-set', sessionId, sequence, containerId: container.containerId },
        'Container set',
      );
      return { session, ...(issue ? { issue } : {}) };
    });
  }

  // ── Supervisor scale reselection ─────────────────────────────────────────

  reselectScale(
    sessionId: string,
    sequence: number,
    scaleId: string,
    supervisorBadge: string,
    pin: string,
  ): Promise<PreparationResult> {
    return this.lock.run(sessionId, async () => {
      this.identification.requireCurrent();
      const supervisor = this.authorisation.authorise(supervisorBadge, pin);
      const session = this.load(sessionId);
      const before = session.activeSnapshot(sequence);
      const spec = session.specOf(sequence);
      const now = this.ctx.now();

      const info = await this.scales.getScale(scaleId);
      const requirement = this.requirementFor(session, sequence);
      if (!fitsCapacity(requirement, info)) {
        throw new ScaleCapacityInsufficientError(scaleId, requirement);
      }
      session.requireScaleUsable(info, now);

      session.assignScale(sequence, { scaleId, mode: 'MANUAL', reason: null, requirement }, now);
      if (session.preparationState(sequence) === 'AWAITING_TARE') {
        await this.tareAssignedScale(session, sequence); // all-or-nothing
      }

      this.ctx.atomically(() => {
        this.ctx.sessions.save(session);
        this.auditLog.record('SCALE_RESELECT', supervisor.operatorId, sessionId, {
          sequence,
          dyestuffCode: spec.dyestuff.code,
          fromScaleId: before.scale?.scaleId ?? null,
          fromMode: before.scale?.mode ?? null,
          toScaleId: scaleId,
          requirement,
        });
      });
      this.ctx.logger.info(
        {
          event: 'scale-reselected',
          sessionId,
          sequence,
          scaleId,
          supervisorId: supervisor.operatorId,
        },
        'Scale reselected by supervisor',
      );
      return { session };
    });
  }

  /** The scales with their fit and state for the active component (supervisor dialog, FR-12). */
  async scaleOptions(sessionId: string, sequence: number): Promise<ScaleOptionsResponse> {
    const session = this.load(sessionId);
    const component = session.activeSnapshot(sequence);
    const requirement = this.requirementFor(session, sequence);
    const now = this.ctx.now();
    const items = (await this.listScales()).map((s) => ({
      scaleId: s.scaleId,
      capacity: s.capacity,
      fits: fitsCapacity(requirement, s),
      usable: isScaleUsable(s, now),
      state: displayState(s, now),
      selected: component.scale?.scaleId === s.scaleId,
    }));
    return { requirement, items };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private load(sessionId: string): WeighingSession {
    const session = this.ctx.sessions.findById(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    return session;
  }

  /** A failing scale list counts as "no scales" so that activation never fails (model M-3). */
  private async listScales(): Promise<ScaleInfo[]> {
    try {
      return await this.scales.listScales();
    } catch (err) {
      if (err instanceof DomainError) return [];
      throw err;
    }
  }

  /** Target + tolerance + tare of the container in force, or else of the default container. */
  private requirementFor(session: WeighingSession, sequence: number): Quantity {
    const spec = session.specOf(sequence);
    const chosen = session.activeSnapshot(sequence).preparation?.container;
    const fallback = this.materials.defaultContainerFor(spec.dyestuff.code);
    const tare = chosen?.tare ?? (fallback?.inService ? fallback.tare : null);
    return scaleRequirement(spec.target, spec.tolerance, tare);
  }

  /** Lot and container default from data (TD-3, TD-8); a default needs no OrgaTEX call. */
  private async settleDefaults(session: WeighingSession, sequence: number): Promise<void> {
    const now = this.ctx.now();
    const spec = session.specOf(sequence);
    const prep = session.activeSnapshot(sequence).preparation!;
    if (!prep.lot) {
      const lotId = await this.materials.resolveLot(spec.dyestuff.code, spec.suggestedLotId);
      if (lotId) session.setLot(sequence, { lotId, source: 'DEFAULT' }, now);
    }
    if (!prep.container) {
      const def = this.materials.defaultContainerFor(spec.dyestuff.code);
      if (def?.inService) {
        session.setContainer(
          sequence,
          { containerId: def.containerId, tare: def.tare, source: 'DEFAULT' },
          now,
        );
      }
    }
  }

  /** Unlocks when everything is settled. Returns why not, instead of failing (ADR-5). */
  private async tryUnlock(
    session: WeighingSession,
    sequence: number,
  ): Promise<PreparationIssue | undefined> {
    const state = session.preparationState(sequence);
    if (state === 'AWAITING_MATERIAL') {
      const prep = session.activeSnapshot(sequence).preparation!;
      return !prep.lot
        ? { code: 'LOT_REQUIRED', message: 'Scan the lot to continue' }
        : { code: 'CONTAINER_REQUIRED', message: 'Scan the container to continue' };
    }
    if (state !== 'AWAITING_TARE') return undefined;
    try {
      await this.tareAssignedScale(session, sequence);
      this.ctx.logger.info(
        { event: 'component-unlocked', sessionId: session.sessionId, sequence },
        'Component unlocked',
      );
      return undefined;
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      this.ctx.logger.warn(
        { event: 'scale-not-usable', sessionId: session.sessionId, sequence, code: err.code },
        'Tare not done',
      );
      return issueOf(err);
    }
  }

  /**
   * Tares the component's scale with its container in place and records the tare the scale reports.
   * An automatic assignment that is missing or no longer usable is re-evaluated first (invariant 13).
   */
  private async tareAssignedScale(session: WeighingSession, sequence: number): Promise<void> {
    const now = this.ctx.now();
    let component = session.activeSnapshot(sequence);
    let info = component.scale?.scaleId
      ? await this.scales.getScale(component.scale.scaleId)
      : null;
    if (component.scale?.mode === 'AUTO' && (!info || !isScaleUsable(info, now))) {
      await this.assignScale(session, sequence);
      component = session.activeSnapshot(sequence);
      info = component.scale?.scaleId ? await this.scales.getScale(component.scale.scaleId) : null;
    }
    if (!info) {
      throw new NoSuitableScaleError(this.requirementFor(session, sequence));
    }
    session.requireScaleUsable(info, now);
    const container = component.preparation!.container!;
    const tare = await this.scales.tare(info.scaleId, { containerTare: container.tare });
    if (compare(tare, container.tare) !== 0) {
      this.ctx.logger.warn(
        {
          event: 'tare-differs-from-container',
          sessionId: session.sessionId,
          sequence,
          expected: container.tare,
          applied: tare,
        },
        'Applied tare differs from the container master',
      );
    }
    session.applyTare(sequence, tare, now);
  }
}

/** Composition of the weighing module: repositories, use cases and read-model mapping. */
import { randomUUID } from 'node:crypto';
import type {
  PreparationIssue,
  PreparationView,
  OperatorView,
  SessionView,
  WeighingRecordView,
} from '../../../shared/weighing';
import type { WeighingDb } from '../../db/weighingms/db';
import type { AdapterLogger } from '../../integrations/http';
import type { OrgatexPort } from '../../integrations/orgatex/orgatex-port';
import type { ScalePort } from '../../integrations/scale/scale-port';
import type { BatchService } from '../batches/batch-service';
import type { MaterialService } from '../materials/material-service';
import { AuditLog } from './application/audit-log';
import { ComponentActivation } from './application/component-activation';
import { ComponentConfirmation } from './application/component-confirmation';
import { ComponentEvaluation } from './application/component-evaluation';
import { ComponentMeasurement } from './application/component-measurement';
import { ComponentOverride } from './application/component-override';
import { ComponentPreparation } from './application/component-preparation';
import { ComponentReTare } from './application/component-retare';
import { SessionSuspension } from './application/session-suspension';
import { SessionLock } from './application/session-lock';
import { SupervisorAuthorisationService } from './application/supervisor-authorisation';
import type { WeighingContext } from './application/context';
import { OperatorIdentification } from './application/operator-identification';
import { SessionStarter } from './application/session-starter';
import type { Operator } from './domain/operator';
import { preparationStateOf } from './domain/preparation';
import type { WeighingRecord } from './domain/weighing-record';
import type { WeighingSession } from './domain/weighing-session';
import {
  DrizzleAuditEventRepository,
  DrizzleOperatorRepository,
  DrizzleStationRepository,
  DrizzleWeighingRecordRepository,
  DrizzleWeighingSessionRepository,
} from './infrastructure/drizzle-repositories';
import { scryptPinVerifier } from './infrastructure/pin-hash';
import type { PinVerifier } from './domain/repositories';

export interface WeighingModuleDeps {
  db: WeighingDb;
  stationId: string;
  batches: BatchService;
  orgatex: OrgatexPort;
  scales: ScalePort;
  materials: MaterialService;
  pins?: PinVerifier;
  logger: AdapterLogger;
  now?: () => Date;
  newId?: () => string;
}

export function createWeighingModule(deps: WeighingModuleDeps) {
  const ctx: WeighingContext = {
    stationId: deps.stationId,
    operators: new DrizzleOperatorRepository(deps.db),
    station: new DrizzleStationRepository(deps.db),
    sessions: new DrizzleWeighingSessionRepository(deps.db),
    audit: new DrizzleAuditEventRepository(deps.db),
    records: new DrizzleWeighingRecordRepository(deps.db),
    now: deps.now ?? (() => new Date()),
    newId: deps.newId ?? randomUUID,
    logger: deps.logger,
    atomically: (fn) => deps.db.transaction(() => fn()),
  };
  const identification = new OperatorIdentification(ctx);
  const auditLog = new AuditLog(ctx);
  const authorisation = new SupervisorAuthorisationService(ctx, deps.pins ?? scryptPinVerifier);
  const preparation = new ComponentPreparation(
    ctx,
    deps.scales,
    deps.materials,
    identification,
    authorisation,
    auditLog,
    new SessionLock(),
  );
  const measurement = new ComponentMeasurement(ctx, deps.scales);

  const toOperatorView = (o: Operator): OperatorView => ({
    operatorId: o.operatorId,
    badgeId: o.badgeId,
    name: o.name,
    shift: o.shift,
    role: o.role,
  });

  const nameOf = (operatorId: string) => ctx.operators.findById(operatorId)?.name ?? operatorId;

  /** Why a component is still locked, when it can be told from the saved data alone. */
  const derivedIssue = (
    p: PreparationView,
    scaleId: string | null,
  ): PreparationIssue | undefined => {
    if (p.state === 'AWAITING_MATERIAL') {
      return !p.lot
        ? { code: 'LOT_REQUIRED', message: 'Scan the lot to continue' }
        : { code: 'CONTAINER_REQUIRED', message: 'Scan the container to continue' };
    }
    if (p.state === 'AWAITING_TARE') {
      return scaleId
        ? { code: 'TARE_PENDING', message: 'The scale has not been tared yet' }
        : { code: 'NO_SUITABLE_SCALE', message: 'No usable scale can carry this component' };
    }
    return undefined;
  };

  /** `issue` is the specific cause reported by the call that just ran (ADR-5), if any. */
  const toSessionView = (session: WeighingSession, issue?: PreparationIssue): SessionView => {
    const s = session.snapshot();
    const specs = new Map(s.recipe.components.map((c) => [c.sequence, c]));
    const records = new Map(ctx.records.listBySession(s.sessionId).map((r) => [r.sequence, r]));
    return {
      sessionId: s.sessionId,
      batchId: s.batchId,
      stationId: s.stationId,
      status: s.status,
      startedBy: { operatorId: s.startedBy, name: nameOf(s.startedBy) },
      startedAt: s.startedAt,
      updatedAt: s.updatedAt,
      recipe: { recipeId: s.recipe.recipeId, version: s.recipe.version, shade: s.recipe.shade },
      componentCount: s.components.length,
      doneCount: session.doneCount,
      activeSequence: session.activeSequence,
      components: s.components.map((c) => {
        const spec = specs.get(c.sequence)!;
        const p = c.preparation;
        const preparation: PreparationView | null = p
          ? {
              state: preparationStateOf(p),
              identityVerified: p.identityVerifiedAt !== null,
              lot: p.lot,
              container: p.container,
              tareApplied: p.tareApplied,
            }
          : null;
        if (preparation) {
          const found = issue ?? derivedIssue(preparation, c.scale?.scaleId ?? null);
          if (found && preparation.state !== 'UNLOCKED') preparation.issue = found;
        }
        return {
          sequence: c.sequence,
          state: c.state,
          dyestuff: spec.dyestuff,
          target: spec.target,
          tolerance: spec.tolerance,
          barMax: spec.barMax,
          suggestedLotId: spec.suggestedLotId,
          scale: c.scale
            ? { scaleId: c.scale.scaleId, mode: c.scale.mode, reason: c.scale.reason }
            : null,
          requirement: c.scale?.requirement ?? null,
          preparation,
          confirmed: records.has(c.sequence)
            ? {
                recordId: records.get(c.sequence)!.recordId,
                actual: records.get(c.sequence)!.actual,
                result: records.get(c.sequence)!.result,
                confirmedAt: records.get(c.sequence)!.confirmedAt,
              }
            : null,
        };
      }),
      orgatexStatusSync: s.orgatexStatusSync,
      completedAt: s.completedAt,
    };
  };

  const toRecordView = (r: WeighingRecord): WeighingRecordView => ({
    recordId: r.recordId,
    sessionId: r.sessionId,
    batchId: r.batchId,
    sequence: r.sequence,
    dyestuff: { code: r.dyestuffCode, name: r.dyestuffName },
    actual: r.actual,
    target: r.target,
    toleranceLower: r.toleranceLower,
    toleranceUpper: r.toleranceUpper,
    lotId: r.lotId,
    containerId: r.containerId,
    tare: r.tare,
    scaleId: r.scaleId,
    operator: { operatorId: r.operatorId, name: nameOf(r.operatorId) },
    confirmedAt: r.confirmedAt,
    result: r.result,
    surplus: r.surplus,
    override: r.override
      ? {
          supervisor: {
            operatorId: r.override.supervisorId,
            name: nameOf(r.override.supervisorId),
          },
          reason: r.override.reason,
          zone: r.override.zone,
          authorisedAt: r.override.authorisedAt,
        }
      : null,
  });

  return {
    ctx,
    identification,
    starter: new SessionStarter(ctx, identification, deps.batches, deps.orgatex, preparation),
    activation: new ComponentActivation(ctx, preparation),
    preparation,
    confirmation: new ComponentConfirmation(ctx, measurement, preparation, identification),
    override: new ComponentOverride(
      ctx,
      measurement,
      preparation,
      identification,
      authorisation,
      auditLog,
    ),
    evaluation: new ComponentEvaluation(ctx, measurement),
    retare: new ComponentReTare(ctx, deps.scales, preparation, identification),
    suspension: new SessionSuspension(ctx, deps.scales, preparation, identification, auditLog),
    auditLog,
    toOperatorView,
    toSessionView,
    toRecordView,
    nameOf,
  };
}

export type WeighingModule = ReturnType<typeof createWeighingModule>;

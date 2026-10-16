/** Composition of the weighing module: repositories, use cases and read-model mapping. */
import { randomUUID } from 'node:crypto';
import type { OperatorView, SessionView } from '../../../shared/weighing';
import type { WeighingDb } from '../../db/weighingms/db';
import type { AdapterLogger } from '../../integrations/http';
import type { OrgatexPort } from '../../integrations/orgatex/orgatex-port';
import type { BatchService } from '../batches/batch-service';
import { AuditLog } from './application/audit-log';
import { ComponentActivation } from './application/component-activation';
import type { WeighingContext } from './application/context';
import { OperatorIdentification } from './application/operator-identification';
import { SessionStarter } from './application/session-starter';
import type { Operator } from './domain/operator';
import type { WeighingSession } from './domain/weighing-session';
import {
  DrizzleAuditEventRepository,
  DrizzleOperatorRepository,
  DrizzleStationRepository,
  DrizzleWeighingSessionRepository,
} from './infrastructure/drizzle-repositories';

export interface WeighingModuleDeps {
  db: WeighingDb;
  stationId: string;
  batches: BatchService;
  orgatex: OrgatexPort;
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
    now: deps.now ?? (() => new Date()),
    newId: deps.newId ?? randomUUID,
    logger: deps.logger,
  };
  const identification = new OperatorIdentification(ctx);

  const toOperatorView = (o: Operator): OperatorView => ({
    operatorId: o.operatorId,
    badgeId: o.badgeId,
    name: o.name,
    shift: o.shift,
    role: o.role,
  });

  const nameOf = (operatorId: string) => ctx.operators.findById(operatorId)?.name ?? operatorId;

  const toSessionView = (session: WeighingSession): SessionView => {
    const s = session.snapshot();
    const specs = new Map(s.recipe.components.map((c) => [c.sequence, c]));
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
        return {
          sequence: c.sequence,
          state: c.state,
          dyestuff: spec.dyestuff,
          target: spec.target,
          tolerance: spec.tolerance,
          barMax: spec.barMax,
          suggestedLotId: spec.suggestedLotId,
        };
      }),
      orgatexStatusSync: s.orgatexStatusSync,
    };
  };

  return {
    ctx,
    identification,
    starter: new SessionStarter(ctx, identification, deps.batches, deps.orgatex),
    activation: new ComponentActivation(ctx),
    auditLog: new AuditLog(ctx),
    toOperatorView,
    toSessionView,
    nameOf,
  };
}

export type WeighingModule = ReturnType<typeof createWeighingModule>;

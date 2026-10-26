/**
 * Use case: start a weighing session for a batch, or resume its open session (FR-24 resume,
 * NFR-6, ADR-3). Decision order follows ddd-01-domain-model.md (SessionStarter).
 */
import { normaliseCode } from '../../../../shared/scan-codes';
import { OrgatexUnavailableError } from '../../../errors';
import type { OrgatexPort } from '../../../integrations/orgatex/orgatex-port';
import type { BatchService } from '../../batches/batch-service';
import { SessionInProgressError } from '../domain/errors';
import { WeighingSession, type RecipeSnapshot } from '../domain/weighing-session';
import type { WeighingContext } from './context';
import type { ComponentPreparation } from './component-preparation';
import type { OperatorIdentification } from './operator-identification';

export interface StartResult {
  session: WeighingSession;
  resumed: boolean;
}

export class SessionStarter {
  constructor(
    private readonly ctx: WeighingContext,
    private readonly identification: OperatorIdentification,
    private readonly batches: BatchService,
    private readonly orgatex: OrgatexPort,
    private readonly preparation: ComponentPreparation,
  ) {}

  /** An in-progress session is returned as it is; a suspended one is resumed (ADR-3 check first). */
  private resume(open: WeighingSession, operatorId: string): Promise<WeighingSession> {
    return this.preparation.lock.run(open.sessionId, async () => {
      const session = this.ctx.sessions.findById(open.sessionId) ?? open;
      if (session.status === 'SUSPENDED') {
        const other = this.ctx.sessions.findInProgressForStation(this.ctx.stationId);
        if (other) throw new SessionInProgressError(other.sessionId, other.batchId);
        const sequence = session.resume(this.ctx.now());
        await this.preparation.assignScale(session, sequence);
        this.ctx.sessions.save(session);
        this.ctx.logger.info(
          {
            event: 'session-resumed',
            sessionId: session.sessionId,
            batchId: session.batchId,
            operatorId,
            sequence,
          },
          'Suspended session resumed',
        );
        return session;
      }
      this.ctx.logger.info(
        {
          event: 'session-resumed',
          sessionId: session.sessionId,
          batchId: session.batchId,
          operatorId,
        },
        'Weighing session resumed',
      );
      return session;
    });
  }

  async startOrResume(rawBatchId: string): Promise<StartResult> {
    // 1. Someone must be signed in.
    const operator = this.identification.requireCurrent();
    const batchId = normaliseCode(rawBatchId);

    // 2. The batch's open session: resume it without asking OrgaTEX (works while OrgaTEX is offline).
    const open = this.ctx.sessions.findOpenByBatch(batchId);
    if (open) return { session: await this.resume(open, operator.operatorId), resumed: true };

    // 3. One batch in progress per station (ADR-3).
    const inProgress = this.ctx.sessions.findInProgressForStation(this.ctx.stationId);
    if (inProgress) throw new SessionInProgressError(inProgress.sessionId, inProgress.batchId);

    // 4. Release check (BATCH_NOT_RELEASED / BATCH_NOT_FOUND / ORGATEX_UNAVAILABLE pass through).
    const batch = await this.batches.requireWeighable(batchId);

    // 5. Snapshot the recipe and start with component 1 active.
    const recipe = await this.batches.getRecipe(batchId);
    const now = this.ctx.now();
    const snapshot: RecipeSnapshot = {
      recipeId: recipe.recipeId,
      version: recipe.version,
      shade: recipe.shade,
      components: recipe.components.map((c) => ({ ...c, dyestuff: { ...c.dyestuff } })),
      takenAt: now.toISOString(),
      ...(batch.orderRef ? { orderRef: batch.orderRef } : {}),
      ...(batch.machineRef ? { machineRef: batch.machineRef } : {}),
    };
    const session = WeighingSession.start({
      sessionId: this.ctx.newId(),
      batchId,
      stationId: this.ctx.stationId,
      startedBy: operator.operatorId,
      recipe: snapshot,
      now,
    });
    await this.preparation.assignScale(session, 1); // component 1 is active: choose its scale

    // 6. Tell OrgaTEX the batch is being weighed; never block weighing if it is unreachable (TD-1).
    try {
      await this.orgatex.setBatchStatus(batchId, 'WEIGHING');
    } catch (err) {
      if (!(err instanceof OrgatexUnavailableError)) throw err;
      session.markOrgatexStatusDeferred();
      this.ctx.logger.warn(
        { event: 'batch-status-sync-deferred', sessionId: session.sessionId, batchId },
        'OrgaTEX unreachable; WEIGHING status deferred',
      );
    }

    try {
      this.ctx.sessions.save(session);
    } catch (err) {
      // A concurrent start of the same batch won the race (one open session per batch): resume it.
      const winner = this.ctx.sessions.findOpenByBatch(batchId);
      if (winner) return { session: winner, resumed: true };
      throw err;
    }
    this.ctx.logger.info(
      {
        event: 'session-started',
        sessionId: session.sessionId,
        batchId,
        operatorId: operator.operatorId,
      },
      'Weighing session started',
    );
    return { session, resumed: false };
  }
}

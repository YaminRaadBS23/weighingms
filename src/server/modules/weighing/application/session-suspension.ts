/**
 * Use case: quit the batch (FR-24, TD-14, ddd-01 invariant 21). The unconfirmed weighing is
 * abandoned, the session is SUSPENDED and an ABANDON audit event is written — in one transaction.
 * Resume is part of SessionStarter.startOrResume.
 */
import type { Quantity } from '../../../../shared/quantity';
import type { ScalePort } from '../../../integrations/scale/scale-port';
import { SessionNotFoundError } from '../domain/errors';
import type { WeighingSession } from '../domain/weighing-session';
import type { AuditLog } from './audit-log';
import type { ComponentPreparation } from './component-preparation';
import type { WeighingContext } from './context';
import type { OperatorIdentification } from './operator-identification';

export class SessionSuspension {
  constructor(
    private readonly ctx: WeighingContext,
    private readonly scales: ScalePort,
    private readonly preparation: ComponentPreparation,
    private readonly identification: OperatorIdentification,
    private readonly auditLog: AuditLog,
  ) {}

  quit(sessionId: string): Promise<WeighingSession> {
    return this.preparation.lock.run(sessionId, async () => {
      const operator = this.identification.requireCurrent();
      const session = this.ctx.sessions.findById(sessionId);
      if (!session) throw new SessionNotFoundError(sessionId);
      const now = this.ctx.now();

      // What was on the scale, if known (best effort — quitting must work with a dead scale).
      const sequence = session.activeSequence;
      const active = sequence === null ? null : session.activeSnapshot(sequence);
      const weight = active?.preparation?.unlockedAt
        ? await this.weightOf(active.scale?.scaleId)
        : null;
      const dyestuffCode = sequence === null ? null : session.specOf(sequence).dyestuff.code;

      session.suspend(now); // IN_PROGRESS only (SESSION_NOT_IN_PROGRESS / SESSION_COMPLETED)
      this.ctx.atomically(() => {
        this.ctx.sessions.save(session);
        this.auditLog.record('ABANDON', operator.operatorId, sessionId, {
          sequence,
          dyestuffCode,
          weight,
          doneCount: session.doneCount,
        });
      });
      this.ctx.logger.info(
        { event: 'weighing-abandoned', sessionId, sequence, operatorId: operator.operatorId },
        'Batch quit; session suspended',
      );
      return session;
    });
  }

  private async weightOf(scaleId: string | null | undefined): Promise<Quantity | null> {
    if (!scaleId) return null;
    try {
      return (await this.scales.read(scaleId)).net;
    } catch {
      return null;
    }
  }
}

/** Use case: re-tare the active component (FR-23, ddd-01 invariant 20). Writes no record. */
import { DomainError } from '../../../errors';
import type { ScalePort } from '../../../integrations/scale/scale-port';
import { SessionNotFoundError } from '../domain/errors';
import type { WeighingSession } from '../domain/weighing-session';
import type { ComponentPreparation } from './component-preparation';
import type { WeighingContext } from './context';
import type { OperatorIdentification } from './operator-identification';

export class ComponentReTare {
  constructor(
    private readonly ctx: WeighingContext,
    private readonly scales: ScalePort,
    private readonly preparation: ComponentPreparation,
    private readonly identification: OperatorIdentification,
  ) {}

  retare(sessionId: string, sequence: number): Promise<WeighingSession> {
    return this.preparation.lock.run(sessionId, async () => {
      this.identification.requireCurrent();
      const session = this.ctx.sessions.findById(sessionId);
      if (!session) throw new SessionNotFoundError(sessionId);
      const component = session.activeSnapshot(sequence);
      session.requireUnlocked(sequence);
      const now = this.ctx.now();
      const scaleId = component.scale!.scaleId!;
      try {
        session.requireScaleUsable(await this.scales.getScale(scaleId), now);
        // No container hint: the operator has emptied the container; zero it as it stands (O-4).
        const tare = await this.scales.tare(scaleId);
        session.retare(sequence, tare, now);
      } catch (err) {
        if (err instanceof DomainError) {
          this.ctx.logger.warn(
            { event: 're-tare-refused', sessionId, sequence, reason: err.code },
            'Re-tare refused',
          );
        }
        throw err; // state unchanged: nothing was saved
      }
      this.ctx.sessions.save(session);
      this.ctx.logger.info(
        { event: 'component-retared', sessionId, sequence },
        'Component re-tared',
      );
      return session;
    });
  }
}

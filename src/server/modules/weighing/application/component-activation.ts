/** Use case: make a pending component the one being weighed (FR-6, TD-13) and choose its scale. */
import { SessionNotFoundError } from '../domain/errors';
import type { WeighingSession } from '../domain/weighing-session';
import type { WeighingContext } from './context';
import type { ComponentPreparation } from './component-preparation';

export class ComponentActivation {
  constructor(
    private readonly ctx: WeighingContext,
    private readonly preparation: ComponentPreparation,
  ) {}

  activate(sessionId: string, sequence: number): Promise<WeighingSession> {
    return this.preparation.lock.run(sessionId, async () => {
      const session = this.ctx.sessions.findById(sessionId);
      if (!session) throw new SessionNotFoundError(sessionId);
      const previous = session.activeSequence;
      session.activate(sequence, this.ctx.now());
      if (previous !== sequence) {
        await this.preparation.assignScale(session, sequence);
        this.ctx.sessions.save(session);
        this.ctx.logger.info(
          { event: 'component-activated', sessionId, sequence, previousSequence: previous },
          'Component activated',
        );
      }
      return session;
    });
  }
}

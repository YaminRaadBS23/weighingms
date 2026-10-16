/** Use case: make a pending component the one being weighed (FR-6, TD-13). */
import { SessionNotFoundError } from '../domain/errors';
import type { WeighingSession } from '../domain/weighing-session';
import type { WeighingContext } from './context';

export class ComponentActivation {
  constructor(private readonly ctx: WeighingContext) {}

  activate(sessionId: string, sequence: number): WeighingSession {
    const session = this.ctx.sessions.findById(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const previous = session.activeSequence;
    session.activate(sequence, this.ctx.now());
    if (previous !== sequence) {
      this.ctx.sessions.save(session);
      this.ctx.logger.info(
        { event: 'component-activated', sessionId, sequence, previousSequence: previous },
        'Component activated',
      );
    }
    return session;
  }
}

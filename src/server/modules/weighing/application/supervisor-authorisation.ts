/**
 * Supervisor authorisation for one action: badge + PIN (TD-6, NFR-14, ddd-02 Security Design).
 * Every failure is the same NOT_AUTHORISED, and the PIN is verified even when the badge is unknown
 * or not a supervisor's, so neither the answer nor its timing says which part was wrong.
 */
import { normaliseCode } from '../../../../shared/scan-codes';
import { NotAuthorisedError } from '../domain/errors';
import { isSupervisor, type Operator } from '../domain/operator';
import type { PinVerifier } from '../domain/repositories';
import type { WeighingContext } from './context';

export class SupervisorAuthorisationService {
  constructor(
    private readonly ctx: WeighingContext,
    private readonly pins: PinVerifier,
  ) {}

  authorise(rawBadge: string, pin: string): Operator {
    const badge = normaliseCode(rawBadge);
    const operator = this.ctx.operators.findByBadge(badge);
    const pinOk = this.pins.verify(pin, operator?.pinHash ?? null); // always does the hashing work
    if (!operator || !operator.active || !isSupervisor(operator) || !pinOk) {
      this.ctx.logger.warn({ event: 'supervisor-authorisation-failed', badge }, 'Not authorised');
      throw new NotAuthorisedError();
    }
    return operator;
  }
}

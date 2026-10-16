/** Use case: identify the operator at the station by badge (FR-1, ADR-2). */
import { normaliseCode } from '../../../../shared/scan-codes';
import { NotSignedInError, OperatorUnknownError } from '../domain/errors';
import type { Operator } from '../domain/operator';
import type { WeighingContext } from './context';

export class OperatorIdentification {
  constructor(private readonly ctx: WeighingContext) {}

  /** Signs in by badge (scanned or typed); replaces any operator already signed in. */
  signIn(rawBadge: string): Operator {
    const operator = this.ctx.operators.findByBadge(normaliseCode(rawBadge));
    if (!operator || !operator.active) {
      this.ctx.logger.warn({ event: 'sign-in-refused' }, 'Badge refused');
      throw new OperatorUnknownError();
    }
    this.ctx.station.setCurrentOperator(
      this.ctx.stationId,
      operator.operatorId,
      this.ctx.now().toISOString(),
    );
    this.ctx.logger.info(
      { event: 'signed-in', operatorId: operator.operatorId, role: operator.role },
      'Operator signed in',
    );
    return operator;
  }

  signOut(): void {
    const current = this.ctx.station.currentOperatorId(this.ctx.stationId);
    this.ctx.station.setCurrentOperator(this.ctx.stationId, null, this.ctx.now().toISOString());
    if (current) {
      this.ctx.logger.info({ event: 'signed-out', operatorId: current }, 'Operator signed out');
    }
  }

  current(): Operator | null {
    const id = this.ctx.station.currentOperatorId(this.ctx.stationId);
    return (id && this.ctx.operators.findById(id)) || null;
  }

  /** The signed-in operator, or NOT_SIGNED_IN. */
  requireCurrent(): Operator {
    const operator = this.current();
    if (!operator) throw new NotSignedInError();
    return operator;
  }
}

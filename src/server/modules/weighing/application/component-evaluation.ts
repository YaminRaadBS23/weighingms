/**
 * Use case: what would the station decide about the weight on the scale right now? Read-only: one
 * fresh reading, judged with the shared tolerance rules; nothing is written (ddd-02, story 014).
 */
import {
  evaluateZone,
  isConfirmable,
  isOverridable,
  surplus,
  toleranceBand,
} from '../../../../shared/domain/tolerance';
import type { ComponentEvaluationResponse } from '../../../../shared/weighing';
import { SessionNotFoundError } from '../domain/errors';
import type { ComponentMeasurement } from './component-measurement';
import type { WeighingContext } from './context';

export class ComponentEvaluation {
  constructor(
    private readonly ctx: WeighingContext,
    private readonly measurement: ComponentMeasurement,
  ) {}

  async evaluate(sessionId: string, sequence: number): Promise<ComponentEvaluationResponse> {
    const session = this.ctx.sessions.findById(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const { spec, reading } = await this.measurement.measure(session, sequence);
    const zone = evaluateZone(reading.net, spec);
    const band = toleranceBand(spec);
    return {
      weight: reading.net,
      stable: reading.stable,
      zone,
      lower: band.lower,
      upper: band.upper,
      surplus: zone === 'OVER' ? surplus(reading.net, spec) : null,
      confirmable: reading.stable && isConfirmable(zone),
      overridable: reading.stable && isOverridable(zone, reading.net),
    };
  }
}

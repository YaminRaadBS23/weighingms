/**
 * The steps that confirm, override and evaluation share (ddd-02): the component must be active and
 * unlocked on a usable scale, and ONE fresh reading is taken from it. The server measures — the
 * weight is never supplied by the client (ADR-7).
 */
import type { ScalePort, ScaleReading } from '../../../integrations/scale/scale-port';
import type { ComponentSpec, WeighingSession } from '../domain/weighing-session';
import type { WeighingContext } from './context';

export interface Measurement {
  scaleId: string;
  spec: ComponentSpec;
  reading: ScaleReading;
}

export class ComponentMeasurement {
  constructor(
    private readonly ctx: WeighingContext,
    private readonly scales: ScalePort,
  ) {}

  /** Throws the session/component/scale refusals (409 / 422 / 503); never judges the weight. */
  async measure(session: WeighingSession, sequence: number): Promise<Measurement> {
    const component = session.activeSnapshot(sequence); // in progress, exists, active
    session.requireUnlocked(sequence); // IDENTITY_NOT_VERIFIED
    const scaleId = component.scale!.scaleId!;
    session.requireScaleUsable(await this.scales.getScale(scaleId), this.ctx.now());
    const reading = await this.scales.read(scaleId);
    return { scaleId, spec: session.specOf(sequence), reading };
  }
}

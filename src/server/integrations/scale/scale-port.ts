/**
 * ScalePort — WeighingMS' only way to talk to the station scales.
 * Errors: ScaleNotFoundError (404), ScaleUnavailableError (503), ScaleProtocolError (502).
 */
import type { Quantity, Unit } from '../../../shared/quantity';

export type ScaleClass = 'PRECISION' | 'FLOOR';

export interface ScaleInfo {
  scaleId: string;
  class: ScaleClass;
  capacity: Quantity;
  /** Unit the scale reads in (g for the 3 kg precision scale, kg for the 32 kg floor scale). */
  unit: Unit;
  resolution: Quantity;
  calibrationDueAt: string;
  connected: boolean;
}

export interface ScaleReading {
  /** Net weight (gross − tare), in the scale's unit and resolution. */
  net: Quantity;
  stable: boolean;
  at: string;
}

export interface TareOptions {
  containerTare?: Quantity;
}

export interface ScalePort {
  listScales(): Promise<ScaleInfo[]>;
  getScale(scaleId: string): Promise<ScaleInfo>;
  read(scaleId: string): Promise<ScaleReading>;
  /**
   * Tares at the current load (container in place); returns the applied tare. `containerTare` is the
   * expected weight of the container: the Dummy Scale places it when the platform is empty (ADR-4);
   * a real adapter ignores it or uses it to check the tare it reads.
   */
  tare(scaleId: string, options?: TareOptions): Promise<Quantity>;
}

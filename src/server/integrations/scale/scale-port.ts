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

export interface ScalePort {
  listScales(): Promise<ScaleInfo[]>;
  getScale(scaleId: string): Promise<ScaleInfo>;
  read(scaleId: string): Promise<ScaleReading>;
  /** Tares at the current load (container in place); returns the applied tare. */
  tare(scaleId: string): Promise<Quantity>;
}

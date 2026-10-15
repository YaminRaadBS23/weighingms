/**
 * One simulated scale indicator (Dummy Scale, training only).
 * Holds gross weight, tare, connection and calibration in memory; readings are quantised to the
 * scale's resolution with decimal arithmetic. Clock and timers are injectable for deterministic tests.
 */
import Decimal from 'decimal.js';
import { convert, toDecimal, type Quantity, type Unit } from '../../../../shared/quantity';
import type { DummyReading, DummyScale, DummyScaleClass } from './contract';

export interface ScaleConfig {
  scaleId: string;
  class: DummyScaleClass;
  capacity: Quantity;
  unit: Unit;
  resolution: Quantity;
  calibrationDueAt: string;
}

export interface DeviceClock {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const systemClock: DeviceClock = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
};

/** A reading is stable once the gross weight has been unchanged this long (TD-9). */
export const STABLE_AFTER_MS = 500;
/** Tick of the dispense simulation. */
export const DISPENSE_TICK_MS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export class ScaleDeviceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class ScaleDevice {
  private gross = new Decimal(0);
  private tareValue = new Decimal(0);
  private connected = true;
  private calibrationDueAt: string;
  private lastChangeMs = Number.NEGATIVE_INFINITY;
  private dispenseTimer: unknown = null;
  private readonly decimals: number;

  constructor(
    readonly config: ScaleConfig,
    private readonly clock: DeviceClock = systemClock,
  ) {
    this.calibrationDueAt = config.calibrationDueAt;
    this.decimals = toDecimal(convert(config.resolution, config.unit).value).decimalPlaces();
  }

  describe(): DummyScale {
    return {
      scaleId: this.config.scaleId,
      class: this.config.class,
      capacity: this.config.capacity,
      unit: this.config.unit,
      resolution: this.config.resolution,
      calibrationDueAt: this.calibrationDueAt,
      connected: this.connected,
    };
  }

  /** Current reading; throws 503 while disconnected. */
  reading(): DummyReading {
    this.requireConnected();
    const now = this.clock.now();
    return {
      gross: this.q(this.gross),
      tare: this.q(this.tareValue),
      net: this.q(this.gross.minus(this.tareValue)),
      stable: now - this.lastChangeMs >= STABLE_AFTER_MS,
      at: new Date(now).toISOString(),
    };
  }

  /** Tares at the current gross weight and returns the applied tare. */
  tare(): Quantity {
    this.requireConnected();
    this.tareValue = this.gross;
    return this.q(this.tareValue);
  }

  // ── Simulation (training only) ────────────────────────────────────────────

  /** Sets the net weight exactly (gross = tare + net). Cancels a running dispense. */
  setNet(net: Quantity | string): void {
    this.stopDispense();
    this.setGross(this.tareValue.plus(this.toDeviceUnit(net)));
  }

  /** Places an empty container of the given weight on the platform (gross = weight). */
  placeContainer(weight: Quantity | string): void {
    this.stopDispense();
    this.setGross(this.toDeviceUnit(weight));
  }

  /**
   * Moves the net weight towards `landing`, fast at first and slowing near the end
   * (like an operator pouring), then stops exactly on `landing`.
   */
  dispense(landing: Quantity | string): void {
    this.stopDispense();
    const target = this.quantise(this.toDeviceUnit(landing));
    const minStep = toDecimal(convert(this.config.resolution, this.config.unit).value);
    const floorStep = Decimal.max(target.abs().times('0.004'), minStep);
    this.dispenseTimer = this.clock.setInterval(() => {
      const net = this.gross.minus(this.tareValue);
      const remaining = target.minus(net);
      if (remaining.abs().lte(minStep.dividedBy(2))) {
        this.setGross(this.tareValue.plus(target));
        this.stopDispense();
        return;
      }
      const step = Decimal.max(floorStep, remaining.abs().times('0.055'));
      const move = Decimal.min(step, remaining.abs()).times(remaining.isNegative() ? -1 : 1);
      this.setGross(this.quantise(this.gross.plus(move)));
    }, DISPENSE_TICK_MS);
  }

  isDispensing(): boolean {
    return this.dispenseTimer !== null;
  }

  disconnect(): void {
    this.stopDispense();
    this.connected = false;
  }

  reconnect(): void {
    this.connected = true;
  }

  /** Expired → due date yesterday; valid → configured due date. */
  setCalibrationExpired(expired: boolean): void {
    this.calibrationDueAt = expired
      ? new Date(this.clock.now() - DAY_MS).toISOString()
      : this.config.calibrationDueAt;
  }

  /** Back to the seeded state: empty, no tare, connected, valid calibration. */
  reset(): void {
    this.stopDispense();
    this.gross = new Decimal(0);
    this.tareValue = new Decimal(0);
    this.connected = true;
    this.calibrationDueAt = this.config.calibrationDueAt;
    this.lastChangeMs = Number.NEGATIVE_INFINITY;
  }

  stopDispense(): void {
    if (this.dispenseTimer !== null) {
      this.clock.clearInterval(this.dispenseTimer);
      this.dispenseTimer = null;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private requireConnected(): void {
    if (!this.connected) {
      throw new ScaleDeviceError(503, 'SCALE_OFFLINE', `Scale ${this.config.scaleId} is offline`);
    }
  }

  private setGross(value: Decimal): void {
    const next = this.quantise(value);
    if (!next.equals(this.gross)) {
      this.gross = next;
      this.lastChangeMs = this.clock.now();
    }
  }

  private toDeviceUnit(input: Quantity | string): Decimal {
    const q = typeof input === 'string' ? { value: input, unit: this.config.unit } : input;
    return toDecimal(convert(q, this.config.unit).value);
  }

  private quantise(value: Decimal): Decimal {
    return value.toDecimalPlaces(this.decimals, Decimal.ROUND_HALF_UP);
  }

  private q(value: Decimal): Quantity {
    return { value: this.quantise(value).toFixed(this.decimals), unit: this.config.unit };
  }
}

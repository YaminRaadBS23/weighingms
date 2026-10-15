import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../../test-support';
import { DISPENSE_TICK_MS, ScaleDevice, STABLE_AFTER_MS, type ScaleConfig } from './scale-device';

const PRECISION: ScaleConfig = {
  scaleId: 'scale-3kg',
  class: 'PRECISION',
  capacity: { value: '3', unit: 'kg' },
  unit: 'g',
  resolution: { value: '0.1', unit: 'g' },
  calibrationDueAt: '2027-03-31T00:00:00Z',
};
const FLOOR: ScaleConfig = {
  scaleId: 'scale-32kg',
  class: 'FLOOR',
  capacity: { value: '32', unit: 'kg' },
  unit: 'kg',
  resolution: { value: '0.001', unit: 'kg' },
  calibrationDueAt: '2027-03-31T00:00:00Z',
};

function device(config = PRECISION) {
  const clock = new ManualClock();
  return { clock, scale: new ScaleDevice(config, clock) };
}

describe('ScaleDevice (Dummy Scale, training)', () => {
  it('starts empty, stable and connected', () => {
    const { scale } = device();
    expect(scale.reading()).toMatchObject({
      gross: { value: '0.0', unit: 'g' },
      tare: { value: '0.0', unit: 'g' },
      net: { value: '0.0', unit: 'g' },
      stable: true,
    });
    expect(scale.describe().connected).toBe(true);
  });

  it('computes net = gross − tare; container 214 g + tare gives 0.0 g', () => {
    const { scale } = device();
    scale.placeContainer('214.0');
    expect(scale.reading().net).toEqual({ value: '214.0', unit: 'g' });
    expect(scale.tare()).toEqual({ value: '214.0', unit: 'g' });
    expect(scale.reading()).toMatchObject({
      gross: { value: '214.0', unit: 'g' },
      net: { value: '0.0', unit: 'g' },
    });
  });

  it('a second tare replaces the first', () => {
    const { scale } = device();
    scale.placeContainer('214.0');
    scale.tare();
    scale.setNet('50.0');
    expect(scale.tare()).toEqual({ value: '264.0', unit: 'g' });
    expect(scale.reading().net.value).toBe('0.0');
  });

  it.each(['93.4', '93.5', '94.0', '94.5', '94.6'])('sets net weight exactly to %s g', (net) => {
    const { scale } = device();
    scale.placeContainer('214.0');
    scale.tare();
    scale.setNet(net);
    expect(scale.reading().net).toEqual({ value: net, unit: 'g' });
  });

  it('quantises to the resolution: 0.1 g on the precision scale, 0.001 kg on the floor scale', () => {
    const p = device().scale;
    p.setNet('94.26');
    expect(p.reading().net.value).toBe('94.3');
    const f = device(FLOOR).scale;
    f.setNet('24.0604');
    expect(f.reading().net).toEqual({ value: '24.060', unit: 'kg' });
  });

  it('accepts a quantity in another unit and converts it exactly', () => {
    const f = device(FLOOR).scale;
    f.placeContainer({ value: '1850', unit: 'g' });
    expect(f.reading().gross).toEqual({ value: '1.850', unit: 'kg' });
  });

  it(`is stable only after ${STABLE_AFTER_MS} ms without change`, () => {
    const { clock, scale } = device();
    scale.setNet('90.0');
    expect(scale.reading().stable).toBe(false);
    clock.advance(STABLE_AFTER_MS - 1);
    expect(scale.reading().stable).toBe(false);
    clock.advance(1);
    expect(scale.reading().stable).toBe(true);
    scale.setNet('90.0'); // same value: no change, stays stable
    expect(scale.reading().stable).toBe(true);
    scale.setNet('90.1');
    expect(scale.reading().stable).toBe(false);
  });

  it('dispense eases to the landing (fast first, slower near the end) and then becomes stable', () => {
    const { clock, scale } = device();
    scale.placeContainer('214.0');
    scale.tare();
    scale.dispense('94.2');
    const values: number[] = [];
    while (scale.isDispensing()) {
      clock.advance(DISPENSE_TICK_MS);
      values.push(Number(scale.reading().net.value));
    }
    expect(values.at(-1)).toBe(94.2);
    expect(scale.reading().net).toEqual({ value: '94.2', unit: 'g' });
    const steps = values.map((v, i) => v - (i === 0 ? 0 : values[i - 1]!));
    expect(steps[0]!).toBeGreaterThan(steps.at(-2)!);
    expect(values.every((v, i) => i === 0 || v >= values[i - 1]!)).toBe(true);
    expect(scale.reading().stable).toBe(false);
    clock.advance(STABLE_AFTER_MS);
    expect(scale.reading().stable).toBe(true);
  });

  it('overshoot dispense lands exactly on 96.4 g (target + 4.8 × tolerance)', () => {
    const { clock, scale } = device();
    scale.dispense('96.4');
    clock.advance(10_000);
    expect(scale.isDispensing()).toBe(false);
    expect(scale.reading().net.value).toBe('96.4');
  });

  it('dispenses downwards as well (removing excess)', () => {
    const { clock, scale } = device();
    scale.setNet('96.4');
    scale.dispense('94.0');
    clock.advance(10_000);
    expect(scale.reading().net.value).toBe('94.0');
  });

  it('dispenses on the floor scale in kg', () => {
    const { clock, scale } = device(FLOOR);
    scale.dispense('23.980');
    clock.advance(20_000);
    expect(scale.reading().net).toEqual({ value: '23.980', unit: 'kg' });
  });

  it('a new weight command cancels a running dispense', () => {
    const { clock, scale } = device();
    scale.dispense('94.2');
    clock.advance(DISPENSE_TICK_MS * 3);
    scale.setNet('10.0');
    expect(scale.isDispensing()).toBe(false);
    clock.advance(5_000);
    expect(scale.reading().net.value).toBe('10.0');
  });

  it('disconnected: reading and tare fail with 503 SCALE_OFFLINE; reconnect restores', () => {
    const { scale } = device();
    scale.setNet('50.0');
    scale.disconnect();
    expect(() => scale.reading()).toThrow(
      expect.objectContaining({ status: 503, code: 'SCALE_OFFLINE' }),
    );
    expect(() => scale.tare()).toThrow(expect.objectContaining({ status: 503 }));
    expect(scale.describe().connected).toBe(false);
    scale.reconnect();
    expect(scale.reading().net.value).toBe('50.0');
  });

  it('calibration can be expired and restored', () => {
    const { clock, scale } = device();
    scale.setCalibrationExpired(true);
    expect(Date.parse(scale.describe().calibrationDueAt)).toBeLessThan(clock.now());
    scale.setCalibrationExpired(false);
    expect(scale.describe().calibrationDueAt).toBe('2027-03-31T00:00:00Z');
  });

  it('reset returns to the seeded state', () => {
    const { scale } = device();
    scale.placeContainer('214.0');
    scale.tare();
    scale.setNet('50.0');
    scale.disconnect();
    scale.setCalibrationExpired(true);
    scale.reset();
    expect(scale.reading()).toMatchObject({
      gross: { value: '0.0' },
      tare: { value: '0.0' },
      stable: true,
    });
    expect(scale.describe()).toMatchObject({
      connected: true,
      calibrationDueAt: '2027-03-31T00:00:00Z',
    });
  });
});

import type { FastifyInstance } from 'fastify';
import { buildApp, injectHttpClient } from './app';
import type { DeviceClock } from './integrations/scale/dummy/scale-device';
import { loadConfig, type AppConfig } from './config';
import type { DummyConsumptionRequest } from './integrations/orgatex/dummy/contract';

/** Test configuration: silent logs, repository seed data, short OrgaTEX timeout. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...loadConfig({ APP_ENV: 'test', ORGATEX_TIMEOUT_MS: '200' }), ...overrides };
}

/** Builds a fresh app with an in-memory Dummy OrgaTEX reached through Fastify inject. */
export async function buildTestApp(
  overrides: Partial<AppConfig> = {},
  deviceClock?: DeviceClock,
): Promise<FastifyInstance> {
  return buildApp({
    config: testConfig(overrides),
    orgatexDbFile: ':memory:',
    weighingDbFile: ':memory:',
    orgatexHttpClient: (app) => injectHttpClient(app),
    scaleHttpClient: (app) => injectHttpClient(app, '/ext/scale'),
    scannerHttpClient: (app) => injectHttpClient(app, '/ext/scanner'),
    printerHttpClient: (app) => injectHttpClient(app, '/ext/printer'),
    ...(deviceClock ? { deviceClock } : {}),
  });
}

/** The five prototype lines for B-24187 (ticket actuals from the prototype). */
export function prototypePosting(overrides: Partial<DummyConsumptionRequest> = {}) {
  const line = (
    sequence: number,
    dyestuffCode: string,
    lotId: string,
    actual: string,
    target: string,
    unit: 'g' | 'kg',
  ) => ({
    sequence,
    dyestuffCode,
    lotId,
    actual: { value: actual, unit },
    target: { value: target, unit },
    result: 'IN_TOLERANCE',
  });
  return {
    completedAt: '2026-10-15T07:48:22Z',
    operatorId: 'OP-RKARIM',
    lines: [
      line(1, 'DYE-1180', '2026-0341', '1241.5', '1240.0', 'g'),
      line(2, 'DYE-2204', '2026-0298', '385.4', '386.0', 'g'),
      line(3, 'DYE-4471', '2026-0387', '94.2', '94.0', 'g'),
      line(4, 'AUX-0101', '2026-0112', '23.980', '24.000', 'kg'),
      line(5, 'AUX-0107', '2026-0155', '9.621', '9.600', 'kg'),
    ],
    ...overrides,
  } satisfies DummyConsumptionRequest;
}

/**
 * Manually advanced clock for the simulated scales: `advance(ms)` moves time forward and runs
 * every interval timer that falls due, in order. Makes stability and dispensing deterministic.
 */
export class ManualClock implements DeviceClock {
  private t: number;
  private nextId = 0;
  private readonly timers = new Map<number, { fn: () => void; ms: number; due: number }>();

  constructor(start = '2026-10-15T07:47:03Z') {
    this.t = Date.parse(start);
  }

  now(): number {
    return this.t;
  }

  setInterval(fn: () => void, ms: number): unknown {
    this.nextId += 1;
    this.timers.set(this.nextId, { fn, ms, due: this.t + ms });
    return this.nextId;
  }

  clearInterval(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      let nextId: number | undefined;
      let nextDue = Number.POSITIVE_INFINITY;
      for (const [id, timer] of this.timers) {
        if (timer.due <= end && timer.due < nextDue) {
          nextId = id;
          nextDue = timer.due;
        }
      }
      if (nextId === undefined) break;
      const timer = this.timers.get(nextId)!;
      this.t = timer.due;
      timer.due += timer.ms;
      timer.fn();
    }
    this.t = end;
  }
}

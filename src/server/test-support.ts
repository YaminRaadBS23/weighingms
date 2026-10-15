import type { FastifyInstance } from 'fastify';
import { buildApp, injectHttpClient } from './app';
import { loadConfig, type AppConfig } from './config';
import type { DummyConsumptionRequest } from './integrations/orgatex/dummy/contract';

/** Test configuration: silent logs, repository seed data, short OrgaTEX timeout. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...loadConfig({ APP_ENV: 'test', ORGATEX_TIMEOUT_MS: '200' }), ...overrides };
}

/** Builds a fresh app with an in-memory Dummy OrgaTEX reached through Fastify inject. */
export async function buildTestApp(overrides: Partial<AppConfig> = {}): Promise<FastifyInstance> {
  return buildApp({
    config: testConfig(overrides),
    orgatexDbFile: ':memory:',
    orgatexHttpClient: (app) => injectHttpClient(app),
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

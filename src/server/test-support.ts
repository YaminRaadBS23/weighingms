import type { FastifyInstance } from 'fastify';
import { buildApp, injectHttpClient } from './app';
import { loadConfig, type AppConfig } from './config';

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

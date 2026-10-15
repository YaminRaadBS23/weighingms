import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { ErrorCode, type ErrorBody } from '../shared/errors';
import type { AppConfig } from './config';
import { DomainError } from './errors';
import { openOrgatexDb, type OrgatexDb } from './integrations/orgatex/dummy/db';
import { dummyOrgatexRoutes } from './integrations/orgatex/dummy/routes';
import { readSeedFile, seedIfEmpty } from './integrations/orgatex/dummy/seed';
import type { DummyOrgatexSimulation } from './integrations/orgatex/dummy/simulation';
import {
  fetchHttpClient,
  HttpOrgatexAdapter,
  parseBody,
  type HttpClient,
} from './integrations/orgatex/http-orgatex-adapter';
import type { OrgatexPort } from './integrations/orgatex/orgatex-port';
import { healthRoutes } from './routes/health';

export interface AppDeps {
  config: AppConfig;
  /** Dummy OrgaTEX database file; defaults to `<dataDir>/orgatex.db`. Use ':memory:' in tests. */
  orgatexDbFile?: string;
  /** Overrides the transport used by the OrgaTEX adapter (tests use Fastify inject). */
  orgatexHttpClient?: (app: FastifyInstance) => HttpClient;
}

declare module 'fastify' {
  interface FastifyInstance {
    orgatex: OrgatexPort;
    orgatexDb: OrgatexDb;
  }
}

/** Builds the WeighingMS application (used by main.ts and by tests). */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({ logger: { level: config.logLevel } });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof DomainError) {
      return reply.code(err.httpStatus).send(err.toBody());
    }
    const { validation, message } = err as { validation?: unknown; message?: string };
    if (validation) {
      const body: ErrorBody = {
        error: { code: ErrorCode.VALIDATION_ERROR, message: message ?? 'Invalid request' },
      };
      return reply.code(400).send(body);
    }
    req.log.error({ err }, 'Unhandled error');
    const body: ErrorBody = {
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' },
    };
    return reply.code(500).send(body);
  });

  app.setNotFoundHandler((req, reply) => {
    const body: ErrorBody = {
      error: { code: ErrorCode.NOT_FOUND, message: `Route ${req.method} ${req.url} not found` },
    };
    return reply.code(404).send(body);
  });

  // ── Dummy OrgaTEX (training substitute, own database) ───────────────────
  const orgatexDb = openOrgatexDb(deps.orgatexDbFile ?? path.join(config.dataDir, 'orgatex.db'));
  const orgatexSeed = readSeedFile(path.join(config.dataDir, 'seed', 'orgatex-seed.json'));
  seedIfEmpty(orgatexDb.db, orgatexSeed);
  app.decorate('orgatexDb', orgatexDb.db);
  app.addHook('onClose', async () => orgatexDb.close());
  const orgatexSimulation: DummyOrgatexSimulation = { online: true };
  await app.register(dummyOrgatexRoutes, {
    prefix: '/ext/orgatex',
    db: orgatexDb.db,
    // Training-only `_sim` controls exist only when simulation is enabled (never in production).
    ...(config.enableSimulation
      ? { simulation: { state: orgatexSimulation, seed: orgatexSeed } }
      : {}),
  });

  // ── Ports (WeighingMS reaches external systems only through these) ─────
  const client = deps.orgatexHttpClient?.(app) ?? fetchHttpClient(config.orgatexBaseUrl);
  app.decorate(
    'orgatex',
    new HttpOrgatexAdapter({
      client,
      timeoutMs: config.orgatexTimeoutMs,
      logger: app.log.child({ component: 'orgatex-adapter' }),
    }),
  );

  // ── WeighingMS API ──────────────────────────────────────────────────────
  await app.register(healthRoutes, { prefix: '/api' });

  return app;
}

/** Transport that calls the in-process Dummy OrgaTEX through Fastify inject (tests). */
export function injectHttpClient(app: FastifyInstance, prefix = '/ext/orgatex'): HttpClient {
  return {
    async request(req) {
      const res = await app.inject({
        method: req.method,
        url: `${prefix}${req.path}`,
        ...(req.headers ? { headers: req.headers } : {}),
        ...(req.body !== undefined ? { payload: req.body as object } : {}),
      });
      return { status: res.statusCode, body: parseBody(res.body) };
    },
  };
}

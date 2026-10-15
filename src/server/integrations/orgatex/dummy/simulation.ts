/**
 * Training-only simulation controls for Dummy OrgaTEX (`/ext/orgatex/_sim/...`).
 * Registered only when simulation is enabled (development/test), never in production.
 * WeighingMS application code never calls these; tests, demos and the Training Panel do.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import type { OrgatexDb } from './db';
import { consumptionPostings } from './schema';
import { loadSeed, type OrgatexSeed } from './seed';

/** Mutable simulation state owned by one Dummy OrgaTEX instance. */
export interface DummyOrgatexSimulation {
  online: boolean;
}

export interface SimulationRouteOptions {
  db: OrgatexDb;
  seed: OrgatexSeed;
  state: DummyOrgatexSimulation;
}

/** onRequest hook: while offline, every business endpoint answers 503 (the `_sim` routes stay usable). */
export function offlineGuard(state: DummyOrgatexSimulation) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (state.online || req.routeOptions.url?.includes('/_sim/')) return;
    return reply.code(503).send({
      error: { code: 'ORGATEX_OFFLINE', message: 'Dummy OrgaTEX is offline (simulated)' },
    });
  };
}

export async function dummyOrgatexSimulationRoutes(
  app: FastifyInstance,
  opts: SimulationRouteOptions,
) {
  const { db, seed, state } = opts;
  const describe = () => ({
    online: state.online,
    postings:
      db
        .select({ n: sql<number>`count(*)` })
        .from(consumptionPostings)
        .get()?.n ?? 0,
  });

  app.get('/_sim/state', async () => describe());

  app.post('/_sim/offline', async () => {
    state.online = false;
    return describe();
  });

  app.post('/_sim/online', async () => {
    state.online = true;
    return describe();
  });

  /** Restores the seed scenario: batch statuses, no postings, online. */
  app.post('/_sim/reset', async () => {
    loadSeed(db, seed);
    state.online = true;
    return describe();
  });
}

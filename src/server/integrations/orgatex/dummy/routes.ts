/**
 * Dummy OrgaTEX HTTP API — read endpoints under /ext/orgatex.
 * TRAINING CONTRACT ONLY: a stand-in for OrgaTEX while the real interface is unknown (brief A-01).
 * Only the WeighingMS OrgaTEX adapter calls these endpoints; the station UI never does.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import type { Unit } from '../../../../shared/quantity';
import type { OrgatexDb } from './db';
import type {
  DummyBatch,
  DummyBatchList,
  DummyBatchStatus,
  DummyLotList,
  DummyRecipe,
} from './contract';
import { batches, dyestuffs, lots, recipeComponents, recipes } from './schema';

export interface DummyOrgatexOptions {
  db: OrgatexDb;
  now?: () => Date;
}

function notFound(reply: FastifyReply, code: string, message: string) {
  return reply.code(404).send({ error: { code, message } });
}

function toBatch(row: typeof batches.$inferSelect): DummyBatch {
  return {
    batchId: row.batchId,
    orderRef: row.orderRef,
    machineRef: row.machineRef,
    fabricDesc: row.fabricDesc,
    fabricWeight: { value: row.fabricWeightValue, unit: row.fabricWeightUnit as Unit },
    shade: row.shade,
    componentCount: row.componentCount,
    status: row.status as DummyBatchStatus,
    recipeId: row.recipeId,
    releasedAt: row.releasedAt,
  };
}

export async function dummyOrgatexRoutes(app: FastifyInstance, opts: DummyOrgatexOptions) {
  const { db } = opts;
  const now = opts.now ?? (() => new Date());

  app.get('/ping', async () => ({ status: 'ok', at: now().toISOString() }));

  app.get<{ Params: { stationId: string } }>('/stations/:stationId/batches', async (req) => {
    const rows = db
      .select()
      .from(batches)
      .where(eq(batches.stationId, req.params.stationId))
      .orderBy(asc(batches.queuePosition))
      .all();
    const body: DummyBatchList = { items: rows.map(toBatch), generatedAt: now().toISOString() };
    return body;
  });

  app.get<{ Params: { batchId: string } }>('/batches/:batchId', async (req, reply) => {
    const row = db.select().from(batches).where(eq(batches.batchId, req.params.batchId)).get();
    if (!row) return notFound(reply, 'BATCH_NOT_FOUND', `Batch ${req.params.batchId} not found`);
    return toBatch(row);
  });

  app.get<{ Params: { batchId: string } }>('/batches/:batchId/recipe', async (req, reply) => {
    const { batchId } = req.params;
    const batch = db.select().from(batches).where(eq(batches.batchId, batchId)).get();
    if (!batch) return notFound(reply, 'BATCH_NOT_FOUND', `Batch ${batchId} not found`);
    if (!batch.recipeId) {
      return notFound(reply, 'RECIPE_NOT_FOUND', `No recipe released for batch ${batchId}`);
    }
    const recipe = db.select().from(recipes).where(eq(recipes.recipeId, batch.recipeId)).get();
    if (!recipe) return notFound(reply, 'RECIPE_NOT_FOUND', `Recipe ${batch.recipeId} not found`);
    const rows = db
      .select()
      .from(recipeComponents)
      .innerJoin(dyestuffs, eq(recipeComponents.dyestuffCode, dyestuffs.code))
      .where(eq(recipeComponents.recipeId, recipe.recipeId))
      .orderBy(asc(recipeComponents.sequence))
      .all();
    const body: DummyRecipe = {
      recipeId: recipe.recipeId,
      batchId,
      shade: recipe.shade,
      version: recipe.version,
      components: rows.map(({ recipe_components: c, dyestuffs: d }) => ({
        sequence: c.sequence,
        dyestuff: {
          code: d.code,
          name: d.name,
          ticketShortName: d.ticketShortName,
          colourHex: d.colourHex,
          type: d.type,
        },
        target: { value: c.targetValue, unit: c.targetUnit as Unit },
        tolerance: { value: c.toleranceValue, unit: c.toleranceUnit as Unit },
        barMax: { value: c.barMaxValue, unit: c.barMaxUnit as Unit },
        suggestedLot: c.suggestedLot,
      })),
    };
    return body;
  });

  app.get<{ Params: { code: string } }>('/dyestuffs/:code/lots', async (req, reply) => {
    const { code } = req.params;
    const dyestuff = db.select().from(dyestuffs).where(eq(dyestuffs.code, code)).get();
    if (!dyestuff) return notFound(reply, 'DYESTUFF_NOT_FOUND', `Dyestuff ${code} not found`);
    const rows = db
      .select()
      .from(lots)
      .where(eq(lots.dyestuffCode, code))
      .orderBy(asc(lots.lotId))
      .all();
    const body: DummyLotList = { items: rows };
    return body;
  });
}

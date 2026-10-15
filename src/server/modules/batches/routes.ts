/**
 * WeighingMS `/api/batches` facade (workbook Steps 18–19). Delegates to Dummy OrgaTEX through the
 * BatchService and OrgatexPort; OrgaTEX unreachable → 503 ORGATEX_UNAVAILABLE, never an empty queue.
 */
import type { FastifyInstance } from 'fastify';
import type {
  BatchDetailResponse,
  BatchQueueResponse,
  RecipeResponse,
} from '../../../shared/batches';
import type { BatchService } from './batch-service';

export async function batchRoutes(app: FastifyInstance, opts: { batches: BatchService }) {
  const { batches } = opts;

  app.get('/batches', async () => {
    const body: BatchQueueResponse = await batches.getQueue();
    return body;
  });

  app.get<{ Params: { batchId: string } }>('/batches/:batchId', async (req) => {
    const body: BatchDetailResponse = await batches.getBatch(req.params.batchId);
    return body;
  });

  app.get<{ Params: { batchId: string } }>('/batches/:batchId/recipe', async (req) => {
    const body: RecipeResponse = await batches.getRecipe(req.params.batchId);
    return body;
  });
}

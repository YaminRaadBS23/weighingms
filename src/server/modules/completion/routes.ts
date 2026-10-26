/** Presentation: write-back and summary endpoints (ddd-02-technical-design.md, API Design). */
import type { FastifyInstance } from 'fastify';
import type {
  CompletionSummaryResponse,
  PendingCountResponse,
  WriteBackView,
} from '../../../shared/completion';
import type { CompletionModule } from './module';

export async function completionRoutes(
  app: FastifyInstance,
  opts: { completion: CompletionModule },
) {
  const { writeBacks, summary } = opts.completion;

  app.post<{ Params: { batchId: string } }>('/batches/:batchId/consumption', async (req) => {
    const header = req.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;
    const body: WriteBackView = await writeBacks.post(req.params.batchId, key);
    return body;
  });

  app.get<{ Params: { batchId: string } }>('/batches/:batchId/write-back', async (req) => {
    const body: WriteBackView = writeBacks.status(req.params.batchId);
    return body;
  });

  app.post<{ Params: { batchId: string } }>('/batches/:batchId/write-back/retry', async (req) => {
    const body: WriteBackView = await writeBacks.retry(req.params.batchId);
    return body;
  });

  app.get('/write-backs/pending-count', async () => {
    const body: PendingCountResponse = { count: writeBacks.pendingCount() };
    return body;
  });

  app.get<{ Params: { batchId: string } }>('/batches/:batchId/summary', async (req) => {
    const body: CompletionSummaryResponse = summary.summary(req.params.batchId);
    return body;
  });
}

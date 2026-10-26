/** Presentation: ticket endpoints (ddd-02-technical-design.md, API Design; ADR-11). */
import type { FastifyInstance } from 'fastify';
import { ErrorCode } from '../../../shared/errors';
import type {
  BatchTicketsResponse,
  CreateTicketRequest,
  TicketPreview,
  TicketView,
} from '../../../shared/ticket';
import type { CompletionModule } from './module';

export async function ticketRoutes(app: FastifyInstance, opts: { completion: CompletionModule }) {
  const { tickets } = opts.completion;

  app.post<{ Body: Partial<CreateTicketRequest> | undefined }>('/tickets', async (req, reply) => {
    const batchId = req.body?.batchId;
    if (typeof batchId !== 'string' || batchId.trim() === '' || batchId.length > 64) {
      return reply.code(400).send({
        error: { code: ErrorCode.VALIDATION_ERROR, message: 'batchId is required' },
      });
    }
    const { ticket, created } = await tickets.generate(batchId);
    const body: TicketView = tickets.view(ticket);
    return reply.code(created ? 201 : 200).send(body);
  });

  app.get<{ Params: { ticketId: string } }>('/tickets/:ticketId', async (req) => {
    const body: TicketView = tickets.view(tickets.get(req.params.ticketId));
    return body;
  });

  app.get<{ Params: { ticketId: string } }>('/tickets/:ticketId/preview', async (req) => {
    const body: TicketPreview = tickets.preview(tickets.get(req.params.ticketId));
    return body;
  });

  app.post<{ Params: { ticketId: string } }>('/tickets/:ticketId/print', async (req) => {
    const body: TicketView = tickets.view(await tickets.print(req.params.ticketId));
    return body;
  });

  app.post<{ Params: { ticketId: string } }>('/tickets/:ticketId/reprint', async (req, reply) => {
    const body: TicketView = tickets.view(await tickets.reprint(req.params.ticketId));
    return reply.code(201).send(body);
  });

  app.get<{ Params: { batchId: string } }>('/batches/:batchId/tickets', async (req) => {
    const body: BatchTicketsResponse = {
      tickets: tickets.forBatch(req.params.batchId).map((t) => tickets.view(t)),
    };
    return body;
  });
}

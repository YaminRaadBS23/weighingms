/** Presentation: `/api/operators` and `/api/sessions` (ddd-02-technical-design.md, API Design). */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { ErrorCode } from '../../../shared/errors';
import type {
  AuditListResponse,
  CurrentOperatorResponse,
  CurrentSessionResponse,
  OperatorView,
  SessionView,
  SignInRequest,
  StartSessionRequest,
} from '../../../shared/weighing';
import { SessionNotFoundError } from './domain/errors';
import type { WeighingModule } from './module';

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: { code: ErrorCode.VALIDATION_ERROR, message } });
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export async function weighingRoutes(app: FastifyInstance, opts: { weighing: WeighingModule }) {
  const w = opts.weighing;

  // ── Operators ─────────────────────────────────────────────────────────────

  app.post<{ Body: SignInRequest }>('/operators/sign-in', async (req, reply) => {
    if (!nonEmpty(req.body?.badge)) return badRequest(reply, 'badge is required');
    const body: OperatorView = w.toOperatorView(w.identification.signIn(req.body.badge));
    return body;
  });

  app.get('/operators/current', async () => {
    const current = w.identification.current();
    const body: CurrentOperatorResponse = { operator: current ? w.toOperatorView(current) : null };
    return body;
  });

  app.post('/operators/sign-out', async () => {
    w.identification.signOut();
    const body: CurrentOperatorResponse = { operator: null };
    return body;
  });

  // ── Sessions ──────────────────────────────────────────────────────────────

  app.post<{ Body: StartSessionRequest }>('/sessions', async (req, reply) => {
    if (!nonEmpty(req.body?.batchId)) return badRequest(reply, 'batchId is required');
    const { session, resumed } = await w.starter.startOrResume(req.body.batchId);
    const body: SessionView = w.toSessionView(session);
    return reply.code(resumed ? 200 : 201).send(body);
  });

  app.get('/sessions/current', async () => {
    const session = w.ctx.sessions.findInProgressForStation(w.ctx.stationId);
    const body: CurrentSessionResponse = { session: session ? w.toSessionView(session) : null };
    return body;
  });

  app.get<{ Params: { sessionId: string } }>('/sessions/:sessionId', async (req) => {
    const session = w.ctx.sessions.findById(req.params.sessionId);
    if (!session) throw new SessionNotFoundError(req.params.sessionId);
    const body: SessionView = w.toSessionView(session);
    return body;
  });

  app.post<{ Params: { sessionId: string; sequence: string } }>(
    '/sessions/:sessionId/components/:sequence/activate',
    async (req, reply) => {
      const sequence = Number(req.params.sequence);
      if (!Number.isInteger(sequence) || sequence < 1) {
        return badRequest(reply, 'sequence must be a positive integer');
      }
      const body: SessionView = w.toSessionView(
        w.activation.activate(req.params.sessionId, sequence),
      );
      return body;
    },
  );

  app.get<{ Params: { sessionId: string } }>('/sessions/:sessionId/audit', async (req) => {
    if (!w.ctx.sessions.findById(req.params.sessionId)) {
      throw new SessionNotFoundError(req.params.sessionId);
    }
    const body: AuditListResponse = {
      items: w.auditLog.listForSession(req.params.sessionId).map((e) => ({
        eventId: e.eventId,
        sessionId: e.sessionId,
        type: e.type,
        actor: { operatorId: e.actorId, name: w.nameOf(e.actorId) },
        detail: { ...e.detail },
        occurredAt: e.occurredAt,
      })),
    };
    return body;
  });
}

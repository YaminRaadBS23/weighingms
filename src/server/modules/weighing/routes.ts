/** Presentation: `/api/operators` and `/api/sessions` (ddd-02-technical-design.md, API Design). */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { ErrorCode } from '../../../shared/errors';
import type {
  ComponentEvaluationResponse,
  ConfirmResponse,
  OverrideRequest,
  RecordListResponse,
  ComponentCodeRequest,
  ReselectScaleRequest,
  ScaleOptionsResponse,
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

  type ComponentParams = { sessionId: string; sequence: string };
  const parseSequence = (raw: string): number | undefined => {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 ? n : undefined;
  };
  const sequenceError = (reply: FastifyReply) =>
    badRequest(reply, 'sequence must be a positive integer');

  app.post<{ Params: ComponentParams }>(
    '/sessions/:sessionId/components/:sequence/activate',
    async (req, reply) => {
      const sequence = parseSequence(req.params.sequence);
      if (!sequence) return sequenceError(reply);
      const body: SessionView = w.toSessionView(
        await w.activation.activate(req.params.sessionId, sequence),
      );
      return body;
    },
  );

  // Preparation of the active component (bolt 009). Accepted calls answer 200 with the session;
  // what still blocks unlocking is in the component's preparation.issue (ADR-5).
  const codeRoute = (
    path: 'identity' | 'lot' | 'container',
    run: (
      sessionId: string,
      sequence: number,
      code: string,
    ) => ReturnType<typeof w.preparation.verifyIdentity>,
  ) =>
    app.post<{ Params: ComponentParams; Body: ComponentCodeRequest }>(
      `/sessions/:sessionId/components/:sequence/${path}`,
      async (req, reply) => {
        const sequence = parseSequence(req.params.sequence);
        if (!sequence) return sequenceError(reply);
        if (!nonEmpty(req.body?.code)) return badRequest(reply, 'code is required');
        const { session, issue } = await run(req.params.sessionId, sequence, req.body.code);
        const body: SessionView = w.toSessionView(session, issue);
        return body;
      },
    );
  codeRoute('identity', (s, n, c) => w.preparation.verifyIdentity(s, n, c));
  codeRoute('lot', (s, n, c) => w.preparation.setLot(s, n, c));
  codeRoute('container', (s, n, c) => w.preparation.setContainer(s, n, c));

  app.post<{ Params: ComponentParams; Body: ReselectScaleRequest }>(
    '/sessions/:sessionId/components/:sequence/scale',
    async (req, reply) => {
      const sequence = parseSequence(req.params.sequence);
      if (!sequence) return sequenceError(reply);
      const { scaleId, supervisorBadge, pin } = req.body ?? {};
      if (!nonEmpty(scaleId) || !nonEmpty(supervisorBadge) || !nonEmpty(pin)) {
        return badRequest(reply, 'scaleId, supervisorBadge and pin are required');
      }
      const { session } = await w.preparation.reselectScale(
        req.params.sessionId,
        sequence,
        scaleId.trim(),
        supervisorBadge,
        pin,
      );
      const body: SessionView = w.toSessionView(session);
      return body;
    },
  );

  app.get<{ Params: ComponentParams }>(
    '/sessions/:sessionId/components/:sequence/scale-options',
    async (req, reply) => {
      const sequence = parseSequence(req.params.sequence);
      if (!sequence) return sequenceError(reply);
      const body: ScaleOptionsResponse = await w.preparation.scaleOptions(
        req.params.sessionId,
        sequence,
      );
      return body;
    },
  );

  // Confirmation, re-tare, quit, completion and records (bolt 010). No command carries a weight:
  // the server reads the scale itself (ADR-7).
  app.post<{ Params: ComponentParams }>(
    '/sessions/:sessionId/components/:sequence/confirm',
    async (req, reply) => {
      const sequence = parseSequence(req.params.sequence);
      if (!sequence) return sequenceError(reply);
      const { record, session } = await w.confirmation.confirm(req.params.sessionId, sequence);
      const body: ConfirmResponse = {
        record: w.toRecordView(record),
        session: w.toSessionView(session),
      };
      return body;
    },
  );

  // Supervisor override of an out-of-tolerance weight (bolt 012, ADR-9, Step 24 / TD-10). Like
  // confirm, it carries no weight; the supervisor is authorised before the scale is read.
  const MAX_REASON = 500;
  app.post<{ Params: ComponentParams; Body: OverrideRequest }>(
    '/sessions/:sessionId/components/:sequence/override',
    async (req, reply) => {
      const sequence = parseSequence(req.params.sequence);
      if (!sequence) return sequenceError(reply);
      const { supervisorBadge, pin, reason } = req.body ?? {};
      if (!nonEmpty(supervisorBadge) || !nonEmpty(pin)) {
        return badRequest(reply, 'supervisorBadge and pin are required');
      }
      if (typeof reason !== 'string') return badRequest(reply, 'reason is required');
      if (reason.trim().length > MAX_REASON) {
        return badRequest(reply, `reason must be at most ${MAX_REASON} characters`);
      }
      const { record, session } = await w.override.override(req.params.sessionId, sequence, {
        supervisorBadge,
        pin,
        reason,
      });
      const body: ConfirmResponse = {
        record: w.toRecordView(record),
        session: w.toSessionView(session),
      };
      return body;
    },
  );

  // What the station would decide about the weight now (read-only; one fresh reading).
  app.get<{ Params: ComponentParams }>(
    '/sessions/:sessionId/components/:sequence/evaluation',
    async (req, reply) => {
      const sequence = parseSequence(req.params.sequence);
      if (!sequence) return sequenceError(reply);
      const body: ComponentEvaluationResponse = await w.evaluation.evaluate(
        req.params.sessionId,
        sequence,
      );
      return body;
    },
  );

  app.post<{ Params: ComponentParams }>(
    '/sessions/:sessionId/components/:sequence/retare',
    async (req, reply) => {
      const sequence = parseSequence(req.params.sequence);
      if (!sequence) return sequenceError(reply);
      const body: SessionView = w.toSessionView(
        await w.retare.retare(req.params.sessionId, sequence),
      );
      return body;
    },
  );

  app.post<{ Params: { sessionId: string } }>('/sessions/:sessionId/quit', async (req) => {
    const body: SessionView = w.toSessionView(await w.suspension.quit(req.params.sessionId));
    return body;
  });

  app.post<{ Params: { sessionId: string } }>('/sessions/:sessionId/complete', async (req) => {
    const body: SessionView = w.toSessionView(await w.confirmation.complete(req.params.sessionId));
    return body;
  });

  app.get<{ Params: { sessionId: string } }>('/sessions/:sessionId/records', async (req) => {
    if (!w.ctx.sessions.findById(req.params.sessionId)) {
      throw new SessionNotFoundError(req.params.sessionId);
    }
    const body: RecordListResponse = {
      items: w.ctx.records.listBySession(req.params.sessionId).map(w.toRecordView),
    };
    return body;
  });

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

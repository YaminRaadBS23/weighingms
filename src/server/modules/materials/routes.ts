/** `/api/materials/lots/validate`, `/api/containers`, `/api/containers/validate`. */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { ErrorCode } from '../../../shared/errors';
import type {
  ContainerListResponse,
  ContainerView,
  LotView,
  ValidateContainerRequest,
  ValidateLotRequest,
} from '../../../shared/materials';
import type { MaterialService } from './material-service';

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: { code: ErrorCode.VALIDATION_ERROR, message } });
}

export async function materialRoutes(app: FastifyInstance, opts: { materials: MaterialService }) {
  const { materials } = opts;

  app.post<{ Body: ValidateLotRequest }>('/materials/lots/validate', async (req, reply) => {
    if (!nonEmpty(req.body?.dyestuffCode) || !nonEmpty(req.body?.lotId)) {
      return badRequest(reply, 'dyestuffCode and lotId are required');
    }
    const body: LotView = await materials.validateLot(req.body.dyestuffCode, req.body.lotId);
    return body;
  });

  app.get('/containers', async () => {
    const body: ContainerListResponse = { items: materials.listContainers() };
    return body;
  });

  app.post<{ Body: ValidateContainerRequest }>('/containers/validate', async (req, reply) => {
    if (!nonEmpty(req.body?.code)) return badRequest(reply, 'code is required');
    const body: ContainerView = materials.validateContainer(req.body.code);
    return body;
  });
}

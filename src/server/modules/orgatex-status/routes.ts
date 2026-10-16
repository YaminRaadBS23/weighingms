/** `GET /api/orgatex/status` — OrgaTEX link state for the station status strip (FR-32). */
import type { FastifyInstance } from 'fastify';
import type { OrgatexStatusResponse } from '../../../shared/peripherals';
import type { OrgatexPort } from '../../integrations/orgatex/orgatex-port';

export async function orgatexStatusRoutes(app: FastifyInstance, opts: { orgatex: OrgatexPort }) {
  app.get('/orgatex/status', async () => {
    const link = await opts.orgatex.ping();
    const body: OrgatexStatusResponse = {
      state: link.state === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
      lastContactAt: link.lastContactAt,
    };
    return body;
  });
}

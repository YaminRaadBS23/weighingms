import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { BatchNotFoundError } from './errors';
import { buildTestApp } from './test-support';

let app: FastifyInstance;
afterEach(async () => app?.close());

describe('app scaffold', () => {
  it('GET /api/health returns ok', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('maps a thrown DomainError to the standard error body and status', async () => {
    app = await buildTestApp();
    app.get('/api/__throw', async () => {
      throw new BatchNotFoundError('B-0');
    });
    const res = await app.inject({ method: 'GET', url: '/api/__throw' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: 'BATCH_NOT_FOUND', message: 'Batch B-0 not found' },
    });
  });

  it('hides unexpected errors behind a generic 500', async () => {
    app = await buildTestApp();
    app.get('/api/__boom', async () => {
      throw new Error('secret internal detail');
    });
    const res = await app.inject({ method: 'GET', url: '/api/__boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('answers unknown routes with 404 in the standard format', async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('exposes the OrgatexPort to WeighingMS code', async () => {
    app = await buildTestApp();
    const queue = await app.orgatex.listBatches('STN-01');
    expect(queue.batches.map((b) => b.batchId)).toEqual([
      'B-24187',
      'B-24188',
      'B-24190',
      'B-24191',
    ]);
  });
});

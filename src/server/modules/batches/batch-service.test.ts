import { describe, expect, it } from 'vitest';
import { BatchNotFoundError, OrgatexUnavailableError } from '../../errors';
import type {
  OrgatexBatch,
  OrgatexBatchStatus,
  OrgatexPort,
} from '../../integrations/orgatex/orgatex-port';
import { BatchService } from './batch-service';

function batch(batchId: string, status: OrgatexBatchStatus, hasRecipe = true): OrgatexBatch {
  return {
    batchId,
    orderRef: 'SO-1',
    machineRef: 'JET-1',
    fabricDesc: 'knit',
    fabricWeight: { value: '100', unit: 'kg' },
    shade: 'Teal 4C',
    componentCount: 5,
    status,
    hasRecipe,
    releasedAt: null,
  };
}

/** Fake port: only the read operations the service uses; records the IDs it was asked for. */
function fakePort(batches: OrgatexBatch[], failure?: Error) {
  const asked: string[] = [];
  const port = {
    async listBatches() {
      if (failure) throw failure;
      return { batches, receivedAt: '2026-10-15T06:12:00.000Z' };
    },
    async getBatch(id: string) {
      asked.push(id);
      if (failure) throw failure;
      const found = batches.find((b) => b.batchId === id);
      if (!found) throw new BatchNotFoundError(id);
      return found;
    },
  } as unknown as OrgatexPort;
  return { port, asked };
}

describe('BatchService', () => {
  it('normalises a scanned or typed batch ID before asking OrgaTEX', async () => {
    const { port, asked } = fakePort([batch('B-24187', 'RELEASED')]);
    const svc = new BatchService(port, 'STN-01');
    expect((await svc.getBatch('  b-24187 ')).batchId).toBe('B-24187');
    expect(asked).toEqual(['B-24187']);
  });

  it('queue items carry selectable and reason', async () => {
    const { port } = fakePort([batch('B-1', 'RELEASED'), batch('B-2', 'QUEUED', false)]);
    const queue = await new BatchService(port, 'STN-01').getQueue();
    expect(queue.receivedAt).toBe('2026-10-15T06:12:00.000Z');
    expect(queue.items.map((b) => [b.batchId, b.selectable, b.reason])).toEqual([
      ['B-1', true, null],
      ['B-2', false, 'Not released by OrgaTEX'],
    ]);
  });

  it.each(['RELEASED', 'WEIGHING'] as const)(
    'requireWeighable accepts a %s batch',
    async (status) => {
      const { port } = fakePort([batch('B-1', status)]);
      await expect(new BatchService(port, 'STN-01').requireWeighable('B-1')).resolves.toMatchObject(
        {
          batchId: 'B-1',
          selectable: true,
        },
      );
    },
  );

  it.each([
    ['QUEUED', 'Not released by OrgaTEX'],
    ['WEIGHED', 'Already weighed'],
  ] as const)(
    'requireWeighable refuses a %s batch with 409 and the reason',
    async (status, reason) => {
      const { port } = fakePort([batch('B-1', status)]);
      await expect(new BatchService(port, 'STN-01').requireWeighable('B-1')).rejects.toMatchObject({
        code: 'BATCH_NOT_RELEASED',
        httpStatus: 409,
        details: { batchId: 'B-1', reason },
      });
    },
  );

  it('passes port errors through unchanged', async () => {
    const svc = new BatchService(fakePort([]).port, 'STN-01');
    await expect(svc.getBatch('B-9')).rejects.toBeInstanceOf(BatchNotFoundError);
    const down = new BatchService(fakePort([], new OrgatexUnavailableError('down')).port, 'STN-01');
    await expect(down.getQueue()).rejects.toMatchObject({ code: 'ORGATEX_UNAVAILABLE' });
  });
});

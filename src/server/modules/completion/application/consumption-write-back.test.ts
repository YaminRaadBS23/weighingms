/** Write-back use cases against a fake OrgaTEX port and real SQLite (stories 001–003, ADR-10). */
import { afterEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '../../../../shared/errors';
import { DomainError, OrgatexUnavailableError } from '../../../errors';
import type {
  OrgatexConsumptionPosting,
  OrgatexConsumptionReceipt,
  OrgatexPort,
} from '../../../integrations/orgatex/orgatex-port';
import {
  closeDb,
  confirmOnTarget,
  started,
  unlock,
  g,
  type T,
} from '../../weighing/application/confirmation-test-support';
import { createCompletionModule } from '../module';

afterEach(closeDb);

class FakeOrgatex {
  online = true;
  postFails: DomainError | null = null;
  statusFails: DomainError | null = null;
  explode = false;
  postings = new Map<string, OrgatexConsumptionReceipt>();
  sends: { key: string; posting: OrgatexConsumptionPosting }[] = [];
  statuses: string[] = [];

  async postConsumption(batchId: string, posting: OrgatexConsumptionPosting, key: string) {
    this.sends.push({ key, posting });
    if (this.explode) throw new Error('boom');
    if (!this.online) throw new OrgatexUnavailableError('OrgaTEX is not reachable');
    if (this.postFails) throw this.postFails;
    const existing = this.postings.get(key);
    if (existing) return existing;
    const receipt: OrgatexConsumptionReceipt = {
      postingId: `P-${this.postings.size + 1}`,
      batchId,
      idempotencyKey: key,
      receivedAt: '2026-10-26T08:01:00.000Z',
      lines: posting.lines,
    };
    this.postings.set(key, receipt);
    return receipt;
  }
  async setBatchStatus(batchId: string, status: string) {
    if (!this.online) throw new OrgatexUnavailableError('OrgaTEX is not reachable');
    if (this.statusFails) throw this.statusFails;
    this.statuses.push(`${batchId}:${status}`);
  }
}

/** A fully weighed batch B-24187 and the completion module over a fake OrgaTEX. */
async function completed(overrideThird = false) {
  const t: T & { sid: string } = await started();
  for (const seq of [1, 2]) await confirmOnTarget(t, seq);
  if (overrideThird) {
    await unlock(t, 3);
    t.scales.net = g('96.4');
    await t.w.override.override(t.sid, 3, {
      supervisorBadge: 'BDG-0901',
      pin: '2580',
      reason: 'Customer approved',
    });
  } else {
    await confirmOnTarget(t, 3);
  }
  for (const seq of [4, 5]) await confirmOnTarget(t, seq);
  const orgatex = new FakeOrgatex();
  const c = createCompletionModule({
    db: t.db,
    orgatex: orgatex as unknown as OrgatexPort,
    weighing: t.w,
  });
  return { t, orgatex, ...c };
}

describe('post (story 001)', () => {
  it('sends one posting with five lines, sets WEIGHED and confirms', async () => {
    const { orgatex, writeBacks } = await completed();
    const v = await writeBacks.post('B-24187');
    expect(v).toMatchObject({
      status: 'CONFIRMED',
      requested: true,
      attempts: 1,
      postingId: 'P-1',
      confirmedAt: '2026-10-26T08:01:00.000Z',
      lastError: null,
      lines: 5,
    });
    expect(orgatex.sends).toHaveLength(1);
    expect(orgatex.sends[0]!.posting.lines.map((l) => l.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(orgatex.sends[0]!.posting.lines.map((l) => l.result)).toEqual(
      Array(5).fill('IN_TOLERANCE'),
    );
    expect(orgatex.statuses).toEqual(['B-24187:WEIGHED']);
  });

  it('builds the lines from the records: actual as measured, lot and target snapshot', async () => {
    const { orgatex, writeBacks, t } = await completed();
    await writeBacks.post('B-24187');
    const records = t.w.ctx.records.listBySession(t.sid);
    const lines = orgatex.sends[0]!.posting.lines;
    expect(lines[3]).toMatchObject({
      dyestuffCode: 'AUX-0101',
      lotId: records[3]!.lotId,
      actual: records[3]!.actual,
      target: { value: '24.000', unit: 'kg' },
    });
    expect(orgatex.sends[0]!.posting.operatorId).toBe('OP-0417');
  });

  it('the same request again (same or no key) sends nothing more and answers the same', async () => {
    const { orgatex, writeBacks } = await completed();
    const first = await writeBacks.post('B-24187');
    const again = await writeBacks.post('B-24187');
    const sameKey = await writeBacks.post('B-24187', first.idempotencyKey!);
    expect(again).toEqual(first);
    expect(sameKey).toEqual(first);
    expect(orgatex.sends).toHaveLength(1);
  });

  it('uses the key from the header, trimmed, and stores it', async () => {
    const { orgatex, writeBacks } = await completed();
    const v = await writeBacks.post('B-24187', '  KEY-1  ');
    expect(v.idempotencyKey).toBe('KEY-1');
    expect(orgatex.sends[0]!.key).toBe('KEY-1');
  });

  it('generates a stable key from the batch and session when none is sent', async () => {
    const { writeBacks, t } = await completed();
    expect((await writeBacks.post('B-24187')).idempotencyKey).toBe(`WB-B-24187-${t.sid}`);
  });

  it('a different key after the first is refused and nothing is sent', async () => {
    const { orgatex, writeBacks } = await completed();
    await writeBacks.post('B-24187', 'KEY-1');
    await expect(writeBacks.post('B-24187', 'KEY-2')).rejects.toMatchObject({
      code: ErrorCode.WRITEBACK_KEY_MISMATCH,
      httpStatus: 409,
    });
    expect(orgatex.sends).toHaveLength(1);
  });

  it.each(['', '   ', 'a'.repeat(129), 'two\nlines', 'tab\there'])(
    'rejects the key %j',
    async (key) => {
      const { writeBacks, orgatex } = await completed();
      await expect(writeBacks.post('B-24187', key)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        httpStatus: 400,
      });
      expect(orgatex.sends).toHaveLength(0);
    },
  );

  it('an incomplete batch → 422 BATCH_INCOMPLETE and nothing is stored or sent', async () => {
    const t = await started();
    await confirmOnTarget(t, 1);
    const orgatex = new FakeOrgatex();
    const { writeBacks } = createCompletionModule({
      db: t.db,
      orgatex: orgatex as unknown as OrgatexPort,
      weighing: t.w,
    });
    await expect(writeBacks.post('B-24187')).rejects.toMatchObject({
      code: ErrorCode.BATCH_INCOMPLETE,
      httpStatus: 422,
      details: { done: 1, total: 5 },
    });
    expect(orgatex.sends).toHaveLength(0);
    expect(writeBacks.pendingCount()).toBe(0);
  });

  it('a batch with no session → 404 SESSION_NOT_FOUND', async () => {
    const { writeBacks } = await completed();
    await expect(writeBacks.post('B-99999')).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('an overridden component is posted with result OVERRIDDEN', async () => {
    const { orgatex, writeBacks } = await completed(true);
    await writeBacks.post('B-24187');
    expect(orgatex.sends[0]!.posting.lines.map((l) => l.result)).toEqual([
      'IN_TOLERANCE',
      'IN_TOLERANCE',
      'OVERRIDDEN',
      'IN_TOLERANCE',
      'IN_TOLERANCE',
    ]);
    expect(orgatex.sends[0]!.posting.lines[2]!.actual).toEqual(g('96.4'));
  });

  it('concurrent posts create one write-back and one send', async () => {
    const { orgatex, writeBacks } = await completed();
    const [a, b, c] = await Promise.all([
      writeBacks.post('B-24187'),
      writeBacks.post('B-24187'),
      writeBacks.post('B-24187'),
    ]);
    expect(orgatex.sends).toHaveLength(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});

describe('hold and retry (story 002)', () => {
  it('OrgaTEX offline → PENDING with the failure, attempt counted, count 1, nothing lost', async () => {
    const { orgatex, writeBacks } = await completed();
    orgatex.online = false;
    const v = await writeBacks.post('B-24187');
    expect(v).toMatchObject({
      status: 'PENDING',
      requested: true,
      attempts: 1,
      confirmedAt: null,
      lastError: { code: 'ORGATEX_UNAVAILABLE' },
    });
    expect(writeBacks.pendingCount()).toBe(1);
    expect(orgatex.postings.size).toBe(0);
  });

  it('retry online → CONFIRMED with the SAME key, one posting, one WRITEBACK_RETRY audit event', async () => {
    const { orgatex, writeBacks, t } = await completed();
    orgatex.online = false;
    const first = await writeBacks.post('B-24187');
    orgatex.online = true;
    t.w.identification.signIn('BDG-0417');
    const v = await writeBacks.retry('B-24187');
    expect(v).toMatchObject({ status: 'CONFIRMED', attempts: 2, lastError: null });
    expect(orgatex.sends.map((s) => s.key)).toEqual([first.idempotencyKey, first.idempotencyKey]);
    expect(orgatex.postings.size).toBe(1);
    expect(writeBacks.pendingCount()).toBe(0);
    const audit = t.w.auditLog.listForSession(t.sid).filter((e) => e.type === 'WRITEBACK_RETRY');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: 'OP-0417',
      detail: { batchId: 'B-24187', attempt: 2, outcome: 'CONFIRMED', errorCode: null },
    });
  });

  it('retry while still offline stays PENDING, counts the attempt and audits it', async () => {
    const { orgatex, writeBacks, t } = await completed();
    orgatex.online = false;
    await writeBacks.post('B-24187');
    t.w.identification.signIn('BDG-0417');
    const v = await writeBacks.retry('B-24187');
    expect(v).toMatchObject({ status: 'PENDING', attempts: 2 });
    const audit = t.w.auditLog.listForSession(t.sid).filter((e) => e.type === 'WRITEBACK_RETRY');
    expect(audit[0]!.detail).toMatchObject({
      outcome: 'PENDING',
      errorCode: 'ORGATEX_UNAVAILABLE',
    });
  });

  it('retrying a CONFIRMED write-back changes nothing: no send, no audit event', async () => {
    const { orgatex, writeBacks, t } = await completed();
    const confirmed = await writeBacks.post('B-24187');
    t.w.identification.signIn('BDG-0417');
    expect(await writeBacks.retry('B-24187')).toEqual(confirmed);
    expect(orgatex.sends).toHaveLength(1);
    expect(
      t.w.auditLog.listForSession(t.sid).filter((e) => e.type === 'WRITEBACK_RETRY'),
    ).toHaveLength(0);
  });

  it('retry needs a signed-in operator (401) and an existing write-back (404)', async () => {
    const { writeBacks, t } = await completed();
    t.w.identification.signOut();
    await expect(writeBacks.retry('B-24187')).rejects.toMatchObject({
      code: ErrorCode.NOT_SIGNED_IN,
      httpStatus: 401,
    });
    t.w.identification.signIn('BDG-0417');
    await expect(writeBacks.retry('B-24187')).rejects.toMatchObject({
      code: ErrorCode.WRITEBACK_NOT_FOUND,
      httpStatus: 404,
    });
  });

  it('retry of an incomplete batch → 422', async () => {
    const t = await started();
    const { writeBacks } = createCompletionModule({
      db: t.db,
      orgatex: new FakeOrgatex() as unknown as OrgatexPort,
      weighing: t.w,
    });
    await expect(writeBacks.retry('B-24187')).rejects.toMatchObject({ httpStatus: 422 });
  });

  it('WEIGHED failing after a good posting: PENDING with the posting id kept; retry repeats both and confirms', async () => {
    const { orgatex, writeBacks, t } = await completed();
    orgatex.statusFails = new DomainError(ErrorCode.INVALID_STATUS_TRANSITION, 'no', 409);
    const v = await writeBacks.post('B-24187');
    expect(v).toMatchObject({
      status: 'PENDING',
      postingId: 'P-1',
      lastError: { code: 'INVALID_STATUS_TRANSITION' },
    });
    orgatex.statusFails = null;
    t.w.identification.signIn('BDG-0417');
    const done = await writeBacks.retry('B-24187');
    expect(done.status).toBe('CONFIRMED');
    expect(orgatex.postings.size).toBe(1);
    expect(orgatex.statuses).toEqual(['B-24187:WEIGHED']);
  });

  it.each([
    ['CONSUMPTION_REJECTED', 422],
    ['IDEMPOTENCY_CONFLICT', 409],
    ['BATCH_NOT_RELEASED', 409],
    ['ORGATEX_PROTOCOL_ERROR', 502],
  ])('a refused posting (%s) is held as PENDING, not raised', async (code, status) => {
    const { orgatex, writeBacks } = await completed();
    orgatex.postFails = new DomainError(code, 'refused', status);
    expect(await writeBacks.post('B-24187')).toMatchObject({
      status: 'PENDING',
      lastError: { code, message: 'refused' },
    });
  });

  it('an unexpected error is not reported as an outage: it is raised and the write-back stays PENDING', async () => {
    const { orgatex, writeBacks } = await completed();
    orgatex.explode = true;
    await expect(writeBacks.post('B-24187')).rejects.toThrow('boom');
    orgatex.explode = false;
    expect(writeBacks.status('B-24187')).toMatchObject({
      status: 'PENDING',
      requested: true,
      attempts: 0,
    });
    expect((await writeBacks.post('B-24187')).status).toBe('CONFIRMED');
  });

  it('pending count: a completed batch never sent counts; confirmed ones do not', async () => {
    const { writeBacks } = await completed();
    expect(writeBacks.pendingCount()).toBe(1);
    expect(writeBacks.status('B-24187')).toMatchObject({
      status: 'PENDING',
      requested: false,
      attempts: 0,
      idempotencyKey: null,
      lines: 5,
    });
    await writeBacks.post('B-24187');
    expect(writeBacks.pendingCount()).toBe(0);
  });
});

describe('summary (story 003)', () => {
  it('5 of 5, all within tolerance, exact total, elapsed, operator and write-back state', async () => {
    const { summary, writeBacks, t } = await completed();
    const s = summary.summary('B-24187');
    expect(s).toMatchObject({
      batchId: 'B-24187',
      sessionId: t.sid,
      componentsWeighed: 5,
      componentsTotal: 5,
      allWithinTolerance: true,
      totalDispensed: { value: '35.320', unit: 'kg' },
      operator: { operatorId: 'OP-0417', name: 'R. Karim' },
      writeBack: { status: 'PENDING', requested: false },
    });
    expect(s.elapsedSeconds).toBe(0);
    await writeBacks.post('B-24187');
    expect(summary.summary('B-24187').writeBack.status).toBe('CONFIRMED');
  });

  it('any overridden record → all within tolerance is false', async () => {
    const { summary } = await completed(true);
    const s = summary.summary('B-24187');
    expect(s.allWithinTolerance).toBe(false);
    expect(s.totalDispensed).toEqual({ value: '35.322', unit: 'kg' }); // 96.4 g instead of 94.0 g
  });

  it('reading the summary never calls OrgaTEX', async () => {
    const { summary, orgatex } = await completed();
    summary.summary('B-24187');
    summary.summary('B-24187');
    expect(orgatex.sends).toHaveLength(0);
    expect(orgatex.statuses).toHaveLength(0);
  });

  it('an incomplete batch → 409 BATCH_INCOMPLETE; no session → 404', async () => {
    const t = await started();
    const { summary } = createCompletionModule({
      db: t.db,
      orgatex: new FakeOrgatex() as unknown as OrgatexPort,
      weighing: t.w,
    });
    expect(() => summary.summary('B-24187')).toThrowError(
      expect.objectContaining({ code: ErrorCode.BATCH_INCOMPLETE, httpStatus: 409 }),
    );
    expect(() => summary.summary('B-1')).toThrowError(expect.objectContaining({ httpStatus: 404 }));
  });
});

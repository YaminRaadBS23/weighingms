import { describe, expect, it } from 'vitest';
import type { TicketContent } from '../../../../shared/ticket';
import { Ticket } from './ticket';

const T0 = new Date('2026-10-26T08:00:00Z');
const T1 = new Date('2026-10-26T08:05:00Z');
const content = {
  batch: 'B-1',
  barcodeValue: 'B-1',
  lines: ['x'],
  reprint: false,
} as TicketContent;
const make = (reprintOf: string | null = null) =>
  Ticket.create({
    ticketId: 'T-1',
    batchId: 'B-1',
    sessionId: 'S-1',
    content,
    reprintOf,
    createdBy: 'OP-0417',
    now: T0,
  });
const failure = { code: 'PRINTER_UNAVAILABLE', state: 'OFFLINE' as const, message: 'offline' };

describe('Ticket', () => {
  it('starts stored and not sent, with no attempts', () => {
    expect(make().snapshot()).toMatchObject({
      printStatus: 'NOT_SENT',
      printAttempts: 0,
      lastError: null,
      jobId: null,
      printedAt: null,
      isReprint: false,
      reprintOf: null,
      createdAt: T0.toISOString(),
    });
  });

  it('is a reprint exactly when it names its source', () => {
    expect(make('T-0').snapshot()).toMatchObject({ isReprint: true, reprintOf: 'T-0' });
  });

  it('a failure keeps the content, counts the attempt and remembers why', () => {
    const t = make();
    t.markFailed(failure, T1);
    expect(t.snapshot()).toMatchObject({
      printStatus: 'FAILED',
      printAttempts: 1,
      lastError: failure,
      updatedAt: T1.toISOString(),
    });
    expect(t.content).toEqual(content);
  });

  it('a retry after a failure prints the same ticket and clears the error', () => {
    const t = make();
    t.markFailed(failure, T0);
    t.markFailed(failure, T0);
    t.markPrinted({ jobId: 'J-1', printedAt: '2026-10-26T08:06:00Z' }, T1);
    expect(t.snapshot()).toMatchObject({
      printStatus: 'PRINTED',
      printAttempts: 3,
      lastError: null,
      jobId: 'J-1',
      printedAt: '2026-10-26T08:06:00Z',
      isReprint: false,
    });
    expect(t.isPrinted).toBe(true);
  });

  it('PRINTED is final', () => {
    const t = make();
    t.markPrinted({ jobId: 'J-1', printedAt: 'x' }, T0);
    expect(() => t.markFailed(failure, T1)).toThrow(/final/);
    expect(() => t.markPrinted({ jobId: 'J-2', printedAt: 'y' }, T1)).toThrow(/final/);
    expect(t.snapshot().jobId).toBe('J-1');
  });

  it('keeps its own copy of the content and of what it hands out', () => {
    const own = { ...content, lines: ['a'] };
    const t = Ticket.create({
      ticketId: 'T-2',
      batchId: 'B-1',
      sessionId: 'S-1',
      content: own,
      reprintOf: null,
      createdBy: 'OP-0417',
      now: T0,
    });
    own.lines.push('changed');
    t.snapshot().content.lines.push('also changed');
    expect(t.content.lines).toEqual(['a']);
  });
});

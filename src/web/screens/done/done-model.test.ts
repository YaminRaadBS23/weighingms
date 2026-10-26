import { describe, expect, it } from 'vitest';
import { pendingWriteBack, ticketView, writeBackView } from '../../test/mock-api';
import {
  currentTicket,
  doneKeys,
  elapsedText,
  printedCopies,
  printerFailureText,
  svgDataUrl,
  writeBackError,
  writeBackRow,
} from './done-model';

describe('elapsedText', () => {
  it.each([
    [0, '0 s'],
    [45, '45 s'],
    [54.4, '54 s'],
    [60, '1 min 0 s'],
    [401, '6 min 41 s'],
    [3599, '59 min 59 s'],
    [3900, '1 h 05 min'],
    [-5, '0 s'],
  ])('%s seconds reads "%s"', (seconds, text) => {
    expect(elapsedText(seconds)).toBe(text);
  });
});

describe('writeBackRow', () => {
  it('is OK and shows the confirmation time for a confirmed write-back', () => {
    const row = writeBackRow(writeBackView(), false);
    expect(row).toMatchObject({ tone: 'ok', detail: null, attempts: null, showRetry: false });
    expect(row.text).toMatch(/^CONFIRMED \d\d:\d\d:\d\d$/);
  });

  it('is a warning with the reason, the attempt count and Retry when pending', () => {
    expect(writeBackRow(pendingWriteBack({ attempts: 2 }), false)).toEqual({
      tone: 'warn',
      text: 'PENDING',
      detail: 'OrgaTEX is not reachable. The result is kept and is sent when you press Retry.',
      attempts: 'attempt 2',
      showRetry: true,
    });
  });

  it('says "Not sent yet." with no attempt count before anything was sent', () => {
    const row = writeBackRow(
      writeBackView({ status: 'PENDING', requested: false, attempts: 0, lastError: null }),
      false,
    );
    expect(row).toMatchObject({ detail: 'Not sent yet.', attempts: null, showRetry: true });
  });

  it('treats an unknown write-back as pending and retryable', () => {
    expect(writeBackRow(null, false)).toMatchObject({ text: 'PENDING', showRetry: true });
  });

  it('shows SENDING… without Retry while a send is running, whatever the stored state', () => {
    for (const wb of [null, pendingWriteBack(), writeBackView()]) {
      expect(writeBackRow(wb, true)).toMatchObject({ text: 'SENDING…', showRetry: false });
    }
  });
});

describe('writeBackError', () => {
  it('has operator wording for the known codes and passes the server message for others', () => {
    expect(writeBackError({ code: 'ORGATEX_PROTOCOL_ERROR', message: 'x' })).toContain(
      'answered something unexpected',
    );
    expect(writeBackError({ code: 'WEIRD', message: 'boom' })).toBe(
      'OrgaTEX did not accept the posting (boom). The result is kept.',
    );
  });
});

describe('tickets', () => {
  const original = ticketView({ ticketId: 'T-1' });
  const copy = ticketView({ ticketId: 'T-2', isReprint: true });
  const failedCopy = ticketView({ ticketId: 'T-3', isReprint: true, printStatus: 'FAILED' });

  it('works with the newest ticket', () => {
    expect(currentTicket([])).toBeNull();
    expect(currentTicket([original, copy])).toBe(copy);
  });

  it('counts only printed copies, not the original or a failed copy', () => {
    expect(printedCopies([original, copy, failedCopy])).toBe(1);
    expect(printedCopies([original])).toBe(0);
  });
});

describe('printerFailureText', () => {
  it('names the printer state and says the ticket is kept', () => {
    const base = { code: 'PRINTER_UNAVAILABLE', message: 'm' };
    expect(printerFailureText({ ...base, state: 'OFFLINE' })).toBe(
      'The printer is offline. The ticket is kept: fix the printer and press Retry.',
    );
    expect(printerFailureText({ ...base, state: 'OUT_OF_PAPER' })).toContain('out of paper');
    expect(printerFailureText({ ...base, state: null })).toContain('did not answer as expected');
  });

  it('treats a device protocol error as a kept ticket and anything else as a plain failure', () => {
    expect(
      printerFailureText({ code: 'DEVICE_PROTOCOL_ERROR', state: null, message: 'x' }),
    ).toContain('The ticket is kept');
    expect(printerFailureText({ code: 'OTHER', state: null, message: 'disk full' })).toBe(
      'The ticket could not be printed (disk full).',
    );
  });
});

describe('doneKeys', () => {
  it('offers Print when there is no ticket', () => {
    expect(doneKeys(null, false)).toMatchObject({
      primary: 'PRINT',
      primaryLabel: 'Print ticket',
      primaryEnabled: true,
      reprintVisible: false,
      nextEnabled: true,
    });
  });

  it('offers Retry for a ticket that is stored but not printed', () => {
    for (const printStatus of ['NOT_SENT', 'FAILED'] as const) {
      expect(doneKeys(ticketView({ printStatus }), false)).toMatchObject({
        primary: 'RETRY',
        primaryLabel: 'Retry print',
        primaryEnabled: true,
        reprintVisible: false,
      });
    }
  });

  it('turns Print off and offers Reprint once the ticket is printed', () => {
    expect(doneKeys(ticketView(), false)).toMatchObject({
      primary: 'PRINTED',
      primaryEnabled: false,
      reprintVisible: true,
      reprintEnabled: true,
    });
  });

  it('disables every key while a request runs', () => {
    expect(doneKeys(null, true)).toMatchObject({ primaryEnabled: false, nextEnabled: false });
    expect(doneKeys(ticketView(), true)).toMatchObject({ reprintEnabled: false });
  });
});

describe('svgDataUrl', () => {
  it('encodes markup into an image URL so nothing is ever executed', () => {
    const url = svgDataUrl('<svg><script>x()</script></svg>');
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(url).not.toContain('<');
    expect(decodeURIComponent(url.split(',')[1]!)).toBe('<svg><script>x()</script></svg>');
  });
});

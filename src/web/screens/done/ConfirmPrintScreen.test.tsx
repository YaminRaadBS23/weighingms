// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TicketView } from '../../../shared/ticket';
import {
  apiError,
  installMockApi,
  pendingWriteBack,
  SESSION,
  summaryView,
  ticketView,
  writeBackView,
  type Handler,
  type MockApi,
} from '../../test/mock-api';
import { ConfirmPrintScreen } from './ConfirmPrintScreen';

let mock: MockApi;
afterEach(() => {
  cleanup();
  mock.restore();
});

const BATCH = SESSION.batchId;
const session = { ...SESSION, status: 'COMPLETED' as const, doneCount: 2 };
const key = (name: RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const count = (call: string) => mock.calls.filter((c) => c === call).length;

/** A ticket list the test can change: the screen re-reads it after every print. */
function tickets(initial: TicketView[] = []) {
  const state = { list: initial };
  const handler: Handler = () => ({ body: { tickets: state.list } });
  return { state, handler };
}

function open(overrides: Record<string, Handler> = {}, onLeave = () => {}) {
  mock = installMockApi({
    [`GET /api/batches/${BATCH}/summary`]: { body: summaryView() },
    [`POST /api/batches/${BATCH}/consumption`]: { body: writeBackView() },
    [`GET /api/batches/${BATCH}/tickets`]: { body: { tickets: [] } },
    ...overrides,
  });
  return render(<ConfirmPrintScreen session={session} onLeave={onLeave} />);
}

describe('ConfirmPrintScreen · summary and write-back', () => {
  it('shows the summary and a confirmed write-back, and sends the consumption once on opening', async () => {
    open();
    expect(await screen.findByText('2 of 2')).toBeTruthy();
    expect(screen.getByText('YES')).toBeTruthy();
    expect(screen.getByText('1.234 kg')).toBeTruthy();
    expect(screen.getByText('6 min 41 s')).toBeTruthy();
    expect(screen.getByText('A. Tester')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('writeback').textContent).toMatch(/^CONFIRMED /));
    expect(screen.queryByTestId('writeback-detail')).toBeNull();
    expect(count(`POST /api/batches/${BATCH}/consumption`)).toBe(1);
  });

  it('sends the consumption once even when the screen is mounted twice (StrictMode in development)', async () => {
    mock = installMockApi({
      [`GET /api/batches/${BATCH}/summary`]: { body: summaryView() },
      [`POST /api/batches/${BATCH}/consumption`]: { body: writeBackView() },
      [`GET /api/batches/${BATCH}/tickets`]: { body: { tickets: [] } },
    });
    render(
      <StrictMode>
        <ConfirmPrintScreen session={session} onLeave={() => {}} />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByTestId('writeback').textContent).toMatch(/^CONFIRMED /));
    expect(count(`POST /api/batches/${BATCH}/consumption`)).toBe(1);
  });

  it('shows NO when a component was overridden', async () => {
    open({
      [`GET /api/batches/${BATCH}/summary`]: { body: summaryView({ allWithinTolerance: false }) },
    });
    expect(await screen.findByText('NO')).toBeTruthy();
  });

  it('keeps the result and offers Retry when OrgaTEX is not reachable, then confirms on Retry', async () => {
    const user = userEvent.setup();
    open({
      [`POST /api/batches/${BATCH}/consumption`]: { body: pendingWriteBack() },
      [`POST /api/batches/${BATCH}/write-back/retry`]: { body: writeBackView({ attempts: 2 }) },
    });
    await waitFor(() => expect(screen.getByTestId('writeback').textContent).toBe('PENDING'));
    expect(screen.getByTestId('writeback-detail').textContent).toContain(
      'OrgaTEX is not reachable',
    );
    expect(screen.getByText('attempt 1')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByTestId('writeback').textContent).toMatch(/^CONFIRMED /));
    expect(count(`POST /api/batches/${BATCH}/write-back/retry`)).toBe(1);
  });

  it('stays pending when Retry fails too', async () => {
    const user = userEvent.setup();
    open({
      [`POST /api/batches/${BATCH}/consumption`]: { body: pendingWriteBack() },
      [`POST /api/batches/${BATCH}/write-back/retry`]: apiError(
        503,
        'ORGATEX_UNAVAILABLE',
        'OrgaTEX is not reachable',
      ),
    });
    await screen.findByRole('button', { name: 'Retry' });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(count(`POST /api/batches/${BATCH}/write-back/retry`)).toBe(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy());
    expect(screen.getByTestId('writeback').textContent).toBe('PENDING');
  });

  it('shows the summary even when the first send is refused (weighing never waits for OrgaTEX)', async () => {
    open({
      [`POST /api/batches/${BATCH}/consumption`]: apiError(503, 'ORGATEX_UNAVAILABLE', 'down'),
    });
    expect(await screen.findByText('2 of 2')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('writeback').textContent).toBe('PENDING'));
    expect(key(/Print ticket/).disabled).toBe(false);
  });

  it('says the summary could not be loaded and loads it again on Reload', async () => {
    const user = userEvent.setup();
    let calls = 0;
    open({
      [`GET /api/batches/${BATCH}/summary`]: () =>
        ++calls === 1 ? apiError(500, 'INTERNAL', 'x') : { body: summaryView() },
    });
    expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded');
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(await screen.findByText('2 of 2')).toBeTruthy();
  });
});

describe('ConfirmPrintScreen · ticket', () => {
  it('shows no ticket until Print is pressed (the ticket is created and printed by F1)', async () => {
    open();
    expect(await screen.findByTestId('ticket-empty')).toBeTruthy();
    expect(mock.calls.some((c) => c.startsWith('POST /api/tickets'))).toBe(false);
  });

  it('Print creates the ticket and shows the stored lines and the barcode as an image', async () => {
    const user = userEvent.setup();
    const t = tickets();
    open({
      [`GET /api/batches/${BATCH}/tickets`]: t.handler,
      'POST /api/tickets': () => {
        t.state.list = [ticketView()];
        return { status: 201, body: ticketView() };
      },
    });
    await screen.findByText('2 of 2');
    await user.click(key(/Print ticket/));

    const shown = await screen.findByTestId('ticket');
    expect(shown.querySelector('pre')?.textContent).toBe(ticketView().preview.lines.join('\n'));
    const img = shown.querySelector('img')!;
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(img.getAttribute('alt')).toBe(`Code 128 barcode ${BATCH}`);
    expect(screen.getByTestId('ticket-status').textContent).toMatch(/^Printed \d\d:\d\d$/);
    expect(count('POST /api/tickets')).toBe(1);
    // Printed: Print is spent, Reprint appears.
    expect(key(/Ticket printed/).disabled).toBe(true);
    expect(key(/Reprint/).disabled).toBe(false);
  });

  it('shows an existing ticket on opening (after a reload) without printing again', async () => {
    const t = tickets([ticketView()]);
    open({ [`GET /api/batches/${BATCH}/tickets`]: t.handler });
    expect(await screen.findByTestId('ticket')).toBeTruthy();
    expect(mock.calls.some((c) => c.startsWith('POST /api/tickets'))).toBe(false);
  });

  it('keeps the ticket and says why when the printer is offline, then Retry prints the same ticket', async () => {
    const user = userEvent.setup();
    const stored = ticketView({ printStatus: 'NOT_SENT', printedAt: null, jobId: null });
    const t = tickets();
    open({
      [`GET /api/batches/${BATCH}/tickets`]: t.handler,
      'POST /api/tickets': () => {
        t.state.list = [{ ...stored, printStatus: 'FAILED', printAttempts: 1 }];
        return apiError(503, 'PRINTER_UNAVAILABLE', 'Printer is offline', {
          state: 'OFFLINE',
          ticketId: 'T-1',
          printStatus: 'FAILED',
        });
      },
      'POST /api/tickets/T-1/print': () => {
        t.state.list = [ticketView()];
        return { body: ticketView() };
      },
    });
    await screen.findByText('2 of 2');
    await user.click(key(/Print ticket/));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'The printer is offline. The ticket is kept: fix the printer and press Retry.',
    );
    expect(screen.getByTestId('ticket')).toBeTruthy();
    expect(screen.getByTestId('ticket-status').textContent).toBe('Not printed');
    expect(key(/Retry print/).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /Reprint/ })).toBeNull();

    await user.click(key(/Retry print/));
    await waitFor(() => expect(key(/Ticket printed/)).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(count('POST /api/tickets')).toBe(1); // Retry reuses the stored ticket
    expect(count('POST /api/tickets/T-1/print')).toBe(1);
  });

  it('shows the stored failure of a ticket after a reload, with Retry', async () => {
    const failed = ticketView({
      printStatus: 'FAILED',
      printedAt: null,
      lastError: { code: 'PRINTER_UNAVAILABLE', state: 'OUT_OF_PAPER', message: 'paper' },
    });
    open({ [`GET /api/batches/${BATCH}/tickets`]: { body: { tickets: [failed] } } });
    expect((await screen.findByRole('alert')).textContent).toContain('out of paper');
    expect(key(/Retry print/).disabled).toBe(false);
  });

  it('Reprint makes a marked copy and counts it; a refused reprint keeps the original and shows why', async () => {
    const user = userEvent.setup();
    const original = ticketView();
    const t = tickets([original]);
    let refuse = true;
    open({
      [`GET /api/batches/${BATCH}/tickets`]: t.handler,
      'POST /api/tickets/T-1/reprint': () => {
        if (refuse) {
          t.state.list = [
            original,
            ticketView({
              ticketId: 'T-2',
              isReprint: true,
              printStatus: 'FAILED',
              printedAt: null,
            }),
          ];
          return apiError(503, 'PRINTER_UNAVAILABLE', 'offline', { state: 'OFFLINE' });
        }
        return { status: 201, body: ticketView({ ticketId: 'T-2', isReprint: true }) };
      },
      'POST /api/tickets/T-2/print': () => {
        refuse = false;
        t.state.list = [original, ticketView({ ticketId: 'T-2', isReprint: true })];
        return { body: ticketView({ ticketId: 'T-2', isReprint: true }) };
      },
    });
    await screen.findByTestId('ticket');
    await user.click(key(/Reprint/));
    expect((await screen.findByRole('alert')).textContent).toContain('The printer is offline.');
    // The failed copy is now the current ticket: the key is Retry and it shows the REPRINT mark.
    expect(screen.getByTestId('ticket').textContent).toContain('*** REPRINT ***');
    await user.click(key(/Retry print/));
    await waitFor(() =>
      expect(screen.getByTestId('ticket-status').textContent).toContain('Copies printed: 1'),
    );
    expect(count('POST /api/tickets/T-2/print')).toBe(1);
  });
});

describe('ConfirmPrintScreen · independence and keys', () => {
  it('prints while the write-back is pending, and a printer failure leaves the write-back alone', async () => {
    const user = userEvent.setup();
    open({
      [`POST /api/batches/${BATCH}/consumption`]: { body: pendingWriteBack() },
      'POST /api/tickets': apiError(503, 'PRINTER_UNAVAILABLE', 'offline', { state: 'OFFLINE' }),
    });
    await screen.findByRole('button', { name: 'Retry' });
    await user.click(key(/Print ticket/));
    await screen.findByText(/The printer is offline/);
    expect(screen.getByTestId('writeback').textContent).toBe('PENDING');
    expect(count(`POST /api/batches/${BATCH}/consumption`)).toBe(1);
    expect(mock.calls.some((c) => c.includes('write-back/retry'))).toBe(false);
  });

  it('F1 prints and F3 leaves, like the on-screen keys', async () => {
    const onLeave = vi.fn();
    const t = tickets();
    open(
      {
        [`GET /api/batches/${BATCH}/tickets`]: t.handler,
        'POST /api/tickets': () => {
          t.state.list = [ticketView()];
          return { status: 201, body: ticketView() };
        },
      },
      onLeave,
    );
    await screen.findByText('2 of 2');
    fireEvent.keyDown(window, { key: 'F1' });
    await screen.findByTestId('ticket');
    fireEvent.keyDown(window, { key: 'F3' });
    expect(onLeave).toHaveBeenCalledOnce();
    expect(count('POST /api/tickets')).toBe(1);
  });

  it('sends one print request when F1 is pressed twice quickly, and ignores F1 once the ticket is printed', async () => {
    const t = tickets();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    open({
      [`GET /api/batches/${BATCH}/tickets`]: t.handler,
      'POST /api/tickets': async () => {
        await gate;
        t.state.list = [ticketView()];
        return { status: 201, body: ticketView() };
      },
    });
    await screen.findByText('2 of 2');
    fireEvent.keyDown(window, { key: 'F1' });
    await waitFor(() => expect(key(/Print ticket/).disabled).toBe(true));
    fireEvent.keyDown(window, { key: 'F1' });
    release();
    await screen.findByTestId('ticket');
    fireEvent.keyDown(window, { key: 'F1' });
    expect(count('POST /api/tickets')).toBe(1);
  });

  it('disables Next batch while a request runs', async () => {
    const onLeave = vi.fn();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    open({ 'POST /api/tickets': async () => (await gate, { body: ticketView() }) }, onLeave);
    await screen.findByText('2 of 2');
    fireEvent.keyDown(window, { key: 'F1' });
    await waitFor(() => expect(key(/Next batch/).disabled).toBe(true));
    fireEvent.keyDown(window, { key: 'F3' });
    expect(onLeave).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(key(/Next batch/).disabled).toBe(false));
  });
});

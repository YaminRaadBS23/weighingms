// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hhmm } from '../../shared/format';
import {
  apiError,
  BATCH_BLOCKED,
  BATCH_OK,
  installMockApi,
  orgatexDown,
  QUEUE,
  RECEIVED_AT,
  RECIPE,
  scan,
  scanFeedDelivering,
  SESSION,
  type MockApi,
} from '../../test/mock-api';
import { SelectBatchScreen } from './SelectBatchScreen';

let mock: MockApi;
afterEach(() => {
  cleanup();
  mock.restore();
});

/** The API as seen when the queue loads and a released batch can be started. */
const queueApi = () => ({
  'GET /api/batches': { body: QUEUE },
  [`GET /api/batches/${BATCH_OK.batchId}`]: { body: BATCH_OK },
  [`GET /api/batches/${BATCH_BLOCKED.batchId}`]: { body: BATCH_BLOCKED },
  [`GET /api/batches/${BATCH_OK.batchId}/recipe`]: { body: RECIPE },
  'POST /api/sessions': { status: 201, body: SESSION },
});

describe('SelectBatchScreen — queue', () => {
  it('fetches the queue from GET /api/batches and shows the prototype columns and received time', async () => {
    mock = installMockApi(queueApi());
    render(<SelectBatchScreen onSessionStarted={() => {}} />);
    expect(await screen.findByTestId(`row-${BATCH_OK.batchId}`)).toBeTruthy();
    expect(mock.calls.filter((c) => c === 'GET /api/batches')).toHaveLength(1);
    expect(screen.getByText('Scan a batch card to begin')).toBeTruthy();
    expect(
      screen.getByText(
        `Or touch a row below. Queue received from OrgaTEX at ${hhmm(RECEIVED_AT)}.`,
      ),
    ).toBeTruthy();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Batch',
      'Order',
      'Machine',
      'Fabric / lot',
      'Shade',
      'Comp.',
      'Status',
    ]);
    const row = within(screen.getByTestId(`row-${BATCH_OK.batchId}`));
    expect(row.getByText(BATCH_OK.orderRef)).toBeTruthy();
    expect(row.getByText('knit · 480 kg')).toBeTruthy();
    expect(row.getByText('RELEASED')).toBeTruthy();
    expect(
      within(screen.getByTestId(`row-${BATCH_BLOCKED.batchId}`)).getByText('QUEUED'),
    ).toBeTruthy();
  });

  it('marks batches that cannot be selected', async () => {
    mock = installMockApi(queueApi());
    render(<SelectBatchScreen onSessionStarted={() => {}} />);
    const blocked = await screen.findByTestId(`row-${BATCH_BLOCKED.batchId}`);
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId(`row-${BATCH_OK.batchId}`).getAttribute('aria-disabled')).toBe(
      'false',
    );
  });

  it('says so when the queue is empty', async () => {
    mock = installMockApi({ 'GET /api/batches': { body: { items: [], receivedAt: RECEIVED_AT } } });
    render(<SelectBatchScreen onSessionStarted={() => {}} />);
    expect(await screen.findByText('No batches in the queue for this station.')).toBeTruthy();
  });
});

describe('SelectBatchScreen — selecting a batch (workbook Step 19)', () => {
  it('touching a released batch calls batch, then recipe, then starts the session', async () => {
    mock = installMockApi(queueApi());
    const onSessionStarted = vi.fn();
    render(<SelectBatchScreen onSessionStarted={onSessionStarted} />);
    await userEvent.setup().click(await screen.findByTestId(`row-${BATCH_OK.batchId}`));
    await waitFor(() => expect(onSessionStarted).toHaveBeenCalledWith(SESSION, BATCH_OK));
    const api = mock.calls.filter((c) => !c.includes('/api/scanner/'));
    expect(api).toEqual([
      'GET /api/batches',
      `GET /api/batches/${BATCH_OK.batchId}`,
      `GET /api/batches/${BATCH_OK.batchId}/recipe`,
      'POST /api/sessions',
    ]);
    expect(mock.calls.some((c) => c.includes('/ext/'))).toBe(false);
  });

  it('touching a QUEUED batch shows its reason and calls nothing else', async () => {
    mock = installMockApi(queueApi());
    const onSessionStarted = vi.fn();
    render(<SelectBatchScreen onSessionStarted={onSessionStarted} />);
    await userEvent.setup().click(await screen.findByTestId(`row-${BATCH_BLOCKED.batchId}`));
    expect(
      await screen.findByText(`Batch ${BATCH_BLOCKED.batchId}: Not released by OrgaTEX`),
    ).toBeTruthy();
    expect(onSessionStarted).not.toHaveBeenCalled();
    expect(mock.calls.filter((c) => c.includes(`/api/batches/${BATCH_BLOCKED.batchId}`))).toEqual(
      [],
    );
    expect(mock.calls).not.toContain('POST /api/sessions');
  });

  it('a typed batch ID is classified by the API and starts the batch', async () => {
    mock = installMockApi({
      ...queueApi(),
      'POST /api/scanner/manual': { body: scan(0, BATCH_OK.batchId, 'BATCH') },
    });
    const onSessionStarted = vi.fn();
    const user = userEvent.setup();
    render(<SelectBatchScreen onSessionStarted={onSessionStarted} />);
    await screen.findByTestId(`row-${BATCH_OK.batchId}`);
    await user.type(screen.getByLabelText('Type code'), 'b-10001{Enter}');
    await waitFor(() => expect(onSessionStarted).toHaveBeenCalled());
    expect(mock.calls).toContain('POST /api/scanner/manual');
  });

  it('a scanned batch card starts the batch', async () => {
    mock = installMockApi({
      ...queueApi(),
      'GET /api/scanner/scans': scanFeedDelivering([scan(1, BATCH_OK.batchId, 'BATCH')]),
    });
    const onSessionStarted = vi.fn();
    render(<SelectBatchScreen onSessionStarted={onSessionStarted} />);
    await waitFor(() => expect(onSessionStarted).toHaveBeenCalledWith(SESSION, BATCH_OK), {
      timeout: 3000,
    });
  });

  it('a code that is not a batch card is refused with a message', async () => {
    mock = installMockApi({
      ...queueApi(),
      'POST /api/scanner/manual': { body: scan(0, 'X-1234', 'UNKNOWN') },
    });
    const user = userEvent.setup();
    render(<SelectBatchScreen onSessionStarted={() => {}} />);
    await screen.findByTestId(`row-${BATCH_OK.batchId}`);
    await user.type(screen.getByLabelText('Type code'), 'x-1234{Enter}');
    expect(await screen.findByText('X-1234 is not a batch card.')).toBeTruthy();
    expect(mock.calls).not.toContain('POST /api/sessions');
  });

  it('shows the API message when another batch is already in progress', async () => {
    mock = installMockApi({
      ...queueApi(),
      'POST /api/sessions': apiError(
        409,
        'SESSION_IN_PROGRESS',
        'Batch B-99999 is in progress at this station; quit it before starting another batch',
      ),
    });
    render(<SelectBatchScreen onSessionStarted={() => {}} />);
    await userEvent.setup().click(await screen.findByTestId(`row-${BATCH_OK.batchId}`));
    expect(await screen.findByText(/is in progress at this station; quit it/)).toBeTruthy();
  });
});

describe('SelectBatchScreen — OrgaTEX unavailable (FR-36)', () => {
  it('shows "OrgaTEX not reachable" and Retry instead of the table, then recovers', async () => {
    mock = installMockApi({ ...queueApi(), 'GET /api/batches': orgatexDown() });
    const user = userEvent.setup();
    render(<SelectBatchScreen onSessionStarted={() => {}} />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('OrgaTEX not reachable')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId(`row-${BATCH_OK.batchId}`)).toBeNull();

    mock.set('GET /api/batches', { body: QUEUE });
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId(`row-${BATCH_OK.batchId}`)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the same message when OrgaTEX drops while a batch is being opened', async () => {
    mock = installMockApi({
      ...queueApi(),
      [`GET /api/batches/${BATCH_OK.batchId}/recipe`]: orgatexDown(),
    });
    render(<SelectBatchScreen onSessionStarted={() => {}} />);
    await userEvent.setup().click(await screen.findByTestId(`row-${BATCH_OK.batchId}`));
    expect(await screen.findByText('OrgaTEX not reachable')).toBeTruthy();
    expect(mock.calls).not.toContain('POST /api/sessions');
  });

  it('a non-OrgaTEX load failure shows the error with Retry', async () => {
    mock = installMockApi({
      'GET /api/batches': {
        status: 500,
        body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      },
    });
    render(<SelectBatchScreen onSessionStarted={() => {}} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Something went wrong: Internal server error');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

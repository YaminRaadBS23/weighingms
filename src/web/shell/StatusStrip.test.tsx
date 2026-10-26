// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { hhmm, hhmmss } from '../shared/format';
import { installMockApi, type MockApi } from '../test/mock-api';
import { StatusStrip } from './StatusStrip';

let mock: MockApi;
afterEach(() => {
  cleanup();
  mock.restore();
});

const text = (id: string) => screen.getByTestId(id).textContent;

describe('StatusStrip', () => {
  it('shows both scales, scanner, printer, ORGATEX link time, EN and the clock', async () => {
    mock = installMockApi();
    const now = new Date(2026, 9, 16, 7, 47, 3);
    render(<StatusStrip now={now} />);
    await waitFor(() => expect(text('stat-scale-a')).toBe('SCALE 3 kg · READY'));
    expect(text('stat-scale-b')).toBe('SCALE 32 kg · READY');
    expect(text('stat-scanner')).toBe('SCANNER · READY');
    expect(text('stat-printer')).toBe('PRINTER · READY');
    expect(text('stat-orgatex')).toBe(`ORGATEX · LINKED ${hhmm('2026-10-16T07:41:00.000Z')}`);
    expect(text('clock')).toBe(hhmmss(now));
    expect(screen.getByText('EN')).toBeTruthy();
  });

  it('writes the state in text for every non-ready device', async () => {
    mock = installMockApi({
      'GET /api/scales': {
        body: {
          items: [
            {
              scaleId: 'scale-a',
              class: 'PRECISION',
              capacity: { value: '3', unit: 'kg' },
              unit: 'g',
              resolution: { value: '0.1', unit: 'g' },
              calibrationDueAt: 'x',
              calibration: 'EXPIRED',
              state: 'CAL_EXPIRED',
            },
            {
              scaleId: 'scale-b',
              class: 'FLOOR',
              capacity: { value: '32', unit: 'kg' },
              unit: 'kg',
              resolution: { value: '0.001', unit: 'kg' },
              calibrationDueAt: 'x',
              calibration: 'VALID',
              state: 'OFFLINE',
            },
          ],
        },
      },
      'GET /api/scanner/status': { body: { state: 'OFFLINE' } },
      'GET /api/printer/status': { body: { state: 'OUT_OF_PAPER' } },
      'GET /api/orgatex/status': {
        body: { state: 'OFFLINE', lastContactAt: '2026-10-16T07:41:00.000Z' },
      },
    });
    render(<StatusStrip now={new Date()} />);
    await waitFor(() => expect(text('stat-scale-a')).toBe('SCALE 3 kg · CAL EXPIRED'));
    expect(text('stat-scale-b')).toBe('SCALE 32 kg · OFFLINE');
    expect(text('stat-scanner')).toBe('SCANNER · OFFLINE');
    expect(text('stat-printer')).toBe('PRINTER · OUT OF PAPER');
    expect(text('stat-orgatex')).toBe('ORGATEX · OFFLINE');
  });

  it('reports devices as OFFLINE when the API cannot be reached', async () => {
    mock = installMockApi({
      'GET /api/scales': { status: 500, body: null },
      'GET /api/scanner/status': { status: 500, body: null },
      'GET /api/printer/status': { status: 500, body: null },
      'GET /api/orgatex/status': { status: 500, body: null },
    });
    render(<StatusStrip now={new Date()} />);
    await waitFor(() => expect(text('stat-scanner')).toBe('SCANNER · OFFLINE'));
    expect(text('stat-printer')).toBe('PRINTER · OFFLINE');
    expect(text('stat-orgatex')).toBe('ORGATEX · OFFLINE');
  });
});

describe('StatusStrip · pending write-backs', () => {
  it('shows nothing about write-back while none is pending', async () => {
    mock = installMockApi();
    render(<StatusStrip now={new Date()} />);
    await waitFor(() => expect(text('stat-scanner')).toBe('SCANNER · READY'));
    expect(screen.queryByTestId('stat-writeback')).toBeNull();
  });

  it('shows an amber "WRITE-BACK n PENDING" item while completed batches wait for OrgaTEX', async () => {
    mock = installMockApi({ 'GET /api/write-backs/pending-count': { body: { count: 2 } } });
    render(<StatusStrip now={new Date()} />);
    await waitFor(() => expect(text('stat-writeback')).toBe('WRITE-BACK · 2 PENDING'));
  });

  it('shows nothing when the count cannot be read (the other items still show)', async () => {
    mock = installMockApi({ 'GET /api/write-backs/pending-count': { status: 500, body: null } });
    render(<StatusStrip now={new Date()} />);
    await waitFor(() => expect(text('stat-printer')).toBe('PRINTER · READY'));
    expect(screen.queryByTestId('stat-writeback')).toBeNull();
  });
});

import type { APIRequestContext, Page } from '@playwright/test';
import { Api, BATCH, INACTIVE_BADGE, OPERATOR_BADGE } from '../support/api';
import { observed, scenario } from '../support/evidence';
import { beginAt, finishLast } from '../support/flow';
import { Station } from '../support/station';
import { expect, test } from '../support/stack';

const open = (request: APIRequestContext, page: Page) => ({
  api: new Api(request),
  station: new Station(page),
});

test('OrgaTEX unavailable when the batch is chosen', async ({ page, request }) => {
  scenario(
    'OrgaTEX unavailable (on load)',
    'Defined behaviour: "OrgaTEX not reachable" with Retry, no weighing session starts; Retry works once OrgaTEX is back',
  );
  const { api, station } = open(request, page);
  await api.sim.orgatex('offline');
  await station.open();
  await station.signIn(OPERATOR_BADGE);
  const down = page.getByRole('alert').filter({ hasText: 'OrgaTEX not reachable' });
  await expect(down).toBeVisible();
  expect(await api.currentSession()).toBeNull();
  const shown = await down.innerText();

  await api.sim.orgatex('online');
  await down.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId(`row-${BATCH}`)).toBeVisible();
  observed(`"${shown}"; no session started; after OrgaTEX came back the queue loaded`);
});

test('OrgaTEX unavailable at completion: the result is kept, the ticket prints, Retry sends it', async ({
  page,
  request,
}) => {
  scenario(
    'OrgaTEX unavailable (at completion)',
    'Weighing completes and the ticket prints; write-back shows PENDING with Retry and a strip item; Retry after OrgaTEX returns gives CONFIRMED',
  );
  const { api, station } = open(request, page);
  const w = await beginAt(api, station, 4);
  await api.sim.dispense(w.scaleId, w.component.target);
  await expect(station.toleranceStatus).toHaveText('WITHIN TOLERANCE — PRESS OK TO CONFIRM');
  await api.sim.orgatex('offline');
  await station.okKey.click();

  await expect(page.getByText(`Batch ${BATCH} weighed`)).toBeVisible();
  await expect(page.getByTestId('writeback')).toHaveText('PENDING');
  await expect(page.getByTestId('writeback-detail')).toContainText('OrgaTEX is not reachable');
  const pending = await page.getByTestId('writeback-detail').innerText();
  await expect(station.strip('writeback')).toContainText('1 PENDING', { timeout: 10_000 });
  expect(await api.sim.orgatexPostings()).toBe(0);

  await station.key(/Print ticket/).click();
  await expect(page.getByTestId('ticket-status')).toHaveText(/^Printed/);
  expect(await api.sim.printerJobs()).toHaveLength(1);

  await api.sim.orgatex('online');
  await page.getByTestId('writeback-detail').getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('writeback')).toHaveText(/^CONFIRMED/);
  await expect(station.strip('writeback')).toHaveCount(0, { timeout: 10_000 });
  expect(await api.sim.orgatexPostings()).toBe(1);
  observed(
    `PENDING: "${pending}"; ticket printed meanwhile; after Retry CONFIRMED and exactly one posting reached OrgaTEX`,
  );
});

async function completeBatch(api: Api, station: Station) {
  const w = await beginAt(api, station, 4);
  await finishLast(api, station, w);
  await expect(station.page.getByText(`Batch ${BATCH} weighed`)).toBeVisible();
}

test('printer offline: the ticket is kept, Retry prints the same ticket', async ({
  page,
  request,
}) => {
  scenario(
    'Printer unavailable',
    'Ticket kept and shown, error says the printer is offline, write-back unaffected; Retry prints the same ticket (not a reprint); Reprint adds a marked copy',
  );
  const { api, station } = open(request, page);
  await api.sim.printer('OFFLINE');
  await completeBatch(api, station);
  await expect(page.getByTestId('writeback')).toHaveText(/^CONFIRMED/);

  await station.key(/Print ticket/).click();
  const failure = page.getByRole('alert').filter({ hasText: 'The printer is offline.' });
  await expect(failure).toBeVisible();
  await expect(page.getByTestId('ticket-status')).toHaveText('Not printed');
  await expect(page.getByTestId('ticket')).toContainText('ALL WITHIN TOLERANCE');
  await expect(page.getByTestId('writeback')).toHaveText(/^CONFIRMED/);
  const message = await failure.innerText();
  expect(await api.sim.printerJobs()).toHaveLength(0);

  await api.sim.printer('READY');
  await station.key(/Retry print/).click();
  await expect(page.getByTestId('ticket-status')).toHaveText(/^Printed/);
  await expect(page.getByTestId('ticket')).not.toContainText('REPRINT');
  expect(await api.sim.printerJobs()).toHaveLength(1);
  const tickets = await api.attempt('GET', `/api/batches/${BATCH}/tickets`);
  expect(tickets.body.tickets).toHaveLength(1);

  await station.key(/Reprint/).click();
  await expect(page.getByTestId('ticket')).toContainText('*** REPRINT ***');
  await expect(page.getByTestId('ticket-status')).toContainText('Copies printed: 1');
  expect(await api.sim.printerJobs()).toHaveLength(2);
  observed(
    `"${message}"; Retry printed the same ticket (1 ticket, 1 job); Reprint added a copy marked REPRINT (2 jobs)`,
  );
});

test('printer out of paper is named as such', async ({ page, request }) => {
  scenario(
    'Printer out of paper',
    'The error says the printer is out of paper and the ticket is kept',
  );
  const { api, station } = open(request, page);
  await api.sim.printer('OUT_OF_PAPER');
  await completeBatch(api, station);
  await station.key(/Print ticket/).click();
  const failure = page.getByRole('alert').filter({ hasText: 'out of paper' });
  await expect(failure).toBeVisible();
  await expect(station.key(/Retry print/)).toBeEnabled();
  observed(`"${await failure.innerText()}"`);
});

test('quit leaves the batch safely and it can be resumed', async ({ page, request }) => {
  scenario(
    'Quit',
    'Safe exit: confirmed components are kept, the unfinished one is not recorded, the batch can be resumed',
  );
  const { api, station } = open(request, page);
  const w = await beginAt(api, station, 2);
  await api.sim.weight(w.scaleId, { value: '60.0', unit: 'g' });
  await expect(station.weightNow).toContainText('60.0');
  await page.keyboard.press('F4');
  await expect(page.getByRole('dialog')).toContainText('Quit this batch?');
  await page.getByRole('button', { name: 'Quit batch' }).click();
  await expect(page.getByText('Scan a batch card to begin')).toBeVisible();

  const records = await api.attempt('GET', `/api/sessions/${w.sessionId}/records`);
  const items = (records.body.items ?? records.body.records) as unknown[];
  expect(items).toHaveLength(2);
  expect(await api.currentSession()).toBeNull();

  await station.selectBatch(BATCH);
  await expect(station.page.locator('aside')).toContainText('2 of 5 components weighed');
  observed(
    `quit confirmed; ${items.length} confirmed records kept, none for the unfinished component; choosing B-24187 again resumed at "2 of 5 components weighed"`,
  );
});

test('an incomplete batch cannot be completed, ticketed or written back', async ({
  page,
  request,
}) => {
  scenario(
    'Incomplete batch',
    'Cannot complete: no ticket (422 BATCH_INCOMPLETE), no write-back, no Confirm & print screen',
  );
  const { api, station } = open(request, page);
  const session = await api.weighFirst(4);
  await station.open();
  await expect(station.page.locator('aside')).toContainText('4 of 5 components weighed');

  const ticket = await api.attempt('POST', '/api/tickets', { batchId: BATCH });
  expect(ticket.status).toBe(422);
  expect(ticket.body.error?.code).toBe('BATCH_INCOMPLETE');
  const complete = await api.attempt('POST', `/api/sessions/${session.sessionId}/complete`);
  expect(complete.status).toBeGreaterThanOrEqual(400);
  const writeBack = await api.attempt('POST', `/api/batches/${BATCH}/consumption`);
  expect(writeBack.status).toBeGreaterThanOrEqual(400);
  expect(await api.sim.orgatexPostings()).toBe(0);
  expect(await api.sim.printerJobs()).toHaveLength(0);
  await expect(page.getByText(`Batch ${BATCH} weighed`)).toHaveCount(0);
  observed(
    `ticket refused (HTTP ${ticket.status} ${ticket.body.error?.code}); completion refused (HTTP ${complete.status}); write-back refused (HTTP ${writeBack.status}); nothing posted, nothing printed`,
  );
});

test('an inactive operator cannot sign in', async ({ page, request }) => {
  scenario('Inactive operator', 'Refused with a message; nothing else is reachable');
  const { api, station } = open(request, page);
  await station.open();
  await station.signIn(INACTIVE_BADGE);
  await expect(page.getByText('Badge not recognised or operator inactive')).toBeVisible();
  const current = await api.attempt('GET', '/api/operators/current');
  expect(current.body.operator).toBeNull();
  observed('"Badge not recognised or operator inactive"; no operator is signed in');
});

test('the Training Panel steers the station through the normal APIs', async ({
  page,
  request,
  context,
}) => {
  scenario(
    'Training Panel',
    'Simulate dispense in the panel brings the operator screen to its target (the disabled-simulation case is covered by the component tests)',
  );
  const { api, station } = open(request, page);
  await beginAt(api, station, 2);

  const panel = await context.newPage();
  await panel.goto('/training');
  await expect(panel.getByText(/Active component: Yellow RGB/)).toBeVisible({ timeout: 15_000 });
  await panel.getByRole('button', { name: 'Simulate dispense' }).click();
  await expect(panel.getByText('Done: Simulate dispense')).toBeVisible();
  await page.bringToFront();
  await expect(station.toleranceStatus).toHaveText('WITHIN TOLERANCE — PRESS OK TO CONFIRM');
  observed('Simulate dispense in /training brought the operator screen to "WITHIN TOLERANCE"');
});

import type { APIRequestContext, Page } from '@playwright/test';
import { Api, SUPERVISOR_BADGE, SUPERVISOR_PIN } from '../support/api';
import { observed, scenario } from '../support/evidence';
import { beginAt } from '../support/flow';
import { q } from '../support/sim';
import { Station } from '../support/station';
import { expect, test } from '../support/stack';

// Component 3 (Yellow RGB) is 94.0 g ± 0.5 g on the precision scale.
const setup = async (request: APIRequestContext, page: Page) => {
  const api = new Api(request);
  const station = new Station(page);
  const w = await beginAt(api, station, 2);
  return { api, station, w };
};

test('tolerance matrix: 93.4 / 93.5 / 94.0 / 94.5 / 94.6 g', async ({ page, request }) => {
  scenario('Tolerance matrix 93.4 – 94.6 g', 'OK enabled only from 93.5 g to 94.5 g inclusive');
  const { api, station, w } = await setup(request, page);
  const seen: string[] = [];
  for (const [grams, enabled] of [
    ['93.4', false],
    ['93.5', true],
    ['94.0', true],
    ['94.5', true],
    ['94.6', false],
  ] as const) {
    await api.sim.weight(w.scaleId, q(grams, 'g'));
    await expect(station.weightNow).toContainText(grams);
    await api.settled(w.scaleId);
    if (enabled) await expect(station.okKey).toBeEnabled();
    else await expect(station.okKey).toBeDisabled();
    seen.push(`${grams} g → OK ${enabled ? 'enabled' : 'disabled'}`);
  }
  observed(seen.join('; '));
});

test('over tolerance cannot be confirmed; removing the excess lets it through', async ({
  page,
  request,
}) => {
  scenario('Over tolerance', 'Cannot confirm; surplus shown; confirmed once back in tolerance');
  const { api, station, w } = await setup(request, page);
  await api.sim.weight(w.scaleId, q('97.0', 'g'));
  await expect(station.toleranceStatus).toHaveText('OVER TOLERANCE — SURPLUS +3.0 g');
  await expect(page.getByTestId('surplus-panel')).toBeVisible();
  // Judge the key on a settled reading: an unsettled one is disabled for another reason.
  await api.settled(w.scaleId);
  await expect(station.okKey).toBeDisabled();
  const refused = await api.attempt('POST', `/api/sessions/${w.sessionId}/components/3/confirm`);
  expect(refused.status).toBe(422);
  expect(refused.body.error?.code).toBe('TOLERANCE_VIOLATION');
  observed(
    `status line "${await station.toleranceStatus.innerText()}", OK disabled, server refused with ${refused.body.error?.code}`,
  );

  await api.sim.weight(w.scaleId, q('94.0', 'g'));
  await station.confirmWhenReady();
  await expect(station.rail(3)).toContainText('✓');
});

test('under tolerance cannot be confirmed', async ({ page, request }) => {
  scenario('Under tolerance', 'Cannot confirm; the amount still to dispense is shown');
  const { api, station, w } = await setup(request, page);
  await api.sim.weight(w.scaleId, q('90.0', 'g'));
  await expect(station.toleranceStatus).toHaveText('DISPENSE — 4.0 g REMAINING');
  await api.settled(w.scaleId);
  await expect(station.okKey).toBeDisabled();
  const refused = await api.attempt('POST', `/api/sessions/${w.sessionId}/components/3/confirm`);
  expect(refused.status).toBe(422);
  expect(refused.body.error?.code).toBe('TOLERANCE_VIOLATION');
  observed(
    `status line "${await station.toleranceStatus.innerText()}", OK disabled, server refused with ${refused.body.error?.code}`,
  );
});

test('invalid weight and invalid scans are refused', async ({ page, request }) => {
  scenario(
    'Invalid weight',
    'No weight on the scale cannot be confirmed; a non-numeric weight is refused by the scale; a wrong dyestuff is refused',
  );
  const api = new Api(request);
  const station = new Station(page);
  await api.weighFirst(2);
  await station.open();

  // Wrong dyestuff: the next component needs DYE-4471, not the code of Red RB.
  const other = (await api.recipe())[1]!.dyestuff.code;
  await station.enter(other);
  await expect(station.alert.first()).toContainText('Wrong dyestuff');
  const wrong = await station.alert.first().innerText();

  const component = (await api.recipe())[2]!;
  await station.unlock(component.dyestuff.code);
  const sessionId = (await api.currentSession())!.sessionId;
  const w = { sessionId, ...(await api.active(sessionId)) };
  await api.sim.weight(w.scaleId, q('0', 'g'));
  await api.settled(w.scaleId);
  await expect(station.okKey).toBeDisabled();
  const zero = await api.attempt('POST', `/api/sessions/${w.sessionId}/components/3/confirm`);
  expect(zero.status).toBeGreaterThanOrEqual(400);

  const bad = await request.post(`/ext/scale/_sim/${w.scaleId}/weight`, {
    data: { net: { value: 'abc', unit: 'g' } },
  });
  expect(bad.status()).toBeGreaterThanOrEqual(400);
  expect(bad.status()).toBeLessThan(500);
  observed(
    `wrong dyestuff: "${wrong}"; empty scale: OK disabled and server refused (HTTP ${zero.status} ${zero.body.error?.code}); scale refused "abc" with HTTP ${bad.status()}`,
  );
});

test('re-tare resets the weight on the scale', async ({ page, request }) => {
  scenario('Re-tare', 'Weight reset to zero after Re-tare');
  const { api, station, w } = await setup(request, page);
  await api.sim.weight(w.scaleId, q('50.0', 'g'));
  await expect(station.weightNow).toContainText('50.0');
  const before = await station.weightNow.innerText();
  await station.key(/^Re-tare/).click();
  await expect(station.weightNow).toContainText(/^\s*0\.0/);
  observed(`before Re-tare "${before}", after "${await station.weightNow.innerText()}"`);
});

test('scale unavailable: weighing stops safely and resumes only after a re-tare', async ({
  page,
  request,
}) => {
  scenario(
    'Scale unavailable',
    'Safe failure: notice shown, OK and Override disabled, nothing can be confirmed; after reconnect a Re-tare is required',
  );
  const { api, station, w } = await setup(request, page);
  await api.sim.weight(w.scaleId, q('94.0', 'g'));
  await expect(station.okKey).toBeEnabled();
  await api.sim.disconnect(w.scaleId);

  await expect(station.alert.filter({ hasText: 'Scale unavailable' })).toBeVisible({
    timeout: 15_000,
  });
  const lost = await station.alert.filter({ hasText: 'Scale unavailable' }).innerText();
  await expect(station.okKey).toBeDisabled();
  await expect(station.key(/Supervisor override/)).toBeDisabled();
  // The screen treats the scale as lost after 2 s without a reading; stay disconnected past that.
  await page.waitForTimeout(3_000);
  const refused = await api.attempt('POST', `/api/sessions/${w.sessionId}/components/3/confirm`);
  expect(refused.status).toBeGreaterThanOrEqual(400);

  await api.sim.reconnect(w.scaleId);
  await expect(station.alert.filter({ hasText: 're-tare' })).toBeVisible({ timeout: 15_000 });
  await expect(station.okKey).toBeDisabled();
  const back = await station.alert.filter({ hasText: 're-tare' }).innerText();
  await station.key(/^Re-tare/).click();
  await expect(station.alert.filter({ hasText: 're-tare' })).toHaveCount(0);

  await api.sim.weight(w.scaleId, q('94.0', 'g'));
  await station.confirmWhenReady();
  observed(
    `lost: "${lost}"; OK and Override disabled; server refused (HTTP ${refused.status}); reconnected: "${back}"; after Re-tare the component confirmed`,
  );
});

test('supervisor override: a wrong PIN changes nothing, the right one is recorded', async ({
  page,
  request,
}) => {
  scenario(
    'Supervisor override',
    'Wrong PIN refused with nothing changed; correct badge, PIN and reason confirm the component as OVERRIDDEN',
  );
  const { api, station, w } = await setup(request, page);
  await api.sim.weight(w.scaleId, q('97.0', 'g'));
  await expect(station.toleranceStatus).toHaveText('OVER TOLERANCE — SURPLUS +3.0 g');
  await api.settled(w.scaleId);

  await station.key(/Supervisor override/).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Supervisor badge').fill(SUPERVISOR_BADGE);
  await dialog.getByLabel('PIN').fill('0000');
  await dialog.getByLabel(/^Reason/).fill('Training: surplus accepted');
  await dialog.getByRole('button', { name: 'Authorise' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Badge or PIN not accepted');
  const refusal = await dialog.getByRole('alert').innerText();
  await expect(station.rail(3)).not.toContainText('✓');

  await dialog.getByLabel('PIN').fill(SUPERVISOR_PIN);
  await dialog.getByRole('button', { name: 'Authorise' }).click();
  await expect(station.rail(3)).toContainText('OVERRIDDEN');
  const records = await api.attempt('GET', `/api/sessions/${w.sessionId}/records`);
  const third = (records.body.items ?? records.body.records)?.find(
    (r: { sequence: number }) => r.sequence === 3,
  );
  expect(third?.result).toBe('OVERRIDDEN');
  observed(`wrong PIN: "${refusal}"; correct PIN: component 3 recorded as ${third?.result}`);
});

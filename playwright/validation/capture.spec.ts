import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { Api, BATCH, OPERATOR_BADGE } from '../support/api';
import { finishLast, beginAt } from '../support/flow';
import { Station } from '../support/station';
import { expect, test } from '../support/stack';

const OUT = path.resolve('STEP-28-ui-validation');
const PROTOTYPE = pathToFileURL(path.resolve('docs/customize-weighing-station.html')).href;
mkdirSync(path.join(OUT, 'parts'), { recursive: true });

const shot = async (page: Page, name: string) => {
  const file = path.join(OUT, 'parts', `${name}.png`);
  await page.screenshot({ path: file });
  return file;
};

async function prototype(page: Page, view: 'queue' | 'weigh' | 'done') {
  await page.goto(PROTOTYPE);
  await page.locator('#pin-toggle').uncheck();
  await page.locator(`.seg button[data-view="${view}"]`).click();
}

/** Two screenshots side by side, titled, as one PNG (the Step 28 comparison). */
async function compare(
  page: Page,
  name: string,
  rows: { title: string; proto: string; app: string }[],
) {
  const img = (file: string) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
  const html = `<body style="margin:0;background:#fff;font:14px system-ui;color:#111">
    <div style="padding:10px 16px;font-weight:600">${name}</div>
    ${rows
      .map(
        (r) => `<div style="padding:4px 16px;color:#555">${r.title}</div>
        <div style="display:flex;gap:12px;padding:0 16px 12px">
          <figure style="margin:0;flex:1"><figcaption>Prototype</figcaption><img style="width:100%;border:1px solid #bbb" src="${img(r.proto)}"></figure>
          <figure style="margin:0;flex:1"><figcaption>WeighingMS</figcaption><img style="width:100%;border:1px solid #bbb" src="${img(r.app)}"></figure>
        </div>`,
      )
      .join('')}</body>`;
  const sheet = await page.context().newPage();
  await sheet.setViewportSize({ width: 2640, height: 100 });
  await sheet.setContent(html);
  await sheet.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  await sheet.close();
}

test('capture the three screens', async ({ page, request }) => {
  const api = new Api(request);
  const station = new Station(page);
  const proto = await page.context().newPage();
  await proto.setViewportSize({ width: 1280, height: 800 });

  // Screen 1 · Select batch
  await prototype(proto, 'queue');
  const p1 = await shot(proto, 'proto-1-queue');
  await station.open();
  await station.signIn(OPERATOR_BADGE);
  await expect(page.getByTestId(`row-${BATCH}`)).toBeVisible();
  await page.mouse.move(0, 0);
  const a1 = await shot(page, 'app-1-queue');
  await compare(proto, 'screen-1-comparison', [{ title: '1 · Select batch', proto: p1, app: a1 }]);

  // Screen 2 · Weigh: the prototype shows Yellow RGB with two components done; so do we.
  const w = await beginAt(api, station, 2);
  await prototype(proto, 'weigh');
  await proto.locator('#sim-ok').click();
  await proto.waitForTimeout(6000);
  const p2a = await shot(proto, 'proto-2-weigh-ok');
  await api.sim.dispense(w.scaleId, w.component.target);
  await expect(station.toleranceStatus).toHaveText('WITHIN TOLERANCE — PRESS OK TO CONFIRM');
  const a2a = await shot(page, 'app-2-weigh-ok');
  await proto.locator('#sim-over').click();
  await proto.waitForTimeout(6000);
  const p2b = await shot(proto, 'proto-2-weigh-over');
  const over = {
    value: String(Number(w.component.target.value) + Number(w.component.tolerance.value) * 4.8),
    unit: w.component.target.unit,
  };
  await api.sim.weight(w.scaleId, over);
  await expect(station.toleranceStatus).toContainText('OVER TOLERANCE');
  await api.settled(w.scaleId);
  await expect(station.okReason).toHaveText('The weight is not within tolerance');
  const a2b = await shot(page, 'app-2-weigh-over');
  await compare(proto, 'screen-2-comparison', [
    { title: '2 · Weigh — within tolerance', proto: p2a, app: a2a },
    { title: '2 · Weigh — over tolerance', proto: p2b, app: a2b },
  ]);

  // Screen 3 · Confirm & print: finish the batch, print the ticket.
  await api.sim.weight(w.scaleId, w.component.target);
  await api.settled(w.scaleId);
  await station.confirmWhenReady();
  for (const c of (await api.recipe()).slice(3)) {
    await station.unlock(c.dyestuff.code);
    const { scaleId } = await api.active((await api.currentSession())!.sessionId);
    await api.sim.dispense(scaleId, c.target);
    await station.confirmWhenReady();
  }
  await expect(page.getByTestId('writeback')).toHaveText(/^CONFIRMED/);
  const a3a = await shot(page, 'app-3-done-before-print');
  await station.key(/Print ticket/).click();
  await expect(page.getByTestId('ticket-status')).toHaveText(/^Printed/);
  await page.mouse.move(0, 0);
  const a3b = await shot(page, 'app-3-done-printed');
  await prototype(proto, 'done');
  const p3 = await shot(proto, 'proto-3-done');
  await compare(proto, 'screen-3-comparison', [
    {
      title: '3 · Confirm & print — on arrival (the prototype shows the ticket at once)',
      proto: p3,
      app: a3a,
    },
    { title: '3 · Confirm & print — after Print ticket (F1)', proto: p3, app: a3b },
  ]);
  writeFileSync(path.join(OUT, 'parts', '.keep'), '');
});

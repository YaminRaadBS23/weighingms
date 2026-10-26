import { Api, BATCH, OPERATOR_BADGE } from '../support/api';
import { Station } from '../support/station';
import { expect, test } from '../support/stack';

// Workbook Step 29: open → B-24187 → five components → complete → OrgaTEX write-back → ticket.
test('B-24187 from sign-in to a printed ticket', async ({ page, request }) => {
  const api = new Api(request);
  const station = new Station(page);
  const recipe = await api.recipe();
  // The five components, in the order of the workbook scenario.
  ['Blue RSPL', 'Red RB', 'Yellow RGB', 'Sodium Sulphate', 'Soda Ash'].forEach((name, i) =>
    expect(recipe[i]?.dyestuff.name).toContain(name),
  );

  await test.step('sign in and select B-24187', async () => {
    await station.open();
    await station.signIn(OPERATOR_BADGE);
    await expect(page.getByText('Scan a batch card to begin')).toBeVisible();
    await station.selectBatch(BATCH);
    await expect(page.getByTestId('crumb')).toContainText(BATCH);
    await expect(station.page.locator('aside')).toContainText('0 of 5 components weighed');
  });

  for (const component of recipe) {
    await test.step(`${component.sequence}. ${component.dyestuff.name}`, async () => {
      await expect(station.rail(component.sequence)).toContainText('WEIGHING');
      await station.unlock(component.dyestuff.code);
      const { scaleId } = await api.active((await api.currentSession())!.sessionId);
      await api.sim.dispense(scaleId, component.target);
      await station.confirmWhenReady();
      // The fifth confirmation completes the batch and the rail gives way to Confirm & print.
      if (component.sequence < recipe.length)
        await expect(station.rail(component.sequence)).toContainText('✓');
    });
  }

  await test.step('Confirm & print: summary and write-back', async () => {
    await expect(page.getByText(`Batch ${BATCH} weighed`)).toBeVisible();
    const summary = page.getByTestId('summary');
    await expect(summary).toContainText('5 of 5');
    await expect(summary).toContainText('YES');
    await expect(summary).toContainText('R. Karim');
    await expect(page.getByTestId('writeback')).toHaveText(/^CONFIRMED \d\d:\d\d:\d\d$/);
    expect(await api.sim.orgatexPostings()).toBe(1);
  });

  await test.step('Print ticket', async () => {
    await expect(page.getByTestId('ticket-empty')).toBeVisible();
    await station.key(/Print ticket/).click();
    const ticket = page.getByTestId('ticket');
    await expect(ticket).toContainText('COMPONENT');
    await expect(ticket).toContainText('Blue RSPL');
    await expect(ticket).toContainText('ALL WITHIN TOLERANCE');
    await expect(ticket.getByRole('img', { name: `Code 128 barcode ${BATCH}` })).toBeVisible();
    await expect(page.getByTestId('ticket-status')).toHaveText(/^Printed \d\d:\d\d$/);
    expect(await api.sim.printerJobs()).toHaveLength(1);
  });

  await test.step('Next batch: B-24187 is WEIGHED', async () => {
    await station.key(/Next batch/).click();
    await expect(page.getByTestId(`row-${BATCH}`)).toContainText('WEIGHED');
    await expect(station.strip('writeback')).toHaveCount(0);
  });
});

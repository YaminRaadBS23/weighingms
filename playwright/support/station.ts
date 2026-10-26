import { expect, type Locator, type Page } from '@playwright/test';

/** The station screens as an operator sees them. Text is what the screen shows, nothing hidden. */
export class Station {
  constructor(readonly page: Page) {}

  get scanField(): Locator {
    return this.page.locator('#scan-entry');
  }
  get alert(): Locator {
    return this.page.getByRole('alert');
  }
  get okKey(): Locator {
    return this.page.getByRole('button', { name: /OK · Confirm/ });
  }
  get weightNow(): Locator {
    return this.page.getByTestId('weight-now');
  }
  get toleranceStatus(): Locator {
    return this.page.locator('[data-zone][role="status"]');
  }
  get okReason(): Locator {
    return this.page.getByTestId('ok-reason');
  }
  strip(item: string): Locator {
    return this.page.getByTestId(`stat-${item}`);
  }
  key(name: string | RegExp): Locator {
    return this.page.getByRole('button', { name });
  }

  /** Types a code into the scan entry (the scanner and the keyboard share one path, FR-34). */
  async enter(code: string) {
    await this.scanField.fill(code);
    await this.scanField.press('Enter');
  }

  async open() {
    await this.page.goto('/');
  }

  async signIn(badge: string) {
    await this.enter(badge);
  }

  async selectBatch(batchId: string) {
    await this.page.getByRole('button', { name: batchId, exact: true }).click();
  }

  /** Scans the dyestuff and waits until the component is unlocked (lot and container default). */
  async unlock(dyestuffCode: string) {
    await this.enter(dyestuffCode);
    await expect(this.weightNow).not.toHaveText(/Scale unavailable/);
    await expect(this.key(/^Re-tare/)).toBeEnabled();
  }

  async confirmWhenReady() {
    await expect(this.toleranceStatus).toHaveText('WITHIN TOLERANCE — PRESS OK TO CONFIRM');
    await expect(this.okKey).toBeEnabled();
    await this.okKey.click();
  }

  rail(sequence: number): Locator {
    return this.page.locator('aside ul li').nth(sequence - 1);
  }
}

import type { Browser } from "playwright";
import { chromium } from "playwright";

export class BrowserPool {
  private browser: Browser | null = null;

  constructor(private readonly headless: boolean) {}

  async getBrowser(): Promise<Browser> {
    if (!this.browser?.isConnected()) {
      this.browser = await chromium.launch({
        headless: this.headless,
        // Suppress navigator.webdriver to avoid trivial headless detection.
        args: ['--disable-blink-features=AutomationControlled'],
      });
    }

    return this.browser;
  }

  async verifyReady(): Promise<void> {
    const browser = await this.getBrowser();
    const context = await browser.newContext();
    await context.close();
  }

  async close(): Promise<void> {
    if (this.browser?.isConnected()) {
      await this.browser.close();
    }

    this.browser = null;
  }
}

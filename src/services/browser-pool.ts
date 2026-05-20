import type { Browser } from "playwright";
import { chromium } from "playwright";

export class BrowserPool {
  private browser: Browser | null = null;

  constructor(private readonly headless: boolean) {}

  async getBrowser(): Promise<Browser> {
    if (!this.browser?.isConnected()) {
      this.browser = await chromium.launch({ headless: this.headless });
    }

    return this.browser;
  }

  async close(): Promise<void> {
    if (this.browser?.isConnected()) {
      await this.browser.close();
    }

    this.browser = null;
  }
}

import type { Config } from "../config/env.js";
import {
  computeScore,
  runAxeScan,
  withScanBudget,
} from "../lib/scanner/index.js";
import { assertUrlResolvedSafely } from "../lib/scanner/url-security.js";
import {
  normalizeUrl,
  parseAndValidateUrl,
} from "../lib/scanner/url.js";
import type { ScanRequest, ScanResponse } from "../types/index.js";
import { BrowserPool } from "./browser-pool.js";
import { ScanSemaphore } from "./concurrency.js";

export interface Scanner {
  scan(request: ScanRequest, scanId?: string): Promise<ScanResponse>;
  close(): Promise<void>;
}

export class PlaywrightScanner implements Scanner {
  private readonly browserPool: BrowserPool;
  private readonly semaphore: ScanSemaphore;

  constructor(private readonly config: Config) {
    this.browserPool = new BrowserPool(config.playwright.headless);
    this.semaphore = new ScanSemaphore(config.maxConcurrentScans);
  }

  async scan(request: ScanRequest, scanId?: string): Promise<ScanResponse> {
    const parsed = parseAndValidateUrl(request.url);
    await assertUrlResolvedSafely(parsed);
    const url = normalizeUrl(parsed);
    const budgetMs = request.options?.timeout ?? this.config.scanTimeoutMs;
    const includeScreenshot = request.options?.includeScreenshot ?? false;

    return this.semaphore.run(async () => {
      const browser = await this.browserPool.getBrowser();
      const result = await withScanBudget(budgetMs, () =>
        runAxeScan(url, { browser, scanId, includeScreenshot }),
      );

      return {
        ...result,
        score: computeScore(result),
        timestamp: new Date().toISOString(),
      };
    });
  }

  async close(): Promise<void> {
    await this.browserPool.close();
  }
}

let scannerInstance: PlaywrightScanner | null = null;

export function getScanner(config: Config): PlaywrightScanner {
  if (!scannerInstance) {
    scannerInstance = new PlaywrightScanner(config);
  }
  return scannerInstance;
}

export async function closeScanner(): Promise<void> {
  if (scannerInstance) {
    await scannerInstance.close();
    scannerInstance = null;
  }
}

export function resetScannerForTests(): void {
  scannerInstance = null;
}

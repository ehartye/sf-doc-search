import { chromium, type Browser, type Page } from "playwright";

export interface BrowserOptions {
  debug?: boolean;
}

export interface LaunchConfig {
  headless: boolean;
  channel?: string;
}

export function resolveLaunch(opts: BrowserOptions): LaunchConfig {
  return { headless: !opts.debug, channel: "chrome" };
}

const DEV_DOCS_WARMUP = "https://developer.salesforce.com/docs";

export class BrowserManager {
  private browser?: Browser;
  private warmedHosts = new Set<string>();
  constructor(private opts: BrowserOptions = {}) {}

  private async launch(): Promise<Browser> {
    if (this.browser) return this.browser;
    const cfg = resolveLaunch(this.opts);
    try {
      this.browser = await chromium.launch({ headless: cfg.headless, channel: cfg.channel });
    } catch {
      // No system Chrome — fall back to Playwright's bundled Chromium.
      this.browser = await chromium.launch({ headless: cfg.headless });
    }
    return this.browser;
  }

  private async page(): Promise<Page> {
    const browser = await this.launch();
    const ctx = await browser.newContext({ userAgent: undefined });
    return ctx.newPage();
  }

  /** Warm a host once so Akamai cookies are present, then fetch JSON from page context. */
  async fetchJsonInPage(url: string): Promise<any> {
    const page = await this.page();
    try {
      const host = new URL(url).origin;
      if (!this.warmedHosts.has(host)) {
        await page.goto(DEV_DOCS_WARMUP, { waitUntil: "domcontentloaded", timeout: 45_000 });
        this.warmedHosts.add(host);
      }
      return await page.evaluate(async (u) => {
        const res = await fetch(u, { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
        return res.json();
      }, url);
    } finally {
      await page.context().close();
    }
  }

  /** Navigate to a page, wait for a selector, and return the matched element's HTML. */
  async renderAndExtract(url: string, selector: string, timeoutMs = 30_000): Promise<{ html: string; title: string }> {
    const page = await this.page();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const loc = page.locator(selector).first();
      await loc.waitFor({ state: "attached", timeout: timeoutMs });
      const html = await loc.evaluate((el) => (el as HTMLElement).innerHTML);
      const title = await page.title();
      return { html, title };
    } finally {
      await page.context().close();
    }
  }

  /** Full-page HTML for readability/generic fallback. */
  async renderFull(url: string, timeoutMs = 30_000): Promise<{ html: string; title: string }> {
    const page = await this.page();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      const html = await page.content();
      const title = await page.title();
      return { html, title };
    } finally {
      await page.context().close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
  }
}

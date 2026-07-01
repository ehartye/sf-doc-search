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

  /** POST JSON from inside a warmed page context. */
  async postJsonInPage(url: string, body: unknown): Promise<any> {
    const page = await this.page();
    try {
      // Warm a real Salesforce origin so the cross-origin POST isn't fired from an opaque about:blank origin.
      await page.goto("https://help.salesforce.com/s/", { waitUntil: "domcontentloaded", timeout: 45_000 });
      return await page.evaluate(async ({ u, b }) => {
        const res = await fetch(u, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(b),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
        return res.json();
      }, { u: url, b: body });
    } finally {
      await page.context().close();
    }
  }

  /** Load the Help search page and capture the anonymous Coveo access_token from its requests. */
  async captureCoveoToken(searchPageUrl: string): Promise<string> {
    const page = await this.page();
    let token: string | undefined;
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("coveo") && url.includes("access_token=")) {
        token = new URL(url).searchParams.get("access_token") ?? token;
      }
    });
    try {
      try {
        await page.goto(searchPageUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      } catch {
        // Navigation-settle can hang on Salesforce background XHR; tolerate it if we still capture a token below.
      }
      if (!token) {
        const box = page.locator('input[type="search"], input[placeholder*="Search"]').first();
        if (await box.count()) {
          await box.fill("sharing");
          await box.press("Enter");
        }
      }
      // Poll up to ~10s for the token-bearing Coveo request to fire.
      for (let i = 0; i < 20 && !token; i++) await page.waitForTimeout(500);
      if (!token) throw new Error("Could not capture Coveo token");
      return token;
    } finally {
      await page.context().close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
  }
}

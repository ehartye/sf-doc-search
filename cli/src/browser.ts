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

  /**
   * Load the Help search page and capture the anonymous Coveo JWT. The token is
   * returned in the RESPONSE BODY of the Aura action `Search_CoveoTokenGenerator.getToken`
   * (an outer `{actions:[{returnValue}]}` envelope whose `returnValue` is a JSON string
   * containing `{ platformUri, token }`), not in any request URL.
   */
  async captureCoveoToken(searchPageUrl: string): Promise<string> {
    const page = await this.page();
    let token: string | undefined;
    page.on("response", async (res) => {
      if (token || !res.url().includes("Search_CoveoTokenGenerator.getToken")) return;
      try {
        const outer = JSON.parse(await res.text());
        const rv = outer?.actions?.[0]?.returnValue;
        const inner = typeof rv === "string" ? JSON.parse(rv) : rv;
        if (inner?.token) token = inner.token as string;
      } catch {
        // Non-JSON or unexpected shape — keep waiting.
      }
    });
    try {
      try {
        await page.goto(searchPageUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      } catch {
        // Navigation-settle can hang on Salesforce background XHR; tolerate it if we still capture a token below.
      }
      // Let the Coveo search component bootstrap before interacting, otherwise the
      // Enter keypress fires before its handler is attached and no token is generated.
      await page.waitForTimeout(4000);
      // Trigger a search so the token generator runs (it may also fire on load).
      // The page has multiple search inputs; pick the first VISIBLE one. Tolerate
      // failure — the token can also be generated during page bootstrap.
      try {
        const boxes = page.locator('input#search-field, input[type="search"], input[placeholder*="Search" i]');
        const n = await boxes.count();
        for (let i = 0; i < n; i++) {
          const b = boxes.nth(i);
          if (await b.isVisible().catch(() => false)) {
            await b.fill("sharing");
            await b.press("Enter");
            break;
          }
        }
      } catch {
        // Interaction failed; keep polling in case the token fired on load.
      }
      // Poll up to ~15s for the token-bearing Aura response to arrive.
      for (let i = 0; i < 30 && !token; i++) await page.waitForTimeout(500);
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

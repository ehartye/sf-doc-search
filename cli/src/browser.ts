import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

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
  private ctx?: BrowserContext;
  private docsPage?: Page; // persistent page parked on DEV_DOCS_WARMUP for evaluate-fetches
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

  /** One context for the manager's lifetime — Akamai cookies persist across calls. */
  private async context(): Promise<BrowserContext> {
    if (this.ctx) return this.ctx;
    const browser = await this.launch();
    this.ctx = await browser.newContext({ userAgent: undefined });
    return this.ctx;
  }

  private async page(): Promise<Page> {
    return (await this.context()).newPage();
  }

  /** Persistent page navigated once to the docs origin. Evaluate-fetches run from it:
   *  same-origin to developer.salesforce.com, cookies live in the shared context, and
   *  no repeat warmup navigation. (A fresh page would sit on about:blank and its
   *  fetch() would be cross-origin — that's why this page persists.)
   *  Assigned only AFTER a successful warmup so a failed goto never poisons the slot;
   *  callers are sequential (one CLI command per process) — lazy init is not
   *  concurrency-safe and doesn't need to be. */
  private async docs(): Promise<Page> {
    if (this.docsPage && !this.docsPage.isClosed()) return this.docsPage;
    const page = await this.page();
    try {
      await page.goto(DEV_DOCS_WARMUP, { waitUntil: "domcontentloaded", timeout: 45_000 });
    } catch (err) {
      await page.close().catch(() => {});
      throw err;
    }
    this.docsPage = page;
    return page;
  }

  /** Attempt to launch the browser (system Chrome or bundled Chromium) and report success. */
  async probe(): Promise<{ ok: boolean; detail: string }> {
    try {
      const browser = await this.launch();
      const detail = `Chromium ${browser.version()}`;
      await this.close();
      return { ok: true, detail };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  /** Fetch JSON from the persistent docs page's context (Akamai warmed once per process). */
  async fetchJsonInPage(url: string): Promise<any> {
    const page = await this.docs();
    return page.evaluate(async (u) => {
      const res = await fetch(u, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
      return res.json();
    }, url);
  }

  /** Fetch raw response text from the persistent docs page's context. */
  async fetchTextInPage(url: string): Promise<string> {
    const page = await this.docs();
    return page.evaluate(async (u) => {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
      return res.text();
    }, url);
  }

  /** Navigate to a page, wait for a selector, and return the matched element's HTML. */
  async renderAndExtract(url: string, selector: string, timeoutMs = 30_000): Promise<{ html: string; title: string }> {
    const page = await this.page();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const loc = page.locator(selector).first();
      await loc.waitFor({ state: "attached", timeout: timeoutMs });
      // The container often attaches before its async content hydrates; poll until it
      // has meaningful text (up to ~12s) so we don't extract an empty shell.
      for (let i = 0; i < 24; i++) {
        const len = (await loc.innerText().catch(() => "")).trim().length;
        if (len > 150) break;
        await page.waitForTimeout(500);
      }
      const html = await loc.evaluate((el) => (el as HTMLElement).innerHTML);
      const title = await page.title();
      return { html, title };
    } finally {
      await page.close();
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
      await page.close();
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
      await page.close();
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
      await page.close();
    }
  }

  /**
   * Load a Knowledge Article page (help.salesforce.com articleView?type=1 — this is
   * also where Known Issues live) and capture its record from the Aura XHR response.
   * The article body never reaches the DOM in a stable, selector-addressable form (it's
   * assembled client-side from this same JSON), so this reads the source data directly
   * instead of rendering + extracting. Response shape: an outer `{actions:[{returnValue}]}`
   * envelope whose `returnValue.returnValue` is `{ type: "KBKnowledgeArticle", record: {...} }`.
   */
  async captureArticleRecord(url: string): Promise<Record<string, any>> {
    const page = await this.page();
    let record: Record<string, any> | undefined;
    page.on("response", async (res) => {
      if (record || !res.url().includes("/sfsites/aura")) return;
      try {
        const outer = JSON.parse(await res.text());
        for (const action of outer?.actions ?? []) {
          const rv = action?.returnValue?.returnValue;
          if (rv?.type === "KBKnowledgeArticle" && rv?.record) {
            record = rv.record;
            break;
          }
        }
      } catch {
        // Non-JSON, or not the action we're looking for — keep waiting.
      }
    });
    try {
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
      } catch {
        // networkidle can time out on background telemetry XHR; tolerate it if we
        // still captured the record below.
      }
      // Poll up to ~15s for the record-bearing Aura response to arrive.
      for (let i = 0; i < 30 && !record; i++) await page.waitForTimeout(500);
      if (!record) throw new Error(`Could not capture Knowledge Article record for ${url}`);
      return record;
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close(); // closes the context and all pages with it
    this.browser = undefined;
    this.ctx = undefined;
    this.docsPage = undefined;
  }
}

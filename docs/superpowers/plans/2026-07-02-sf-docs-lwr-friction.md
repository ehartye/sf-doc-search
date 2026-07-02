# sf-docs v0.4.0 — LWR First-Class + Friction Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use h-superpowers:subagent-driven-development, h-superpowers:team-driven-development, or h-superpowers:executing-plans to implement this plan (ask user which approach). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LWR docs platform (developer.salesforce.com/docs/&lt;area&gt;/&lt;guide&gt;) a first-class source with catalog/toc/fetch support, and fix guide-compilation friction: official-only search filtering, multi-URL fetch, complete provenance, help boilerplate stripping.

**Architecture:** New `cli/src/sources/lwr.ts` holds pure HTML parsers (catalog from `/docs/apis`, TOC from any guide page's SSR nav) plus browser-backed fetchers; `BrowserManager` gains `fetchTextInPage` (same Akamai-dodging page-context pattern as `fetchJsonInPage`). Engine dispatches the renamed `lwr` source to a dedicated fetcher and merges both platforms in `catalog`. Everything else is small, localized edits to coveo/markdown/help/index.

**Tech Stack:** TypeScript ESM, Playwright, Turndown, Commander v12, Vitest. Repo root `C:\Users\ehart\repos\sf-doc-search`; tests run from `cli/` (`cd cli && npx vitest run`). Windows — use Git Bash syntax.

---

## File Structure

- Modify `cli/src/types.ts` — rename Source variant `"atlas-lwr"` → `"lwr"`.
- Modify `cli/src/router.ts:76` — return `lwr`.
- Create `cli/src/sources/lwr.ts` — pure parsers (`parseLwrCatalog`, `parseLwrToc`, `cleanLwrTitle`) + fetchers (`fetchLwr`, `listLwrCatalog`, `fetchLwrToc`).
- Create `cli/test/sources/lwr.test.ts` — fixture-based parser tests + stub-browser fetcher tests.
- Modify `cli/src/browser.ts` — add `fetchTextInPage`.
- Modify `cli/src/coveo.ts` — `filterOfficial` + `allResults` param.
- Modify `cli/src/markdown.ts` — `> Retrieved: <date> via sf-docs (<source>)` header line.
- Modify `cli/src/sources/component.ts` — same retrieved-date line.
- Modify `cli/src/sources/help.ts` — `stripHelpBoilerplate` + version-from-release-param.
- Modify `cli/src/engine.ts` — `lwr` dispatch, catalog merge (+`platform` field, new cache key), toc dispatch, search `allResults`.
- Modify `cli/src/sources/atlas.ts` — `CatalogEntry` gains `platform`.
- Create `cli/src/batch.ts` — `fetchBatch` (multi-URL orchestration, testable without CLI).
- Create `cli/test/batch.test.ts`.
- Modify `cli/src/index.ts` — variadic `fetch`, `--all-results`, catalog platform column.
- Modify `cli/test/{router,coveo,markdown,engine,sources/help}.test.ts` — per task below.
- Modify `.claude/skills/sf-docs/SKILL.md` + mirror `.github/skills/sf-docs/SKILL.md`.
- Modify 6 version declarations → 0.4.0 (final task).

Branch: create `feat/lwr-first-class` off `main` before Task 1 (`git checkout -b feat/lwr-first-class`).

---

### Task 1: Rename source `atlas-lwr` → `lwr`

**Files:**
- Modify: `cli/src/types.ts:3`
- Modify: `cli/src/router.ts:76`
- Test: `cli/test/router.test.ts:7`

- [ ] **Step 1: Update the router test expectation (failing test)**

In `cli/test/router.test.ts` line 7, change:

```ts
    ["https://developer.salesforce.com/docs/platform/lwc/guide/intro.html", "atlas-lwr"],
```

to:

```ts
    ["https://developer.salesforce.com/docs/platform/lwc/guide/intro.html", "lwr"],
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd cli && npx vitest run test/router.test.ts`
Expected: FAIL — expected `"lwr"`, received `"atlas-lwr"`.

- [ ] **Step 3: Rename the variant**

`cli/src/types.ts` line 3:

```ts
  | "lwr"          // developer.salesforce.com LWR docs platform (server-rendered narrative docs)
```

`cli/src/router.ts` line 76:

```ts
    return { source: "lwr", url: trimmed };
```

`cli/src/engine.ts` line 40: change `case "atlas-lwr":` to `case "lwr":` (dispatch body unchanged for now; Task 4 gives it a real fetcher).

- [ ] **Step 4: Run the full suite**

Run: `cd cli && npx vitest run`
Expected: PASS (80 passed | 1 skipped). `grep -rn "atlas-lwr" cli/src cli/test` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add cli/src/types.ts cli/src/router.ts cli/src/engine.ts cli/test/router.test.ts
git commit -m "refactor: rename source atlas-lwr -> lwr (it is not Atlas)"
```

---

### Task 2: LWR pure parsers

**Files:**
- Create: `cli/src/sources/lwr.ts` (parsers only in this task)
- Test: `cli/test/sources/lwr.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `cli/test/sources/lwr.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseLwrCatalog, parseLwrToc, cleanLwrTitle } from "../../src/sources/lwr";

const CATALOG_FIXTURE = `
<html><body>
<a href="/docs/marketing/pardot/overview">Marketing Cloud Account Engagement</a>
<a href="/docs/marketing/pardot/guide">Guide</a>
<a href="/docs/commerce/commerce-api/overview">Commerce API</a>
<a href="/docs/ai/agentforce/overview"><span>Agentforce</span></a>
<a href="/docs/ai/agentforce/guide/agent-api.html">deep link ignored? no - same guide root</a>
<a href="/blogs/not-docs">nope</a>
<a href="/docs/onlyonesegment">nope</a>
</body></html>`;

const TOC_FIXTURE = `
<html><body>
<nav>
<a href="/docs/ai/agentforce/guide/agent-api.html">Agent API</a>
<a href="/docs/ai/agentforce/guide/agent-api-get-started.html"><b>Get Started</b></a>
<a href="/docs/ai/agentforce/guide/agent-api.html">Agent API (duplicate)</a>
<a href="/docs/ai/agentforce/references/agent-api?meta=summary">Reference (other section, kept out)</a>
<a href="/docs/einstein/genai/guide/other.html">other guide, kept out</a>
</nav>
</body></html>`;

describe("parseLwrCatalog", () => {
  it("extracts unique <area>/<guide> roots with anchor-text titles", () => {
    const entries = parseLwrCatalog(CATALOG_FIXTURE);
    const ids = entries.map((e) => e.id);
    expect(ids).toContain("marketing/pardot");
    expect(ids).toContain("commerce/commerce-api");
    expect(ids).toContain("ai/agentforce");
    // dedupe: pardot appears twice, agentforce twice
    expect(ids.filter((i) => i === "marketing/pardot")).toHaveLength(1);
    expect(ids.filter((i) => i === "ai/agentforce")).toHaveLength(1);
    // no non-docs, no single-segment
    expect(ids.some((i) => i.includes("blogs") || i === "onlyonesegment")).toBe(false);
    const pardot = entries.find((e) => e.id === "marketing/pardot")!;
    expect(pardot.title).toBe("Marketing Cloud Account Engagement");
    expect(pardot.url).toBe("https://developer.salesforce.com/docs/marketing/pardot");
  });
  it("returns [] on link-free HTML", () => {
    expect(parseLwrCatalog("<html><body>redesigned</body></html>")).toEqual([]);
  });
});

describe("parseLwrToc", () => {
  it("extracts deduped nav entries scoped to the guide path", () => {
    const toc = parseLwrToc(TOC_FIXTURE, "ai/agentforce/guide");
    expect(toc).toHaveLength(2);
    expect(toc[0]).toEqual({
      id: "/docs/ai/agentforce/guide/agent-api.html",
      text: "Agent API",
      href: "https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api.html",
    });
    // strips inner tags from anchor text
    expect(toc[1].text).toBe("Get Started");
    // out-of-guide links excluded
    expect(toc.some((t) => t.href?.includes("/references/") || t.href?.includes("einstein"))).toBe(false);
  });
});

describe("cleanLwrTitle", () => {
  it("strips the trailing developer-site suffix chain", () => {
    expect(
      cleanLwrTitle("Chat with Agents Using Agent API | Agentforce APIs and SDKs | Agentforce Developer Guide | Salesforce Developers"),
    ).toBe("Chat with Agents Using Agent API");
  });
  it("leaves titles without the suffix untouched", () => {
    expect(cleanLwrTitle("Plain Title")).toBe("Plain Title");
    expect(cleanLwrTitle("Uses | Pipes | Freely")).toBe("Uses | Pipes | Freely");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd cli && npx vitest run test/sources/lwr.test.ts`
Expected: FAIL — cannot resolve `../../src/sources/lwr`.

- [ ] **Step 3: Implement the parsers**

Create `cli/src/sources/lwr.ts`:

```ts
import type { TocEntry } from "./atlas";

export interface LwrCatalogEntry {
  id: string;    // "<area>/<guide>", e.g. "ai/agentforce"
  title: string; // anchor text of the first link seen for this guide
  url: string;   // https://developer.salesforce.com/docs/<area>/<guide>
}

const DEV_ORIGIN = "https://developer.salesforce.com";
const ANCHOR = /<a[^>]*href="(\/docs\/([a-z0-9-]+)\/([a-z0-9-]+)[^"#?]*)"[^>]*>([\s\S]*?)<\/a>/gi;

function anchorText(inner: string): string {
  return inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** Extract unique <area>/<guide> roots from the /docs/apis directory page's raw SSR HTML. */
export function parseLwrCatalog(html: string): LwrCatalogEntry[] {
  const seen = new Map<string, LwrCatalogEntry>();
  for (const m of html.matchAll(ANCHOR)) {
    const [, , area, guide, inner] = m;
    const id = `${area}/${guide}`;
    if (!seen.has(id)) {
      seen.set(id, { id, title: anchorText(inner) || id, url: `${DEV_ORIGIN}/docs/${id}` });
    }
  }
  return [...seen.values()];
}

/** Extract the guide nav (deduped by href) from any guide page's raw SSR HTML. */
export function parseLwrToc(html: string, guidePath: string): TocEntry[] {
  const re = new RegExp(`<a[^>]*href="(/docs/${guidePath}/[^"#?]*)"[^>]*>([\\s\\S]*?)</a>`, "gi");
  const seen = new Map<string, TocEntry>();
  for (const m of html.matchAll(re)) {
    const path = m[1];
    if (!seen.has(path)) seen.set(path, { id: path, text: anchorText(m[2]), href: `${DEV_ORIGIN}${path}` });
  }
  return [...seen.values()];
}

/** Strip the "<Section> | <Guide> | Salesforce Developers" suffix chain from a page title. */
export function cleanLwrTitle(title: string): string {
  if (!/\|\s*Salesforce Developers\s*$/i.test(title)) return title;
  return title.split("|")[0].trim() || title;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd cli && npx vitest run test/sources/lwr.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add cli/src/sources/lwr.ts cli/test/sources/lwr.test.ts
git commit -m "feat: pure LWR catalog/toc/title parsers"
```

---

### Task 3: `fetchTextInPage` + LWR fetchers

**Files:**
- Modify: `cli/src/browser.ts` (add method after `fetchJsonInPage`, ~line 70)
- Modify: `cli/src/sources/lwr.ts` (append fetchers)
- Test: `cli/test/sources/lwr.test.ts` (append)

- [ ] **Step 1: Write failing fetcher tests (stub browser, matching the pattern in `cli/test/sources/help.test.ts`)**

Append to `cli/test/sources/lwr.test.ts`:

```ts
import { fetchLwr, listLwrCatalog, fetchLwrToc } from "../../src/sources/lwr";

const CATALOG_URL = "https://developer.salesforce.com/docs/apis";

describe("fetchLwr", () => {
  it("renders, cleans the title, and stamps lwr provenance", async () => {
    const browser = {
      renderAndExtract: async () => ({
        html: "<p>Agent API lets you chat with agents.</p>",
        title: "Chat with Agents | Agentforce Developer Guide | Salesforce Developers",
      }),
    } as any;
    const doc = await fetchLwr(browser, "https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api.html");
    expect(doc.source).toBe("lwr");
    expect(doc.title).toBe("Chat with Agents");
    expect(doc.version).toBe("current (unversioned platform)");
    expect(doc.markdown).toContain("> Retrieved via sf-docs (lwr)");
  });
});

describe("listLwrCatalog", () => {
  it("fetches /docs/apis and parses entries", async () => {
    const browser = {
      fetchTextInPage: async (u: string) => {
        expect(u).toBe(CATALOG_URL);
        return '<a href="/docs/ai/agentforce/overview">Agentforce</a>';
      },
    } as any;
    const entries = await listLwrCatalog(browser);
    expect(entries).toEqual([
      { id: "ai/agentforce", title: "Agentforce", url: "https://developer.salesforce.com/docs/ai/agentforce" },
    ]);
  });
  it("throws (not empty) when the page parses to zero entries", async () => {
    const browser = { fetchTextInPage: async () => "<html>redesigned</html>" } as any;
    await expect(listLwrCatalog(browser)).rejects.toThrow(/docs\/apis/);
  });
});

describe("fetchLwrToc", () => {
  it("accepts an <area>/<guide> shorthand", async () => {
    const browser = {
      fetchTextInPage: async (u: string) => {
        expect(u).toBe("https://developer.salesforce.com/docs/ai/agentforce/guide");
        return '<a href="/docs/ai/agentforce/guide/x.html">X</a>';
      },
    } as any;
    const toc = await fetchLwrToc(browser, "ai/agentforce/guide");
    expect(toc[0].text).toBe("X");
  });
  it("accepts a full URL and scopes to its guide path", async () => {
    const browser = {
      fetchTextInPage: async () =>
        '<a href="/docs/ai/agentforce/guide/x.html">X</a><a href="/docs/other/guide/y.html">Y</a>',
    } as any;
    const toc = await fetchLwrToc(browser, "https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api.html");
    expect(toc).toHaveLength(1);
  });
  it("throws when the nav parses to zero entries", async () => {
    const browser = { fetchTextInPage: async () => "<html></html>" } as any;
    await expect(fetchLwrToc(browser, "ai/agentforce/guide")).rejects.toThrow(/--debug/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd cli && npx vitest run test/sources/lwr.test.ts`
Expected: FAIL — `fetchLwr` etc. not exported.

- [ ] **Step 3: Implement**

Add to `cli/src/browser.ts` directly after `fetchJsonInPage` (same warmup pattern):

```ts
  /** Warm the host once (Akamai), then fetch raw response text from page context. */
  async fetchTextInPage(url: string): Promise<string> {
    const page = await this.page();
    try {
      const host = new URL(url).origin;
      if (!this.warmedHosts.has(host)) {
        await page.goto(DEV_DOCS_WARMUP, { waitUntil: "domcontentloaded", timeout: 45_000 });
        this.warmedHosts.add(host);
      }
      return await page.evaluate(async (u) => {
        const res = await fetch(u);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
        return res.text();
      }, url);
    } finally {
      await page.context().close();
    }
  }
```

Append to `cli/src/sources/lwr.ts` (new imports at top of file):

```ts
import type { BrowserManager } from "../browser";
import type { DocResult } from "../types";
import { htmlToMarkdown } from "../markdown";
```

```ts
export const LWR_SELECTOR = "main, [data-content], article";
const LWR_VERSION = "current (unversioned platform)";
const CATALOG_URL = `${DEV_ORIGIN}/docs/apis`;

export async function fetchLwr(browser: BrowserManager, url: string): Promise<DocResult> {
  let html: string;
  let title: string;
  try {
    const r = await browser.renderAndExtract(url, LWR_SELECTOR);
    html = r.html;
    title = r.title;
  } catch {
    const r = await browser.renderFull(url);
    html = r.html;
    title = r.title;
  }
  const cleanTitle = cleanLwrTitle(title);
  return {
    title: cleanTitle,
    url,
    source: "lwr",
    version: LWR_VERSION,
    html,
    markdown: htmlToMarkdown(html, { title: cleanTitle, url, source: "lwr", version: LWR_VERSION }),
  };
}

export async function listLwrCatalog(browser: BrowserManager): Promise<LwrCatalogEntry[]> {
  const entries = parseLwrCatalog(await browser.fetchTextInPage(CATALOG_URL));
  if (entries.length === 0) {
    throw new Error(`No guides parsed from ${CATALOG_URL} — the page may have changed; retry with --debug`);
  }
  return entries;
}

/** target: "<area>/<guide>" shorthand or a full /docs/... URL. */
export async function fetchLwrToc(browser: BrowserManager, target: string): Promise<TocEntry[]> {
  let guidePath: string;
  let url: string;
  if (/^https?:\/\//i.test(target)) {
    const u = new URL(target);
    const segs = u.pathname.split("/").filter(Boolean); // [docs, area, guide, section?, page.html?]
    guidePath = segs.slice(1, 4).join("/"); // area/guide/section (e.g. ai/agentforce/guide)
    url = target;
  } else {
    guidePath = target.replace(/^\/+|\/+$/g, "");
    url = `${DEV_ORIGIN}/docs/${guidePath}`;
  }
  const toc = parseLwrToc(await browser.fetchTextInPage(url), guidePath);
  if (toc.length === 0) {
    throw new Error(`No TOC links parsed from ${url} (scope /docs/${guidePath}/) — try a page URL inside the guide, or --debug`);
  }
  return toc;
}
```

Note the URL branch scopes to THREE path segments after `/docs` (`ai/agentforce/guide`) while the shorthand uses the given path verbatim — both match how nav hrefs nest one level deeper than the scope.

- [ ] **Step 4: Run to verify pass, then the full suite**

Run: `cd cli && npx vitest run test/sources/lwr.test.ts` → PASS (11 tests)
Run: `cd cli && npx vitest run` → PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add cli/src/browser.ts cli/src/sources/lwr.ts cli/test/sources/lwr.test.ts
git commit -m "feat: LWR fetcher, catalog, and toc via raw SSR HTML in page context"
```

---

### Task 4: Engine wiring — lwr dispatch, merged catalog, toc dispatch

**Files:**
- Modify: `cli/src/engine.ts`
- Modify: `cli/src/sources/atlas.ts:48,54-58` (CatalogEntry platform)
- Modify: `cli/src/index.ts:73` (catalog text output)
- Test: `cli/test/engine.test.ts` (append)

- [ ] **Step 1: Write failing engine tests**

Append to `cli/test/engine.test.ts` (match the file's existing stub-browser style — read its first test for the constructor pattern; Engine takes `(browser, cacheOpts)`, pass `{ enabled: false }`):

```ts
describe("lwr integration", () => {
  it("fetch dispatches lwr URLs to the lwr fetcher (provenance says lwr)", async () => {
    const browser = {
      renderAndExtract: async () => ({ html: "<p>Some LWR doc body text.</p>", title: "T | G | Salesforce Developers" }),
    } as any;
    const engine = new Engine(browser, { enabled: false });
    const doc = await engine.fetch("https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api.html");
    expect(doc.source).toBe("lwr");
    expect(doc.markdown).toContain("(lwr)");
  });

  it("catalog merges atlas and lwr entries with platform tags", async () => {
    const browser = {
      fetchJsonInPage: async () => ({
        content: [{ id: "atlas.en-us.262.0.apexcode.meta", key: "en-us", value: { deliverable: "apexcode", title: "Apex Developer Guide" } }],
      }),
      fetchTextInPage: async () => '<a href="/docs/ai/agentforce/overview">Agentforce</a>',
    } as any;
    const engine = new Engine(browser, { enabled: false });
    const all = await engine.catalog();
    expect(all).toContainEqual({ deliverable: "apexcode", title: "Apex Developer Guide", longId: "atlas.en-us.262.0.apexcode.meta", platform: "atlas" });
    expect(all).toContainEqual({ deliverable: "ai/agentforce", title: "Agentforce", longId: "https://developer.salesforce.com/docs/ai/agentforce", platform: "lwr" });
    // grep spans both platforms
    expect(await engine.catalog("agentforce")).toHaveLength(1);
  });

  it("toc dispatches slash-targets to lwr and bare words to atlas", async () => {
    const browser = {
      fetchTextInPage: async () => '<a href="/docs/ai/agentforce/guide/x.html">X</a>',
      fetchJsonInPage: async () => ({ title: "Apex", toc: [{ id: "n1", text: "Intro", a_attr: { href: "intro.htm" } }] }),
    } as any;
    const engine = new Engine(browser, { enabled: false });
    expect((await engine.toc("ai/agentforce/guide"))[0].text).toBe("X");
    expect((await engine.toc("apexcode"))[0].text).toBe("Intro");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd cli && npx vitest run test/engine.test.ts`
Expected: FAIL — lwr fetch still routed through fetchTrailhead (its stub call shape differs / platform fields missing / toc slash dispatch missing).

- [ ] **Step 3: Implement**

`cli/src/sources/atlas.ts` — line 48 and the mapper:

```ts
export interface CatalogEntry { deliverable: string; title: string; longId: string; platform: "atlas" | "lwr"; }
```

```ts
  return (idx.content ?? []).map((c: any) => ({
    deliverable: c.value?.deliverable ?? c.id,
    title: c.value?.title ?? "",
    longId: c.id,
    platform: "atlas" as const,
  }));
```

`cli/src/engine.ts`:

- Import: `import { fetchLwr, listLwrCatalog, fetchLwrToc } from "./sources/lwr";`
- Replace the `case "lwr": / case "generic":` block (lines 40–44) with:

```ts
      case "lwr":
        result = await fetchLwr(this.browser, r.url);
        break;
      case "generic":
        result = await fetchTrailhead(this.browser, r.url); // render+extract is the same shape
        result = { ...result, source: r.source };
        break;
```

- Replace `catalog()` (note the cache key bump — old cached entries lack `platform`):

```ts
  async catalog(grep?: string): Promise<CatalogEntry[]> {
    const key = "catalog:v2";
    let all = this.cache.get<CatalogEntry[]>(key);
    if (!all) {
      const atlas = await listCatalog(this.browser);
      const lwr = (await listLwrCatalog(this.browser)).map((e) => ({
        deliverable: e.id,
        title: e.title,
        longId: e.url,
        platform: "lwr" as const,
      }));
      all = [...atlas, ...lwr];
      this.cache.set(key, all);
    }
    if (!grep) return all;
    const q = grep.toLowerCase();
    return all.filter((c) => c.deliverable.toLowerCase().includes(q) || c.title.toLowerCase().includes(q));
  }
```

- Replace `toc()`:

```ts
  async toc(target: string): Promise<TocEntry[]> {
    if (target.includes("/")) return fetchLwrToc(this.browser, target);
    return fetchToc(this.browser, target);
  }
```

`cli/src/index.ts` line 73 (catalog text output gains the platform column) — change to:

```ts
      else for (const e of entries) console.log(`${e.deliverable}\t${e.platform}\t${e.title}`);
```

Also update the `toc` command description (line 78-79) to:

```ts
  .command("toc <target>")
  .description("Table of contents: an Atlas deliverable (apexcode) or an LWR guide (ai/agentforce/guide)")
  .action(async (target: string) => {
```

and rename the action's parameter usage accordingly (`engine.toc(target)`).

- [ ] **Step 4: Run the full suite**

Run: `cd cli && npx vitest run`
Expected: PASS. (If `test/sources/atlas.test.ts` asserts catalog entry shapes, add `platform: "atlas"` to its expected objects.)

- [ ] **Step 5: Commit**

```bash
git add cli/src/engine.ts cli/src/sources/atlas.ts cli/src/index.ts cli/test/engine.test.ts cli/test/sources/atlas.test.ts
git commit -m "feat: engine wiring for lwr — dispatch, merged catalog, toc"
```

---

### Task 5: Official-only search filter

**Files:**
- Modify: `cli/src/coveo.ts`
- Modify: `cli/src/engine.ts` (search signature)
- Modify: `cli/src/index.ts` (search command flag)
- Test: `cli/test/coveo.test.ts` (append)

- [ ] **Step 1: Write failing filter tests**

Append to `cli/test/coveo.test.ts`:

```ts
import { filterOfficial } from "../src/coveo";

describe("filterOfficial", () => {
  const mk = (url: string) => ({ title: "t", url, excerpt: "e" });
  it("keeps only the three official domains", () => {
    const kept = filterOfficial([
      mk("https://help.salesforce.com/Help_DocContent?id=ai.x&language=en_us&release=262.0.0"),
      mk("https://orgcs.my.salesforce.com/kA0Hx000000jLDB"),
      mk("https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api.html"),
      mk("https://trailhead.salesforce.com/content/learn/modules/x"),
      mk("not a url"),
    ]);
    expect(kept.map((r) => new URL(r.url).hostname)).toEqual([
      "help.salesforce.com",
      "developer.salesforce.com",
      "trailhead.salesforce.com",
    ]);
  });
  it("drops non-English localized variants but keeps unmarked URLs", () => {
    const kept = filterOfficial([
      mk("https://help.salesforce.com/Help_DocContent?id=x&language=da_dk&release=262.0.0"),
      mk("https://help.salesforce.com/Help_DocContent?id=x&language=en_US&release=262.0.0"),
      mk("https://help.salesforce.com/s/articleView?id=y.htm"),
    ]);
    expect(kept).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd cli && npx vitest run test/coveo.test.ts`
Expected: FAIL — `filterOfficial` not exported.

- [ ] **Step 3: Implement**

Add to `cli/src/coveo.ts` (after `parseCoveoResults`):

```ts
const OFFICIAL_HOSTS = new Set(["help.salesforce.com", "developer.salesforce.com", "trailhead.salesforce.com"]);

/** Keep only official-domain, English results (guide-compilation default). */
export function filterOfficial(results: CoveoResult[]): CoveoResult[] {
  return results.filter((r) => {
    try {
      const u = new URL(r.url);
      if (!OFFICIAL_HOSTS.has(u.hostname.toLowerCase())) return false;
      const lang = u.searchParams.get("language");
      return !lang || lang.toLowerCase() === "en_us";
    } catch {
      return false;
    }
  });
}
```

Change `coveoSearch`'s signature and last line:

```ts
export async function coveoSearch(
  browser: BrowserManager,
  query: string,
  source: CoveoSource,
  numberOfResults = 10,
  allResults = false,
): Promise<CoveoResult[]> {
```

```ts
  const results = parseCoveoResults(raw);
  return allResults ? results : filterOfficial(results);
```

`cli/src/engine.ts` — search passes it through:

```ts
  async search(query: string, source: CoveoSource, allResults = false): Promise<CoveoResult[]> {
    return coveoSearch(this.browser, query, source, 10, allResults);
  }
```

`cli/src/index.ts` — the search command gains the flag:

```ts
program
  .command("search <query>")
  .description("Search Salesforce Help or release notes (Coveo; official domains + English by default)")
  .requiredOption("--source <source>", "help | release")
  .option("--all-results", "include non-official domains and localized variants", false)
  .action(async (query: string, cmdOpts: { source: "help" | "release"; allResults?: boolean }) => {
    const opts = program.opts<GlobalOpts>();
    await run(async (engine) => {
      const results = await engine.search(query, cmdOpts.source, cmdOpts.allResults);
      if (opts.format === "json") console.log(JSON.stringify(results, null, 2));
      else for (const r of results) console.log(`${r.url}\n  ${r.title}\n  ${r.excerpt}\n`);
    }, opts);
  });
```

- [ ] **Step 4: Run the full suite** — `cd cli && npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/coveo.ts cli/src/engine.ts cli/src/index.ts cli/test/coveo.test.ts
git commit -m "feat: search filters to official domains + English by default (--all-results to disable)"
```

---

### Task 6: Multi-URL fetch

**Files:**
- Create: `cli/src/batch.ts`
- Create: `cli/test/batch.test.ts`
- Modify: `cli/src/index.ts` (fetch command)

- [ ] **Step 1: Write failing batch tests**

Create `cli/test/batch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fetchBatch } from "../src/batch";
import type { DocResult } from "../src/types";

const doc = (n: string): DocResult =>
  ({ title: n, url: `https://x/${n}`, source: "lwr", html: `<p>${n}</p>`, markdown: `# ${n}` }) as DocResult;

const engine = {
  fetch: async (u: string) => {
    if (u.includes("bad")) throw new Error("boom");
    return doc(u.split("/").pop()!);
  },
};

describe("fetchBatch", () => {
  it("single URL md output is the bare document (back-compat)", async () => {
    const r = await fetchBatch(engine, ["https://x/a"], "md");
    expect(r.output).toBe("# a");
    expect(r.failures).toEqual([]);
  });
  it("joins multiple md docs with a --- separator line", async () => {
    const r = await fetchBatch(engine, ["https://x/a", "https://x/b"], "md");
    expect(r.output).toBe("# a\n---\n# b");
  });
  it("json: single object for one URL, array for many", async () => {
    const one = await fetchBatch(engine, ["https://x/a"], "json");
    expect(JSON.parse(one.output).title).toBe("a");
    const many = await fetchBatch(engine, ["https://x/a", "https://x/b"], "json");
    expect(JSON.parse(many.output).map((d: DocResult) => d.title)).toEqual(["a", "b"]);
  });
  it("continues past a failed URL and reports it", async () => {
    const r = await fetchBatch(engine, ["https://x/a", "https://x/bad", "https://x/c"], "md");
    expect(r.output).toBe("# a\n---\n# c");
    expect(r.failures).toEqual(["https://x/bad: boom"]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd cli && npx vitest run test/batch.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

Create `cli/src/batch.ts`:

```ts
import type { DocResult } from "./types";
import { formatDoc, type Format } from "./format";

export interface BatchResult { output: string; failures: string[]; }

/** Fetch each URL sequentially over the caller's engine; never abort the batch on one failure. */
export async function fetchBatch(
  engine: { fetch(url: string): Promise<DocResult> },
  urls: string[],
  format: Format,
): Promise<BatchResult> {
  const docs: DocResult[] = [];
  const failures: string[] = [];
  for (const url of urls) {
    try {
      docs.push(await engine.fetch(url));
    } catch (err) {
      failures.push(`${url}: ${(err as Error).message}`);
    }
  }
  const output =
    format === "json"
      ? JSON.stringify(urls.length === 1 ? (docs[0] ?? null) : docs, null, 2)
      : docs.map((d) => formatDoc(d, format)).join("\n---\n");
  return { output, failures };
}
```

Replace the `fetch` command in `cli/src/index.ts` (add `import { fetchBatch } from "./batch";` at top):

```ts
program
  .command("fetch <urls...>")
  .description("Fetch one or more Salesforce doc pages as clean Markdown (multiple URLs share one browser)")
  .action(async (urls: string[]) => {
    const opts = program.opts<GlobalOpts>();
    await run(async (engine) => {
      const { output, failures } = await fetchBatch(engine, urls, opts.format);
      console.log(output);
      for (const f of failures) console.error(`sf-docs error: ${f}`);
      if (failures.length > 0) process.exitCode = 1;
    }, opts);
  });
```

- [ ] **Step 4: Run the full suite** — `cd cli && npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/batch.ts cli/test/batch.test.ts cli/src/index.ts
git commit -m "feat: variadic fetch — multiple URLs over one shared browser"
```

---

### Task 7: Provenance — retrieved date + help version

**Files:**
- Modify: `cli/src/markdown.ts:36-56`
- Modify: `cli/src/sources/component.ts:18`
- Modify: `cli/src/sources/help.ts`
- Test: `cli/test/markdown.test.ts`, `cli/test/sources/help.test.ts` (append)

- [ ] **Step 1: Write failing tests**

Append to `cli/test/markdown.test.ts`:

```ts
it("stamps a retrieved date in the provenance header", () => {
  const md = htmlToMarkdown("<p>x</p>", { title: "T", url: "https://u", source: "atlas", version: "262.0", retrieved: "2026-07-02" });
  expect(md).toContain("> Retrieved: 2026-07-02 via sf-docs (atlas)");
});

it("defaults the retrieved date to today (ISO)", () => {
  const md = htmlToMarkdown("<p>x</p>", { title: "T", url: "https://u", source: "help" });
  expect(md).toMatch(/> Retrieved: \d{4}-\d{2}-\d{2} via sf-docs \(help\)/);
});
```

Append to `cli/test/sources/help.test.ts` (its stub-browser pattern: an object with `renderAndExtract`):

```ts
it("records the release from the articleView URL as the doc version", async () => {
  const browser = { renderAndExtract: async () => ({ html: "<p>Body text.</p>", title: "T | Salesforce" }) } as any;
  const doc = await fetchHelp(
    browser,
    "https://help.salesforce.com/s/articleView?id=ai.x.htm&type=5&language=en_US&release=262.0.0",
    "help",
  );
  expect(doc.version).toBe("262.0.0");
  expect(doc.markdown).toContain("> Version: 262.0.0");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd cli && npx vitest run test/markdown.test.ts test/sources/help.test.ts`
Expected: FAIL — `retrieved` unknown / no Retrieved line / version undefined.

- [ ] **Step 3: Implement**

`cli/src/markdown.ts` — extend `DocMeta` and the header:

```ts
export interface DocMeta {
  title: string;
  url: string;
  source: Source;
  version?: string;
  retrieved?: string; // ISO date; defaults to today (UTC)
}
```

```ts
export function htmlToMarkdown(html: string, meta: DocMeta): string {
  const body = td.turndown(html).trim();
  const retrieved = meta.retrieved ?? new Date().toISOString().slice(0, 10);
  const header = [
    `# ${meta.title}`,
    "",
    `> Source: ${meta.url}`,
    meta.version ? `> Version: ${meta.version}` : undefined,
    `> Retrieved: ${retrieved} via sf-docs (${meta.source})`,
    "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
  return `${header}\n${body}\n`;
}
```

`cli/src/sources/component.ts` line 18 — replace with:

```ts
    `> Retrieved: ${new Date().toISOString().slice(0, 10)} via sf-docs (component)`,
```

`cli/src/sources/help.ts` — parse the release and thread it through (inside `fetchHelp`, before the return):

```ts
  let version: string | undefined;
  try {
    version = new URL(url).searchParams.get("release") ?? undefined;
  } catch {
    version = undefined;
  }
```

and the return becomes:

```ts
  return {
    title: cleanTitle,
    url,
    source,
    version,
    html,
    markdown: htmlToMarkdown(html, { title: cleanTitle, url, source, version }),
  };
```

Note: Task 3's `fetchLwr` test asserted the pre-Task-7 header line `"> Retrieved via sf-docs (lwr)"`. Update that assertion now to:

```ts
    expect(doc.markdown).toMatch(/> Retrieved: \d{4}-\d{2}-\d{2} via sf-docs \(lwr\)/);
```

- [ ] **Step 4: Run the full suite** — `cd cli && npx vitest run` → PASS (fix any other tests asserting the old `> Retrieved via` literal the same way).

- [ ] **Step 5: Commit**

```bash
git add cli/src/markdown.ts cli/src/sources/component.ts cli/src/sources/help.ts cli/test/markdown.test.ts cli/test/sources/help.test.ts cli/test/sources/lwr.test.ts
git commit -m "feat: provenance carries retrieved date; help pages carry release version"
```

---

### Task 8: Help boilerplate strip

**Files:**
- Modify: `cli/src/sources/help.ts`
- Test: `cli/test/sources/help.test.ts` (append)

- [ ] **Step 1: Write failing tests**

Append to `cli/test/sources/help.test.ts`:

```ts
import { stripHelpBoilerplate } from "../../src/sources/help";

describe("stripHelpBoilerplate", () => {
  it("removes breadcrumbs, editions/permissions tables, headings, and note icons", () => {
    const html = `
      <div>You are here: <ol><li><a href="/">Salesforce Help</a></li><li>Docs</li></ol></div>
      <h3>Required Editions</h3>
      <table><tr><td>Available in: Lightning Experience</td></tr></table>
      <table><tr><th>User Permissions Needed</th></tr><tr><td>To create: X</td></tr></table>
      <img src="https://cdn/images/icon_note_important.png" alt="Important">
      <p>Real content stays.</p>
      <table><tr><th>Feature</th></tr><tr><td>Real table stays</td></tr></table>`;
    const out = stripHelpBoilerplate(html);
    expect(out).not.toContain("You are here");
    expect(out).not.toContain("Available in:");
    expect(out).not.toContain("User Permissions Needed");
    expect(out).not.toContain("Required Editions");
    expect(out).not.toContain("icon_note");
    expect(out).toContain("Real content stays.");
    expect(out).toContain("Real table stays");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd cli && npx vitest run test/sources/help.test.ts` → FAIL (not exported).

- [ ] **Step 3: Implement**

Add to `cli/src/sources/help.ts` and call it on the extracted html (`html = stripHelpBoilerplate(html);` right after the try/catch block that sets `html`):

```ts
/** Remove Help-article chrome that adds noise to Markdown: breadcrumbs,
 *  Required Editions / User Permissions tables, and note/warning/tip icons. */
export function stripHelpBoilerplate(html: string): string {
  return html
    .replace(/You are here:[\s\S]*?<\/ol>/gi, "")
    .replace(/<h\d[^>]*>\s*Required Editions[\s\S]*?<\/h\d>/gi, "")
    .replace(/<table[\s\S]*?<\/table>/gi, (t) =>
      /Available in:|User Permissions Needed|Required Editions/i.test(t) ? "" : t,
    )
    .replace(/<img[^>]*icon_note[^>]*>/gi, "");
}
```

- [ ] **Step 4: Run the full suite** — `cd cli && npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/sources/help.ts cli/test/sources/help.test.ts
git commit -m "feat: strip Help-article boilerplate before Markdown conversion"
```

---

### Task 9: Skill doc updates

**Files:**
- Modify: `.claude/skills/sf-docs/SKILL.md`
- Mirror: `.github/skills/sf-docs/SKILL.md`
- Test: `cli/test/versions-in-sync.test.ts` (existing, run only)

- [ ] **Step 1: Edit the skill**

In `.claude/skills/sf-docs/SKILL.md`, replace decision-flow item 2 with:

```markdown
2. **Developer reference (Apex, SOQL, LWC, Metadata/REST APIs, Agentforce, newer product docs):**
   - `sf-docs catalog --grep "<topic>"` to find the right book. The catalog spans BOTH
     platforms: classic Atlas books (platform `atlas`, e.g. `apexcode`) and newer LWR
     guides (platform `lwr`, e.g. `ai/agentforce`).
   - Atlas: `sf-docs toc <deliverable>` then `sf-docs fetch "<deliverable>/<page>.htm"`.
   - LWR: `sf-docs toc <area>/<guide>` (e.g. `ai/agentforce/guide`) then
     `sf-docs fetch "<page url>"`.
   - If the catalog misses a developer topic, newer content lives at
     `developer.salesforce.com/docs/<area>/<guide>` — fetch such URLs directly.
   - For a specific component: `sf-docs component <namespace> <name>` (e.g. `component lightning button`).
```

And replace the Flags section with:

```markdown
## Flags

- `--format md|html|json` (default `md`)
- `--debug` shows the browser (troubleshooting only)
- `--no-cache` forces a fresh fetch
- `search --all-results` includes non-official domains and localized variants
  (default output is official Salesforce domains, English only)

`fetch` accepts multiple URLs in one call (they share one browser session):
`sf-docs fetch "<url1>" "<url2>" ...` — much faster for compiling guides.
```

- [ ] **Step 2: Mirror byte-identically**

```bash
cp .claude/skills/sf-docs/SKILL.md .github/skills/sf-docs/SKILL.md
```

- [ ] **Step 3: Run the sync test** — `cd cli && npx vitest run test/versions-in-sync.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/sf-docs/SKILL.md .github/skills/sf-docs/SKILL.md
git commit -m "docs: sf-docs skill covers LWR lane, --all-results, multi-URL fetch"
```

---

### Task 10: Version 0.4.0, build, live verification

**Files:**
- Modify: `cli/package.json`, `cli/package-lock.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.github/plugin.json`, `.github/plugin/marketplace.json`

- [ ] **Step 1: Bump all six declarations**

```bash
cd cli && npm version 0.4.0 --no-git-tag-version && cd ..
sed -i 's/"0\.3\.0"/"0.4.0"/g' .claude-plugin/plugin.json .claude-plugin/marketplace.json .github/plugin.json .github/plugin/marketplace.json
```

- [ ] **Step 2: Full suite green (versions-in-sync included)**

Run: `cd cli && npx vitest run`
Expected: PASS, zero failures.

- [ ] **Step 3: Rebuild the CLI**

Run: `cd cli && npm run build`
Then: `node cli/dist/index.js --version` → `0.4.0`.

- [ ] **Step 4: Live verification (network + browser required)**

```bash
node cli/dist/index.js --no-cache fetch "https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api.html" | head -8
# EXPECT: title WITHOUT "| Salesforce Developers"; "> Version: current (unversioned platform)";
#         "> Retrieved: <today> via sf-docs (lwr)"

node cli/dist/index.js --no-cache toc ai/agentforce/guide | head -10
# EXPECT: >20 lines of <url>\t<text> style TOC entries, all under /docs/ai/agentforce/guide/

node cli/dist/index.js --no-cache catalog --grep agentforce
# EXPECT: at least one lwr row (ai/agentforce) and the atlas IT-Service guide row

node cli/dist/index.js --no-cache search "Atlas Reasoning Engine" --source help
# EXPECT: every URL on help/developer/trailhead.salesforce.com, no orgcs.my.salesforce.com

node cli/dist/index.js --no-cache fetch "apexcode/apex_intro_what_is_apex.htm" "apexcode/apex_dev_guide.htm" | grep -c "^# "
# EXPECT: >= 2 (two documents in one invocation), single browser session (observe: one startup pause, not two)
```

If any live check fails, debug with `--debug` (headed browser) before proceeding — do not commit a version bump on red live checks.

- [ ] **Step 5: Commit**

```bash
git add cli/package.json cli/package-lock.json .claude-plugin/plugin.json .claude-plugin/marketplace.json .github/plugin.json .github/plugin/marketplace.json
git commit -m "chore: bump version to 0.4.0"
```

---

## Self-Review

- **Spec coverage:** §1 rename (T1), fetcher+parsers (T2–3), toc/catalog wiring + platform column + zero-parse throws (T3–4); §2 filter + flag (T5); §3 variadic fetch + continue-on-error + exit code (T6); §4 retrieved date + help version + lwr version line (T3, T7); §5 boilerplate strip (T8); §6 skill + mirror (T9); §7 version bump (T10); live gate (T10 step 4). Non-goals respected: no JSON API, no parallelism, no cache changes beyond the required `catalog:v2` key bump (old cache entries lack `platform` — bumping the key is the minimal correct move, documented in T4).
- **Placeholders:** none — all steps carry full code and exact commands.
- **Decomposition consistency:** `fetchLwr`/`listLwrCatalog`/`fetchLwrToc`/`parseLwrCatalog`/`parseLwrToc`/`cleanLwrTitle`/`fetchTextInPage`/`filterOfficial`/`fetchBatch` used identically across tasks; `TocEntry` reused from `sources/atlas`; T7 explicitly patches T3's header assertion.
- **Buildability:** exact file:line anchors, current code quoted where replaced, stub-browser test pattern named with its reference file, Windows/Git-Bash commands, expected outputs stated.

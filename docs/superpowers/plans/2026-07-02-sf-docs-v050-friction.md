# sf-docs v0.5.0 — Shared Context, toc --depth, Catalog Seeds Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use h-superpowers:subagent-driven-development, h-superpowers:team-driven-development, or h-superpowers:executing-plans to implement this plan (ask user which approach). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Amortize the Akamai warmup via a shared browser context + persistent docs page, add `toc --depth` for one-session LWR drill-down, seed the LWR catalog with notable non-API doc roots, and make the reference skill's citations mechanical.

**Architecture:** `BrowserManager` keeps one `BrowserContext` for its lifetime and a persistent "docs page" (navigated once to the warmup URL) that all JSON/text page-context fetches evaluate from — same-origin, cookies persistent, zero repeat navigations. Render-style methods open/close pages in the shared context. `toc --depth` is a breadth-first expansion over `fetchLwrToc` with dedupe and a hard cap. Catalog seeds are a static additive list merged after parsing `/docs/apis`.

**Tech Stack:** TypeScript ESM, Playwright, Vitest (`cd cli && npx vitest run`; baseline **114 passed | 1 skipped**), Commander v12. Repo `C:\Users\ehart\repos\sf-doc-search`, Windows/Git Bash. Branch: create `feat/v050-friction` off `main` before Task 1.

---

## File Structure

- Modify `cli/src/browser.ts` — shared context, persistent docs page, per-origin warm memo.
- Create `cli/test/browser-context.test.ts` — lifecycle tests via `vi.mock("playwright")`.
- Modify `cli/src/sources/lwr.ts` — `fetchLwrTocDeep`, `LWR_SEED_ROOTS`, seed merge in `listLwrCatalog`.
- Modify `cli/test/sources/lwr.test.ts` — depth + seed tests.
- Modify `cli/src/engine.ts` — `toc(target, depth)`.
- Modify `cli/src/index.ts` — `toc --depth <n>` flag.
- Modify `cli/test/engine.test.ts` — depth dispatch test.
- Modify `.claude/skills/sf-docs/SKILL.md` (+ mirror) — `--depth`, seeded-catalog caveat.
- Modify `.claude/skills/sf-docs-reference/SKILL.md` (+ mirror) — JSON-based citations line.
- Six version declarations → 0.5.0 (final task).

---

### Task 1: Shared browser context + persistent docs page

**Files:**
- Modify: `cli/src/browser.ts`
- Create: `cli/test/browser-context.test.ts`

Current `browser.ts` (post-0.4.0): `page()` creates a NEW context per call; `fetchJsonInPage`/`fetchTextInPage` each `goto(DEV_DOCS_WARMUP)` then `page.evaluate(fetch…)` then close the context. The rationale comment says warmup must run every call because contexts don't persist — this task makes them persist, which is the better fix.

**Key invariant:** the evaluate-fetch must run from a page that IS on developer.salesforce.com (same-origin + cookies). A fresh page in a warmed context still sits on `about:blank`, so "skip the goto" is not enough — instead keep ONE persistent page navigated once and reuse it for all evaluate-fetches.

- [ ] **Step 1: Write failing lifecycle tests**

Create `cli/test/browser-context.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Counters exposed by the playwright mock (hoisted access via vi.hoisted).
const state = vi.hoisted(() => ({
  launches: 0,
  contexts: 0,
  pages: [] as Array<{ gotos: string[]; closed: boolean }>,
}));

vi.mock("playwright", () => {
  const makePage = () => {
    const p = { gotos: [] as string[], closed: false };
    state.pages.push(p);
    return {
      goto: async (u: string) => { p.gotos.push(u); },
      evaluate: async (_fn: any, arg?: any) => `evaluated:${JSON.stringify(arg ?? null)}`,
      close: async () => { p.closed = true; },
      context: () => ({ close: async () => {} }),
      title: async () => "t",
      content: async () => "<html></html>",
      locator: () => ({ first: () => ({ waitFor: async () => {}, innerText: async () => "x".repeat(200), evaluate: async () => "<p>x</p>" }) }),
      waitForTimeout: async () => {},
      on: () => {},
    };
  };
  return {
    chromium: {
      launch: async () => {
        state.launches++;
        return {
          newContext: async () => {
            state.contexts++;
            return { newPage: async () => makePage(), close: async () => {} };
          },
          close: async () => {},
          version: () => "test",
        };
      },
    },
  };
});

import { BrowserManager } from "../src/browser";

beforeEach(() => { state.launches = 0; state.contexts = 0; state.pages.length = 0; });

describe("shared browser context", () => {
  it("N page-context fetches share one launch, one context, one warmup navigation", async () => {
    const bm = new BrowserManager({});
    await bm.fetchJsonInPage("https://developer.salesforce.com/docs/a");
    await bm.fetchTextInPage("https://developer.salesforce.com/docs/b");
    await bm.fetchJsonInPage("https://developer.salesforce.com/docs/c");
    await bm.close();
    expect(state.launches).toBe(1);
    expect(state.contexts).toBe(1);
    // exactly one page did the warmup goto, and only once
    const gotos = state.pages.flatMap((p) => p.gotos);
    expect(gotos).toEqual(["https://developer.salesforce.com/docs"]);
  });

  it("render calls open their own page in the shared context and close it", async () => {
    const bm = new BrowserManager({});
    await bm.renderFull("https://example.com/x");
    await bm.renderFull("https://example.com/y");
    await bm.close();
    expect(state.contexts).toBe(1);
    const renderPages = state.pages.filter((p) => p.gotos.some((g) => g.includes("example.com")));
    expect(renderPages).toHaveLength(2);
    expect(renderPages.every((p) => p.closed)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd cli && npx vitest run test/browser-context.test.ts`
Expected: FAIL — current code creates one context PER CALL (`contexts` is 3/2, and each fetch does its own warmup goto).

- [ ] **Step 3: Implement**

In `cli/src/browser.ts`:

Replace the class fields and `page()` (imports gain `BrowserContext`):

```ts
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
```

```ts
export class BrowserManager {
  private browser?: Browser;
  private ctx?: BrowserContext;
  private docsPage?: Page; // persistent page parked on DEV_DOCS_WARMUP for evaluate-fetches
  constructor(private opts: BrowserOptions = {}) {}
```

```ts
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
   *  fetch() would be cross-origin — that's why this page persists.) */
  private async docs(): Promise<Page> {
    if (this.docsPage && !this.docsPage.isClosed()) return this.docsPage;
    this.docsPage = await this.page();
    await this.docsPage.goto(DEV_DOCS_WARMUP, { waitUntil: "domcontentloaded", timeout: 45_000 });
    return this.docsPage;
  }
```

Replace `fetchJsonInPage` and `fetchTextInPage` bodies (no per-call page/context churn, no finally-close — the docs page persists):

```ts
  /** Fetch JSON from the persistent docs page's context (Akamai cleared once per process). */
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
```

In `renderAndExtract`, `renderFull`, `postJsonInPage`, and `captureCoveoToken`, change the cleanup from closing the context to closing the page: replace every `await page.context().close();` with `await page.close();` (the shared context must survive).

Replace `close()`:

```ts
  async close(): Promise<void> {
    await this.browser?.close(); // closes the context and all pages with it
    this.browser = undefined;
    this.ctx = undefined;
    this.docsPage = undefined;
  }
```

- [ ] **Step 4: Run the suite**

Run: `cd cli && npx vitest run`
Expected: 116 passed | 1 skipped (114 baseline + 2 new).

- [ ] **Step 5: Commit**

```bash
git add cli/src/browser.ts cli/test/browser-context.test.ts
git commit -m "perf: shared browser context + persistent docs page (warm Akamai once per process)"
```

---

### Task 2: `toc --depth`

**Files:**
- Modify: `cli/src/sources/lwr.ts` (append `fetchLwrTocDeep`)
- Modify: `cli/src/engine.ts` (toc signature)
- Modify: `cli/src/index.ts` (flag)
- Test: `cli/test/sources/lwr.test.ts`, `cli/test/engine.test.ts` (append)

- [ ] **Step 1: Write failing tests**

Append to `cli/test/sources/lwr.test.ts` (extend the existing import with `fetchLwrTocDeep`):

```ts
describe("fetchLwrTocDeep", () => {
  // Level 1 at the guide root lists two sections; each section page lists children.
  const NAVS: Record<string, string> = {
    "https://developer.salesforce.com/docs/ai/agentforce/guide":
      '<a href="/docs/ai/agentforce/guide/s1.html">S1</a><a href="/docs/ai/agentforce/guide/s2.html">S2</a>',
    "https://developer.salesforce.com/docs/ai/agentforce/guide/s1.html":
      '<a href="/docs/ai/agentforce/guide/s1.html">S1</a><a href="/docs/ai/agentforce/guide/s1-child.html">S1 Child</a>',
    "https://developer.salesforce.com/docs/ai/agentforce/guide/s2.html":
      '<a href="/docs/ai/agentforce/guide/s2-child.html">S2 Child</a>',
  };
  const browser = { fetchTextInPage: async (u: string) => NAVS[u] ?? "<html></html>" } as any;

  it("depth 1 equals plain fetchLwrToc", async () => {
    const toc = await fetchLwrTocDeep(browser, "ai/agentforce/guide", 1);
    expect(toc.map((t) => t.text)).toEqual(["S1", "S2"]);
  });

  it("depth 2 merges children, deduped, without re-fetching seen pages", async () => {
    const toc = await fetchLwrTocDeep(browser, "ai/agentforce/guide", 2);
    expect(toc.map((t) => t.text).sort()).toEqual(["S1", "S1 Child", "S2", "S2 Child"]);
  });

  it("expansion tolerates child pages with no nav (leaf pages throw inside fetchLwrToc)", async () => {
    const toc = await fetchLwrTocDeep(browser, "ai/agentforce/guide", 3);
    // s1-child/s2-child have no nav entries -> their fetch throws -> skipped, no crash
    expect(toc).toHaveLength(4);
  });

  it("caps the merged toc and warns", async () => {
    const warnings: string[] = [];
    const orig = console.error;
    console.error = (m: string) => { warnings.push(String(m)); };
    try {
      const toc = await fetchLwrTocDeep(browser, "ai/agentforce/guide", 2, 3);
      expect(toc.length).toBeLessThanOrEqual(3);
      expect(warnings.some((w) => w.includes("truncated"))).toBe(true);
    } finally {
      console.error = orig;
    }
  });
});
```

Append to `cli/test/engine.test.ts` (inside the `lwr integration` describe):

```ts
  it("toc passes depth through to the LWR expansion", async () => {
    const browser = {
      fetchTextInPage: async (u: string) =>
        u.endsWith("/guide")
          ? '<a href="/docs/ai/agentforce/guide/s1.html">S1</a>'
          : '<a href="/docs/ai/agentforce/guide/s1-child.html">C</a>',
    } as any;
    const engine = new Engine(browser, { enabled: false });
    expect(await engine.toc("ai/agentforce/guide", 1)).toHaveLength(1);
    expect(await engine.toc("ai/agentforce/guide", 2)).toHaveLength(2);
  });
```

- [ ] **Step 2: Run to verify failure** — `cd cli && npx vitest run test/sources/lwr.test.ts test/engine.test.ts` → FAIL (`fetchLwrTocDeep` not exported; engine.toc takes one arg).

- [ ] **Step 3: Implement**

Append to `cli/src/sources/lwr.ts`:

```ts
/**
 * Breadth-first expansion of the hierarchical LWR nav: fetch the target's toc,
 * then fetch each new entry's page and merge its scoped toc, `depth` levels deep.
 * Deduped by href; pages already seen are not re-fetched; a child page whose nav
 * yields nothing (leaf) is skipped. Hard cap guards against runaway guides.
 */
export async function fetchLwrTocDeep(
  browser: BrowserManager,
  target: string,
  depth = 1,
  cap = 150,
): Promise<TocEntry[]> {
  const first = await fetchLwrToc(browser, target);
  const seen = new Map<string, TocEntry>(first.filter((e) => e.href).map((e) => [e.href!, e]));
  let frontier = [...seen.values()];
  let truncated = false;

  for (let level = 2; level <= depth; level++) {
    const next: TocEntry[] = [];
    for (const entry of frontier) {
      if (seen.size >= cap) { truncated = true; break; }
      let children: TocEntry[];
      try {
        children = await fetchLwrToc(browser, entry.href!);
      } catch {
        continue; // leaf page or transient parse failure — expansion is best-effort
      }
      for (const c of children) {
        if (!c.href || seen.has(c.href)) continue;
        if (seen.size >= cap) { truncated = true; break; }
        seen.set(c.href, c);
        next.push(c);
      }
    }
    if (truncated || next.length === 0) break;
    frontier = next;
  }
  if (truncated) {
    console.error(`sf-docs warning: toc truncated at ${cap} entries — narrow the target or reduce --depth`);
  }
  return [...seen.values()];
}
```

`cli/src/engine.ts` — replace `toc()` (import gains `fetchLwrTocDeep`):

```ts
  async toc(target: string, depth = 1): Promise<TocEntry[]> {
    if (target.includes("/")) {
      return depth > 1 ? fetchLwrTocDeep(this.browser, target, depth) : fetchLwrToc(this.browser, target);
    }
    if (depth > 1) console.error("sf-docs warning: --depth is ignored for Atlas deliverables (their toc is already the full tree)");
    return fetchToc(this.browser, target);
  }
```

(Import `fetchLwrToc` too if not already imported — check the file's current imports.)

`cli/src/index.ts` — the toc command becomes:

```ts
program
  .command("toc <target>")
  .description("Table of contents: an Atlas deliverable (apexcode) or an LWR guide (ai/agentforce/guide)")
  .option("--depth <n>", "expand LWR toc this many levels (1-3)", "1")
  .action(async (target: string, cmdOpts: { depth: string }) => {
    const opts = program.opts<GlobalOpts>();
    const depth = Math.min(3, Math.max(1, Number.parseInt(cmdOpts.depth, 10) || 1));
    await run(async (engine) => {
      const entries = await engine.toc(target, depth);
      if (opts.format === "json") console.log(JSON.stringify(entries, null, 2));
      else for (const e of entries) console.log(`${e.href ?? "-"}\t${e.text}`);
    }, opts);
  });
```

- [ ] **Step 4: Run the suite** — `cd cli && npx vitest run` → 121 passed | 1 skipped (116 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add cli/src/sources/lwr.ts cli/src/engine.ts cli/src/index.ts cli/test/sources/lwr.test.ts cli/test/engine.test.ts
git commit -m "feat: toc --depth — one-session LWR drill-down with dedupe and cap"
```

---

### Task 3: LWR catalog seed roots + skill caveat

**Files:**
- Modify: `cli/src/sources/lwr.ts` (seeds + merge)
- Modify: `cli/test/sources/lwr.test.ts` (append)
- Modify: `.claude/skills/sf-docs/SKILL.md` + mirror

- [ ] **Step 1: Write failing tests**

Append to `cli/test/sources/lwr.test.ts` (inside the `listLwrCatalog` describe):

```ts
  it("merges seed roots (Agentforce, LWC, Mobile SDK) into the parsed catalog", async () => {
    const browser = {
      fetchTextInPage: async () => '<a href="/docs/marketing/pardot/overview">Account Engagement</a>',
    } as any;
    const entries = await listLwrCatalog(browser);
    const ids = entries.map((e) => e.id);
    expect(ids).toContain("marketing/pardot");
    expect(ids).toContain("ai/agentforce");
    expect(ids).toContain("platform/lwc");
    expect(ids).toContain("platform/mobile-sdk");
    expect(entries.find((e) => e.id === "ai/agentforce")!.title).toBe("Agentforce Developer Guide");
  });
  it("a parsed entry wins over a seed with the same id", async () => {
    const browser = {
      fetchTextInPage: async () => '<a href="/docs/ai/agentforce/overview">Agentforce (fresh from page)</a>',
    } as any;
    const entries = await listLwrCatalog(browser);
    const af = entries.filter((e) => e.id === "ai/agentforce");
    expect(af).toHaveLength(1);
    expect(af[0].title).toBe("Agentforce (fresh from page)");
  });
```

- [ ] **Step 2: Run to verify failure** — `cd cli && npx vitest run test/sources/lwr.test.ts` → FAIL (no seeds).

- [ ] **Step 3: Implement**

In `cli/src/sources/lwr.ts`, add above `listLwrCatalog`:

```ts
/** Notable LWR doc sets NOT listed on /docs/apis (it enumerates API doc sets only).
 *  Verified live 2026-07-02. Additive: a parsed entry with the same id wins. */
export const LWR_SEED_ROOTS: Array<{ id: string; title: string }> = [
  { id: "ai/agentforce", title: "Agentforce Developer Guide" },
  { id: "platform/lwc", title: "Lightning Web Components Developer Guide" },
  { id: "platform/mobile-sdk", title: "Mobile SDK Development Guide" },
];
```

and change `listLwrCatalog`'s return to merge them:

```ts
export async function listLwrCatalog(browser: BrowserManager): Promise<LwrCatalogEntry[]> {
  const entries = parseLwrCatalog(await browser.fetchTextInPage(CATALOG_URL));
  if (entries.length === 0) {
    throw new Error(`No guides parsed from ${CATALOG_URL} — the page may have changed; retry with --debug`);
  }
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const seed of LWR_SEED_ROOTS) {
    if (!byId.has(seed.id)) {
      byId.set(seed.id, { id: seed.id, title: seed.title, url: `${DEV_ORIGIN}/docs/${seed.id}` });
    }
  }
  return [...byId.values()];
}
```

In `.claude/skills/sf-docs/SKILL.md`, replace the catalog caveat sentence:

```markdown
     API doc sets (platform `lwr`, e.g. `platform/pub-sub-api`). LWR rows come from the
     /docs/apis directory, so non-API LWR doc sets (e.g. `ai/agentforce`) may be absent —
     they are still fully fetchable by URL (next bullets).
```

with:

```markdown
     API doc sets (platform `lwr`, e.g. `platform/pub-sub-api`). LWR rows come from the
     /docs/apis directory plus a seeded list of notable doc sets (`ai/agentforce`,
     `platform/lwc`, `platform/mobile-sdk`); anything still missing is fully fetchable
     by URL (next bullets).
```

Also mention `--depth` in the LWR toc bullet — change:

```markdown
   - LWR: the nav is hierarchical — `sf-docs toc <catalog-id>/guide` (e.g.
     `ai/agentforce/guide`) lists that level's sections; run `sf-docs toc "<entry url>"`
     on a result to expand its section, drilling down until you see the page you
     need, then `sf-docs fetch "<page url>"`.
```

to:

```markdown
   - LWR: the nav is hierarchical — `sf-docs toc <catalog-id>/guide` (e.g.
     `ai/agentforce/guide`) lists that level's sections; add `--depth 2` (max 3) to
     expand sub-levels in one call, or run `sf-docs toc "<entry url>"` on a result to
     expand just that section. Then `sf-docs fetch "<page url>"`.
```

Then mirror: `cp .claude/skills/sf-docs/SKILL.md .github/skills/sf-docs/SKILL.md`

- [ ] **Step 4: Run the suite** — `cd cli && npx vitest run` → 123 passed | 1 skipped.

- [ ] **Step 5: Commit**

```bash
git add cli/src/sources/lwr.ts cli/test/sources/lwr.test.ts .claude/skills/sf-docs/SKILL.md .github/skills/sf-docs/SKILL.md
git commit -m "feat: seed LWR catalog with notable non-API doc roots; document toc --depth"
```

---

### Task 4: Reference-skill mechanical citations

**Files:**
- Modify: `.claude/skills/sf-docs-reference/SKILL.md` + mirror `.github/skills/sf-docs-reference/SKILL.md`

- [ ] **Step 1: Edit the skill**

In `.claude/skills/sf-docs-reference/SKILL.md`, workflow step 4 currently reads:

```markdown
4. **Capture provenance.** Every `sf-docs fetch` returns a provenance header
   (title, source URL, doc version). Record it for each page — you need it for
   the References list.
```

Replace with:

```markdown
4. **Capture provenance.** Batch known pages with multi-URL
   `sf-docs fetch --format json "<url>" "<url>" ...` (one browser session) and
   build each References entry mechanically from the returned array's `title`,
   `url`, and `version` fields plus today's date. For single Markdown fetches,
   the provenance header carries the same fields — record it per page.
```

- [ ] **Step 2: Mirror + sync test**

```bash
cp .claude/skills/sf-docs-reference/SKILL.md .github/skills/sf-docs-reference/SKILL.md
cd cli && npx vitest run test/versions-in-sync.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/sf-docs-reference/SKILL.md .github/skills/sf-docs-reference/SKILL.md
git commit -m "docs: sf-docs-reference builds citations from fetch --format json output"
```

---

### Task 5: Version 0.5.0, build, live verification (controller-owned)

- [ ] **Step 1: Bump all six declarations**

```bash
cd cli && npm version 0.5.0 --no-git-tag-version && cd ..
sed -i 's/"0\.4\.0"/"0.5.0"/g' .claude-plugin/plugin.json .claude-plugin/marketplace.json .github/plugin.json .github/plugin/marketplace.json
```

- [ ] **Step 2: Suite + rebuild** — `cd cli && npx vitest run` (all green) then `npm run build`; `node cli/dist/index.js --version` → `0.5.0`.

- [ ] **Step 3: Live verification**

```bash
# Seeds visible (agentforce + lwc rows, platform lwr)
node cli/dist/index.js --no-cache catalog --grep agentforce
node cli/dist/index.js --no-cache catalog --grep lwc

# Depth expansion: depth 2 strictly more entries than depth 1; includes agent-api pages
node cli/dist/index.js --no-cache toc ai/agentforce/guide | wc -l
node cli/dist/index.js --no-cache toc ai/agentforce/guide --depth 2 | wc -l
node cli/dist/index.js --no-cache toc ai/agentforce/guide --depth 2 | grep -c agent-api

# Warmup amortization: timed catalog run (two page-context fetches, one warmup)
time node cli/dist/index.js --no-cache catalog > /dev/null

# Regression sweep: atlas fetch, help fetch (boilerplate still stripped), search filter
node cli/dist/index.js --no-cache fetch "apexcode/apex_intro_what_is_apex.htm" | head -5
node cli/dist/index.js --no-cache search "Atlas Reasoning Engine" --source help | head -6
```

Expected: agentforce/lwc lwr rows present; depth 2 > depth 1 with agent-api pages; catalog time visibly under the 0.4.0 double-navigation baseline; regressions none. Do NOT commit the bump on red live checks — debug first (`--debug` for a headed browser).

- [ ] **Step 4: Commit**

```bash
git add cli/package.json cli/package-lock.json .claude-plugin/plugin.json .claude-plugin/marketplace.json .github/plugin.json .github/plugin/marketplace.json
git commit -m "chore: bump version to 0.5.0"
```

---

## Self-Review

- **Spec coverage:** §1 shared context + persistent docs page + warm-once (T1, incl. the about:blank cross-origin invariant); §2 depth flag/cap/atlas-ignore/stderr (T2); §3 seeds + dedupe + skill caveat (T3); §4 reference-skill line (T4); version + live gates incl. timing (T5). Non-goals respected (no crawl, no parallel expansion, no crash resurrection).
- **Placeholders:** none — full code and exact commands throughout.
- **Decomposition consistency:** `fetchLwrTocDeep(browser, target, depth, cap)` signature identical in lwr.ts, engine import, and tests; `docs()`/`context()`/`page()` names used consistently; seed export name `LWR_SEED_ROOTS` matches tests.
- **Buildability:** current-code quotes given where replaced; the one subtle behavior (evaluate-fetch must be same-origin) is explained where an engineer would otherwise "optimize" it back into a bug; mock playwright harness is complete and self-contained.

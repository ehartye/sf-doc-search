# sf-doc-search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use h-superpowers:subagent-driven-development, h-superpowers:team-driven-development, or h-superpowers:executing-plans to implement this plan (ask user which approach). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sf-docs`, a Node/TS CLI that retrieves clean Salesforce documentation (developer docs, Help, Trailhead, release notes), packaged with a shared `SKILL.md` as one plugin for both Claude Code and GitHub Copilot (no MCP).

**Architecture:** A pure-logic core (router, id-normalization, TOC, markdown, cache) wraps a single lazy headless Playwright engine that clears the Akamai bot-wall (Atlas JSON fetched from inside the page context) and renders shadow-DOM Help pages. An `engine.ts` orchestrator is the testable seam; `index.ts` is a thin Commander CLI. A shared `.claude/skills/sf-docs/SKILL.md` (auto-discovered by both ecosystems) tells the agent to web-search → call the CLI to fetch/clean.

**Tech Stack:** Node 20+, TypeScript (ESM), Commander, Playwright, Turndown, Vitest, tsup.

---

## Conventions

- **Package manager:** `npm`. All CLI work happens inside `cli/` unless a path says otherwise.
- **Module system:** ESM (`"type": "module"`), `moduleResolution: "Bundler"`, extensionless imports (tsup bundles).
- **Tests:** Vitest. Pure-unit tests run always. Network/browser tests are gated behind `SF_DOCS_LIVE=1` and `describe.skipIf(!process.env.SF_DOCS_LIVE)` so CI stays deterministic and offline.
- **Commits:** one per task (after its tests pass). Commit messages use Conventional Commits.
- **Reference skill:** Each implementation task follows @h-superpowers:test-driven-development (failing test first).

---

## Task 1: Scaffold the CLI package

**Files:**
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/tsup.config.ts`
- Create: `cli/vitest.config.ts`
- Create: `cli/src/index.ts` (placeholder)
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
dist/
*.log
.sf-docs-cache/
coverage/
```

- [ ] **Step 2: Create `cli/package.json`**

```json
{
  "name": "sf-docs",
  "version": "0.1.0",
  "description": "Retrieve clean Salesforce documentation (dev docs, Help, Trailhead, release notes) without shadow-DOM/render friction.",
  "type": "module",
  "bin": { "sf-docs": "dist/index.js" },
  "files": ["dist"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "playwright": "^1.48.0",
    "turndown": "^7.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "@types/turndown": "^5.0.5",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create `cli/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 4: Create `cli/tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
```

- [ ] **Step 5: Create `cli/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 6: Create placeholder `cli/src/index.ts`**

```ts
// Entry point — wired up in Task 13.
export {};
```

- [ ] **Step 7: Install dependencies**

Run (from `cli/`): `npm install`
Expected: completes, creates `cli/node_modules` and `cli/package-lock.json`.

- [ ] **Step 8: Verify the toolchain builds and tests run**

Run (from `cli/`): `npm run build && npm test`
Expected: build emits `cli/dist/index.js`; `vitest` reports "No test files found" (exit 0) — that is fine at this stage.

- [ ] **Step 9: Commit**

```bash
git add cli/ .gitignore
git commit -m "chore: scaffold sf-docs CLI package (TS/ESM, vitest, tsup)"
```

---

## Task 2: Shared types + source router

The router is pure: given a URL or atlas shorthand, return which source handles it and any parsed refs. No network.

**Files:**
- Create: `cli/src/types.ts`
- Create: `cli/src/router.ts`
- Test: `cli/test/router.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// cli/test/router.test.ts
import { describe, it, expect } from "vitest";
import { route } from "../src/router";

describe("route", () => {
  const cases: Array<[string, string]> = [
    ["https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_intro_what_is_apex.htm", "atlas"],
    ["https://developer.salesforce.com/docs/platform/lwc/guide/intro.html", "atlas-lwr"],
    ["https://developer.salesforce.com/docs/component-library/bundle/lightning-button", "component"],
    ["https://developer.salesforce.com/docs/component-library/documentation/en/lightning-component-reference", "component"],
    ["https://help.salesforce.com/s/articleView?id=platform.security_about_sharing_rules&type=5", "help"],
    ["https://help.salesforce.com/s/articleView?id=release-notes.salesforce_release_notes.htm&type=5", "release"],
    ["https://releasenotes.docs.salesforce.com/en-us/summer26/release-notes/salesforce_release_notes.htm", "release"],
    ["https://trailhead.salesforce.com/content/learn/modules/apex_basics_dotnet", "trailhead"],
    ["apexcode/apex_intro_what_is_apex.htm", "atlas"],
    ["https://example.com/whatever", "generic"],
  ];

  it.each(cases)("classifies %s as %s", (input, expected) => {
    expect(route(input).source).toBe(expected);
  });

  it("parses atlas refs from a full dev-docs URL", () => {
    const r = route("https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_intro_what_is_apex.htm");
    expect(r.atlas).toEqual({
      deliverable: "apexcode",
      file: "apex_intro_what_is_apex.htm",
      locale: "en-us",
      longId: "atlas.en-us.apexcode.meta",
      docVersion: undefined,
    });
  });

  it("parses component refs", () => {
    const r = route("https://developer.salesforce.com/docs/component-library/bundle/lightning-button");
    expect(r.component).toEqual({ namespace: "lightning", name: "button", model: "lwc" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/router.test.ts`
Expected: FAIL — cannot find module `../src/router`.

- [ ] **Step 3: Create `cli/src/types.ts`**

```ts
export type Source =
  | "atlas"        // developer.salesforce.com Atlas JSON API
  | "atlas-lwr"    // developer.salesforce.com server-rendered narrative docs
  | "component"    // LWC/Aura component library (cx-router)
  | "help"         // help.salesforce.com article (shadow DOM)
  | "release"      // release notes (Help article, release-notes.* id)
  | "trailhead"    // trailhead.salesforce.com learn content
  | "generic";     // any other host -> readability render

export interface AtlasRef {
  longId: string;        // e.g. atlas.en-us.apexcode.meta (version may be absent until resolved)
  deliverable: string;   // short, e.g. apexcode
  file?: string;         // e.g. apex_intro_what_is_apex.htm
  locale: string;        // e.g. en-us
  docVersion?: string;   // e.g. 262.0 (resolved from get_document if absent)
}

export interface ComponentRef {
  namespace: string;     // e.g. lightning
  name: string;          // e.g. button
  model: "lwc" | "aura";
}

export interface RouteResult {
  source: Source;
  url: string;           // normalized absolute URL (or original shorthand)
  atlas?: AtlasRef;
  component?: ComponentRef;
}

export interface DocResult {
  title: string;
  url: string;
  source: Source;
  version?: string;
  html: string;
  markdown: string;
}
```

- [ ] **Step 4: Create `cli/src/router.ts`**

```ts
import type { RouteResult, AtlasRef, ComponentRef, Source } from "./types";

const ATLAS_LONG = /^atlas\.([a-z-]+)\.(?:(\d+\.\d+)\.)?([a-z0-9_]+)\.meta$/i;

function parseAtlasFromPath(pathname: string): AtlasRef | undefined {
  // /docs/atlas.en-us[.262.0].apexcode.meta/apexcode/apex_intro_what_is_apex.htm
  const parts = pathname.split("/").filter(Boolean); // [docs, atlas..., apexcode, file.htm]
  const idx = parts.findIndex((p) => p.startsWith("atlas."));
  if (idx === -1) return undefined;
  const m = ATLAS_LONG.exec(parts[idx]);
  if (!m) return undefined;
  const [, locale, docVersion, deliverable] = m;
  const file = parts.slice(idx + 1).find((p) => p.endsWith(".htm"));
  return { longId: parts[idx], deliverable, file, locale, docVersion };
}

function parseComponent(pathname: string): ComponentRef | undefined {
  // .../component-library/bundle/lightning-button  OR  .../bundle/aura/lightning-card
  const m = /component-library\/bundle\/(?:(aura|lwc)\/)?([a-z]+)-([a-z0-9_]+)/i.exec(pathname);
  if (!m) return undefined;
  const model = (m[1]?.toLowerCase() as "aura" | "lwc") ?? "lwc";
  return { namespace: m[2].toLowerCase(), name: m[3].toLowerCase(), model };
}

export function route(input: string): RouteResult {
  const trimmed = input.trim();

  // Bare atlas shorthand: "apexcode/apex_intro_what_is_apex.htm" or an atlas id.
  if (!/^https?:\/\//i.test(trimmed)) {
    if (ATLAS_LONG.test(trimmed)) {
      const m = ATLAS_LONG.exec(trimmed)!;
      return {
        source: "atlas",
        url: trimmed,
        atlas: { longId: trimmed, deliverable: m[3], locale: m[1], docVersion: m[2] },
      };
    }
    const m = /^([a-z0-9_]+)\/([a-z0-9_]+\.htm)$/i.exec(trimmed);
    if (m) {
      return {
        source: "atlas",
        url: trimmed,
        atlas: { longId: `atlas.en-us.${m[1]}.meta`, deliverable: m[1], file: m[2], locale: "en-us" },
      };
    }
    return { source: "generic", url: trimmed };
  }

  const u = new URL(trimmed);
  const host = u.hostname.toLowerCase();
  const path = u.pathname;

  if (host === "developer.salesforce.com") {
    if (path.includes("/component-library/")) {
      return { source: "component", url: trimmed, component: parseComponent(path) };
    }
    if (path.includes("/atlas.")) {
      return { source: "atlas", url: trimmed, atlas: parseAtlasFromPath(path) };
    }
    return { source: "atlas-lwr", url: trimmed };
  }

  if (host === "help.salesforce.com") {
    const id = u.searchParams.get("id") ?? "";
    const source: Source = id.startsWith("release-notes.") ? "release" : "help";
    return { source, url: trimmed };
  }

  if (host === "releasenotes.docs.salesforce.com") {
    return { source: "release", url: trimmed };
  }

  if (host === "trailhead.salesforce.com") {
    return { source: "trailhead", url: trimmed };
  }

  return { source: "generic", url: trimmed };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `cli/`): `npx vitest run test/router.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add cli/src/types.ts cli/src/router.ts cli/test/router.test.ts
git commit -m "feat: source router + shared types"
```

---

## Task 3: Atlas id normalization

Resolve the long/short deliverable overloading and build the two endpoint URLs.

**Files:**
- Create: `cli/src/atlas-id.ts`
- Test: `cli/test/atlas-id.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// cli/test/atlas-id.test.ts
import { describe, it, expect } from "vitest";
import { getDocumentUrl, getContentUrl, getIndexUrl } from "../src/atlas-id";

describe("atlas-id", () => {
  it("builds the get_document URL from a long id", () => {
    expect(getDocumentUrl("atlas.en-us.apexcode.meta")).toBe(
      "https://developer.salesforce.com/docs/get_document/atlas.en-us.apexcode.meta",
    );
  });

  it("builds the get_document URL from a bare deliverable", () => {
    expect(getDocumentUrl("apexcode")).toBe(
      "https://developer.salesforce.com/docs/get_document/atlas.en-us.apexcode.meta",
    );
  });

  it("builds the get_document_content URL", () => {
    expect(getContentUrl("apexcode", "apex_intro_what_is_apex.htm", "en-us", "262.0")).toBe(
      "https://developer.salesforce.com/docs/get_document_content/apexcode/apex_intro_what_is_apex.htm/en-us/262.0",
    );
  });

  it("appends a missing .htm suffix on the content file", () => {
    expect(getContentUrl("apexcode", "apex_intro_what_is_apex", "en-us", "262.0")).toContain(
      "/apex_intro_what_is_apex.htm/",
    );
  });

  it("builds the get_index catalog URL", () => {
    expect(getIndexUrl()).toBe(
      "https://developer.salesforce.com/docs/get_index/en-us/000.0/false/All%20Services/all",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/atlas-id.test.ts`
Expected: FAIL — cannot find module `../src/atlas-id`.

- [ ] **Step 3: Create `cli/src/atlas-id.ts`**

```ts
const BASE = "https://developer.salesforce.com/docs";

/** Accepts a bare deliverable ("apexcode") or a long id ("atlas.en-us.apexcode.meta"). */
export function toLongId(deliverableOrLong: string, locale = "en-us"): string {
  if (deliverableOrLong.startsWith("atlas.")) return deliverableOrLong;
  return `atlas.${locale}.${deliverableOrLong}.meta`;
}

export function getDocumentUrl(deliverableOrLong: string, locale = "en-us"): string {
  return `${BASE}/get_document/${toLongId(deliverableOrLong, locale)}`;
}

export function getContentUrl(
  shortDeliverable: string,
  file: string,
  locale: string,
  docVersion: string,
): string {
  const htm = file.endsWith(".htm") ? file : `${file}.htm`;
  return `${BASE}/get_document_content/${shortDeliverable}/${htm}/${locale}/${docVersion}`;
}

export function getIndexUrl(): string {
  return `${BASE}/get_index/en-us/000.0/false/All%20Services/all`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `cli/`): `npx vitest run test/atlas-id.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/atlas-id.ts cli/test/atlas-id.test.ts
git commit -m "feat: atlas id normalization + endpoint URL builders"
```

---

## Task 4: TOC walker

Flatten the Atlas TOC tree so the engine can find a page's `href` by id or title text.

**Files:**
- Create: `cli/src/toc.ts`
- Test: `cli/test/toc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// cli/test/toc.test.ts
import { describe, it, expect } from "vitest";
import { flattenToc, findHref, type TocNode } from "../src/toc";

const toc: TocNode[] = [
  {
    id: "apex_dev_guide",
    text: "Apex Developer Guide",
    a_attr: { href: "apex_dev_guide.htm" },
    children: [
      {
        id: "apex_intro",
        text: "Getting Started with Apex",
        a_attr: { href: "apex_intro.htm" },
        children: [
          { id: "apex_intro_what_is_apex", text: "What is Apex?", a_attr: { href: "apex_intro_what_is_apex.htm" } },
        ],
      },
    ],
  },
];

describe("toc", () => {
  it("flattens all nodes depth-first", () => {
    expect(flattenToc(toc).map((n) => n.id)).toEqual([
      "apex_dev_guide",
      "apex_intro",
      "apex_intro_what_is_apex",
    ]);
  });

  it("finds an href by exact id", () => {
    expect(findHref(toc, "apex_intro_what_is_apex")).toBe("apex_intro_what_is_apex.htm");
  });

  it("finds an href by case-insensitive title substring", () => {
    expect(findHref(toc, "what is apex")).toBe("apex_intro_what_is_apex.htm");
  });

  it("returns undefined when nothing matches", () => {
    expect(findHref(toc, "nonexistent")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/toc.test.ts`
Expected: FAIL — cannot find module `../src/toc`.

- [ ] **Step 3: Create `cli/src/toc.ts`**

```ts
export interface TocNode {
  id: string;
  text: string;
  a_attr?: { href?: string };
  children?: TocNode[];
}

export function flattenToc(nodes: TocNode[]): TocNode[] {
  const out: TocNode[] = [];
  const walk = (list: TocNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Find a page href by exact id first, then case-insensitive title substring. */
export function findHref(nodes: TocNode[], query: string): string | undefined {
  const flat = flattenToc(nodes);
  const byId = flat.find((n) => n.id === query);
  if (byId?.a_attr?.href) return byId.a_attr.href;
  const q = query.toLowerCase();
  const byText = flat.find((n) => n.text.toLowerCase().includes(q));
  return byText?.a_attr?.href;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `cli/`): `npx vitest run test/toc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/toc.ts cli/test/toc.test.ts
git commit -m "feat: atlas TOC walker (flatten + href lookup)"
```

---

## Task 5: HTML → Markdown with provenance header

**Files:**
- Create: `cli/src/markdown.ts`
- Test: `cli/test/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// cli/test/markdown.test.ts
import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "../src/markdown";

describe("htmlToMarkdown", () => {
  const meta = { title: "What is Apex?", url: "https://developer.salesforce.com/x", source: "atlas" as const, version: "262.0" };

  it("prepends a provenance header", () => {
    const md = htmlToMarkdown("<p>Hello</p>", meta);
    expect(md).toContain("# What is Apex?");
    expect(md).toContain("Source: https://developer.salesforce.com/x");
    expect(md).toContain("Version: 262.0");
  });

  it("converts headings, code blocks and tables", () => {
    const html = `<h1 class="helpHead1">What is Apex?</h1><pre><code>System.debug('x');</code></pre>
      <table><tr><th>A</th></tr><tr><td>1</td></tr></table>`;
    const md = htmlToMarkdown(html, meta);
    expect(md).toContain("```");
    expect(md).toContain("System.debug('x');");
    expect(md).toContain("| A |");
  });

  it("omits the version line when version is absent", () => {
    const md = htmlToMarkdown("<p>x</p>", { ...meta, version: undefined });
    expect(md).not.toContain("Version:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/markdown.test.ts`
Expected: FAIL — cannot find module `../src/markdown`.

- [ ] **Step 3: Create `cli/src/markdown.ts`**

```ts
import TurndownService from "turndown";
import type { Source } from "./types";

const td = new TurndownService({ codeBlockStyle: "fenced", headingStyle: "atx" });

// Render HTML tables as GitHub-flavored Markdown tables.
td.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const rows = Array.from((node as HTMLElement).querySelectorAll("tr"));
    if (rows.length === 0) return "";
    const cells = (r: Element) =>
      Array.from(r.querySelectorAll("th,td")).map((c) => (c.textContent ?? "").trim().replace(/\|/g, "\\|"));
    const header = cells(rows[0]);
    const sep = header.map(() => "---");
    const body = rows.slice(1).map((r) => `| ${cells(r).join(" | ")} |`);
    return `\n\n| ${header.join(" | ")} |\n| ${sep.join(" | ")} |\n${body.join("\n")}\n\n`;
  },
});

export interface DocMeta {
  title: string;
  url: string;
  source: Source;
  version?: string;
}

export function htmlToMarkdown(html: string, meta: DocMeta): string {
  const body = td.turndown(html).trim();
  const header = [
    `# ${meta.title}`,
    "",
    `> Source: ${meta.url}`,
    meta.version ? `> Version: ${meta.version}` : undefined,
    `> Retrieved via sf-docs (${meta.source})`,
    "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
  return `${header}\n${body}\n`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `cli/`): `npx vitest run test/markdown.test.ts`
Expected: PASS. If Turndown errors on a raw string in Node, it means the installed version needs a DOM — fix by adding `dependencies: { "jsdom": "^25.0.0" }`, then `td.turndown(new (await import("jsdom")).JSDOM(html).window.document.body)`. (Turndown 7.2 accepts strings in Node via its bundled parser; only fall back if the test fails.)

- [ ] **Step 5: Commit**

```bash
git add cli/src/markdown.ts cli/test/markdown.test.ts cli/package.json
git commit -m "feat: HTML to Markdown conversion with provenance header"
```

---

## Task 6: Disk cache

**Files:**
- Create: `cli/src/cache.ts`
- Test: `cli/test/cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// cli/test/cache.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cache } from "../src/cache";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sf-docs-cache-"));
});

describe("Cache", () => {
  it("returns undefined on a miss", () => {
    const c = new Cache({ dir, ttlMs: 1000 });
    expect(c.get("k")).toBeUndefined();
  });

  it("round-trips a value within TTL", () => {
    const c = new Cache({ dir, ttlMs: 10_000 });
    c.set("k", { hello: "world" });
    expect(c.get("k")).toEqual({ hello: "world" });
  });

  it("treats expired entries as a miss", () => {
    const c = new Cache({ dir, ttlMs: -1 });
    c.set("k", { a: 1 });
    expect(c.get("k")).toBeUndefined();
  });

  it("bypasses entirely when disabled", () => {
    const c = new Cache({ dir, ttlMs: 10_000, enabled: false });
    c.set("k", { a: 1 });
    expect(c.get("k")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/cache.test.ts`
Expected: FAIL — cannot find module `../src/cache`.

- [ ] **Step 3: Create `cli/src/cache.ts`**

```ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function defaultCacheDir(): string {
  if (process.env.SF_DOCS_CACHE_DIR) return process.env.SF_DOCS_CACHE_DIR;
  if (process.env.CLAUDE_PLUGIN_DATA) return join(process.env.CLAUDE_PLUGIN_DATA, "sf-docs-cache");
  return join(homedir(), ".cache", "sf-docs");
}

interface Entry<T> { ts: number; value: T; }

export interface CacheOptions {
  dir?: string;
  ttlMs?: number;
  enabled?: boolean;
}

export class Cache {
  private dir: string;
  private ttlMs: number;
  private enabled: boolean;

  constructor(opts: CacheOptions = {}) {
    this.dir = opts.dir ?? defaultCacheDir();
    this.ttlMs = opts.ttlMs ?? 24 * 60 * 60 * 1000;
    this.enabled = opts.enabled ?? true;
    if (this.enabled && !existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  private path(key: string): string {
    return join(this.dir, createHash("sha256").update(key).digest("hex") + ".json");
  }

  get<T>(key: string): T | undefined {
    if (!this.enabled) return undefined;
    const p = this.path(key);
    if (!existsSync(p)) return undefined;
    try {
      const entry = JSON.parse(readFileSync(p, "utf8")) as Entry<T>;
      if (Date.now() - entry.ts > this.ttlMs) return undefined;
      return entry.value;
    } catch {
      return undefined;
    }
  }

  set<T>(key: string, value: T): void {
    if (!this.enabled) return;
    const entry: Entry<T> = { ts: Date.now(), value };
    writeFileSync(this.path(key), JSON.stringify(entry));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `cli/`): `npx vitest run test/cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/cache.ts cli/test/cache.test.ts
git commit -m "feat: disk cache with TTL and dir resolution"
```

---

## Task 7: Browser engine (single headless Chromium)

One lazy browser, reused. Pure option-resolution is unit-tested; live behavior is gated behind `SF_DOCS_LIVE`.

**Files:**
- Create: `cli/src/browser.ts`
- Test: `cli/test/browser.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// cli/test/browser.test.ts
import { describe, it, expect } from "vitest";
import { resolveLaunch, BrowserManager } from "../src/browser";

describe("resolveLaunch", () => {
  it("is headless by default", () => {
    expect(resolveLaunch({}).headless).toBe(true);
  });
  it("is headed in debug mode", () => {
    expect(resolveLaunch({ debug: true }).headless).toBe(false);
  });
  it("prefers the system chrome channel", () => {
    expect(resolveLaunch({}).channel).toBe("chrome");
  });
});

describe.skipIf(!process.env.SF_DOCS_LIVE)("BrowserManager (live)", () => {
  it("fetches JSON from inside a developer.salesforce.com page (clears Akamai)", async () => {
    const bm = new BrowserManager({});
    try {
      const json = await bm.fetchJsonInPage(
        "https://developer.salesforce.com/docs/get_document/atlas.en-us.apexcode.meta",
      );
      expect(json.title).toMatch(/Apex/i);
      expect(Array.isArray(json.toc)).toBe(true);
    } finally {
      await bm.close();
    }
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/browser.test.ts`
Expected: FAIL — cannot find module `../src/browser`.

- [ ] **Step 3: Create `cli/src/browser.ts`**

```ts
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
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run (from `cli/`): `npx vitest run test/browser.test.ts`
Expected: PASS for `resolveLaunch`; the live block is SKIPPED (no `SF_DOCS_LIVE`).

- [ ] **Step 5: (Optional) verify the live path manually**

Run (from `cli/`, requires system Chrome): `npx playwright install chromium` (only if no system Chrome), then
`SF_DOCS_LIVE=1 npx vitest run test/browser.test.ts`
Expected: PASS — the Atlas JSON returns with `title` matching `/Apex/i`. On Windows PowerShell use: `$env:SF_DOCS_LIVE=1; npx vitest run test/browser.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add cli/src/browser.ts cli/test/browser.test.ts
git commit -m "feat: single headless browser engine (Akamai-clearing JSON fetch + render)"
```

---

## Task 8: Atlas source module

**Files:**
- Create: `cli/src/sources/atlas.ts`
- Test: `cli/test/sources/atlas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// cli/test/sources/atlas.test.ts
import { describe, it, expect, vi } from "vitest";
import { fetchAtlasDoc, listCatalog, fetchToc } from "../../src/sources/atlas";

// A fake BrowserManager that returns canned JSON per URL.
function fakeBrowser(map: Record<string, any>) {
  return {
    fetchJsonInPage: vi.fn(async (url: string) => {
      const key = Object.keys(map).find((k) => url.includes(k));
      if (!key) throw new Error(`no fixture for ${url}`);
      return map[key];
    }),
  } as any;
}

const docFixture = {
  title: "Apex Developer Guide",
  deliverable: "apexcode",
  version: { doc_version: "262.0", version_text: "Summer '26 (API version 67.0)" },
  toc: [{ id: "apex_intro_what_is_apex", text: "What is Apex?", a_attr: { href: "apex_intro_what_is_apex.htm" } }],
};

describe("atlas source", () => {
  it("resolves a page via get_document then get_document_content", async () => {
    const browser = fakeBrowser({
      "get_document/atlas.en-us.apexcode.meta": docFixture,
      "get_document_content/apexcode/apex_intro_what_is_apex.htm/en-us/262.0": {
        title: "What is Apex?",
        content: "<h1>What is Apex?</h1><p>Apex is...</p>",
      },
    });
    const res = await fetchAtlasDoc(browser, { longId: "atlas.en-us.apexcode.meta", deliverable: "apexcode", file: "apex_intro_what_is_apex.htm", locale: "en-us" });
    expect(res.title).toBe("What is Apex?");
    expect(res.version).toBe("262.0");
    expect(res.markdown).toContain("Apex is...");
    expect(res.source).toBe("atlas");
  });

  it("lists the catalog deliverables", async () => {
    const browser = fakeBrowser({
      get_index: { content: [{ id: "apexcode", key: "Apex Developer Guide", value: "atlas.en-us.262.0.apexcode.meta" }] },
    });
    const cat = await listCatalog(browser);
    expect(cat[0]).toMatchObject({ deliverable: "apexcode", title: "Apex Developer Guide" });
  });

  it("returns a flattened TOC", async () => {
    const browser = fakeBrowser({ "get_document/atlas.en-us.apexcode.meta": docFixture });
    const toc = await fetchToc(browser, "apexcode");
    expect(toc).toEqual([{ id: "apex_intro_what_is_apex", text: "What is Apex?", href: "apex_intro_what_is_apex.htm" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/sources/atlas.test.ts`
Expected: FAIL — cannot find module `../../src/sources/atlas`.

- [ ] **Step 3: Create `cli/src/sources/atlas.ts`**

```ts
import type { BrowserManager } from "../browser";
import type { AtlasRef, DocResult } from "../types";
import { getDocumentUrl, getContentUrl, getIndexUrl } from "../atlas-id";
import { flattenToc, findHref, type TocNode } from "../toc";
import { htmlToMarkdown } from "../markdown";

interface AtlasDocMeta {
  title: string;
  deliverable: string;
  version?: { doc_version?: string };
  toc?: TocNode[];
}

export async function fetchDocumentMeta(browser: BrowserManager, deliverable: string): Promise<AtlasDocMeta> {
  return browser.fetchJsonInPage(getDocumentUrl(deliverable));
}

export async function fetchAtlasDoc(browser: BrowserManager, ref: AtlasRef): Promise<DocResult> {
  const meta = await fetchDocumentMeta(browser, ref.deliverable);
  const docVersion = ref.docVersion ?? meta.version?.doc_version;
  if (!docVersion) throw new Error(`Could not resolve doc version for ${ref.deliverable}`);

  // If no explicit file, default to the deliverable's landing page (first TOC entry).
  let file = ref.file;
  if (!file && meta.toc?.length) file = meta.toc[0].a_attr?.href;
  if (!file) throw new Error(`No content file for ${ref.deliverable}`);

  const url = getContentUrl(ref.deliverable, file, ref.locale, docVersion);
  const content = await browser.fetchJsonInPage(url);
  return {
    title: content.title ?? meta.title,
    url,
    source: "atlas",
    version: docVersion,
    html: content.content ?? "",
    markdown: htmlToMarkdown(content.content ?? "", {
      title: content.title ?? meta.title,
      url,
      source: "atlas",
      version: docVersion,
    }),
  };
}

export interface CatalogEntry { deliverable: string; title: string; longId: string; }

export async function listCatalog(browser: BrowserManager): Promise<CatalogEntry[]> {
  const idx = await browser.fetchJsonInPage(getIndexUrl());
  return (idx.content ?? []).map((c: any) => ({ deliverable: c.id, title: c.key, longId: c.value }));
}

export interface TocEntry { id: string; text: string; href?: string; }

export async function fetchToc(browser: BrowserManager, deliverable: string): Promise<TocEntry[]> {
  const meta = await fetchDocumentMeta(browser, deliverable);
  return flattenToc(meta.toc ?? []).map((n) => ({ id: n.id, text: n.text, href: n.a_attr?.href }));
}

export { findHref };
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `cli/`): `npx vitest run test/sources/atlas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/sources/atlas.ts cli/test/sources/atlas.test.ts
git commit -m "feat: atlas source (get_document -> get_document_content, catalog, toc)"
```

---

## Task 9: Component-library source

**Files:**
- Create: `cli/src/sources/component.ts`
- Test: `cli/test/sources/component.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// cli/test/sources/component.test.ts
import { describe, it, expect, vi } from "vitest";
import { fetchComponent, componentUrl } from "../../src/sources/component";

describe("component source", () => {
  it("builds the cx-router URL", () => {
    expect(componentUrl({ namespace: "lightning", name: "button", model: "lwc" })).toBe(
      "https://developer.salesforce.com/cx-router/components?model=lwc&namespace=lightning&component=button",
    );
  });

  it("formats the component JSON into markdown with attributes", async () => {
    const browser = {
      fetchJsonInPage: vi.fn(async () => ({
        response: {
          name: "button", type: "lwc",
          global: { description: "A clickable element used to perform an action.", support: "GA" },
          attributes: [{ name: "iconName", nameInKebabCase: "icon-name", description: "The Lightning Design System name of the icon.", required: false }],
        },
        responseCode: 200,
      })),
    } as any;
    const res = await fetchComponent(browser, { namespace: "lightning", name: "button", model: "lwc" });
    expect(res.title).toBe("lightning-button");
    expect(res.markdown).toContain("A clickable element");
    expect(res.markdown).toContain("icon-name");
    expect(res.source).toBe("component");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/sources/component.test.ts`
Expected: FAIL — cannot find module `../../src/sources/component`.

- [ ] **Step 3: Create `cli/src/sources/component.ts`**

```ts
import type { BrowserManager } from "../browser";
import type { ComponentRef, DocResult } from "../types";

export function componentUrl(ref: ComponentRef): string {
  return `https://developer.salesforce.com/cx-router/components?model=${ref.model}&namespace=${ref.namespace}&component=${ref.name}`;
}

export async function fetchComponent(browser: BrowserManager, ref: ComponentRef): Promise<DocResult> {
  const url = componentUrl(ref);
  const json = await browser.fetchJsonInPage(url);
  const r = json.response ?? {};
  const title = `${ref.namespace}-${ref.name}`;
  const lines = [
    `# ${title}`,
    "",
    `> Source: ${url}`,
    `> Retrieved via sf-docs (component)`,
    "",
    r.global?.description ?? "",
    "",
    "## Attributes",
    "",
    "| Attribute | Required | Description |",
    "| --- | --- | --- |",
    ...(r.attributes ?? []).map(
      (a: any) => `| ${a.nameInKebabCase ?? a.name} | ${a.required ? "yes" : "no"} | ${(a.description ?? "").replace(/\|/g, "\\|")} |`,
    ),
    "",
  ];
  const markdown = lines.join("\n");
  return { title, url, source: "component", version: r.global?.support, html: "", markdown };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `cli/`): `npx vitest run test/sources/component.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/sources/component.ts cli/test/sources/component.test.ts
git commit -m "feat: component-library source (cx-router)"
```

---

## Task 10: Help + release-notes source (render)

**Files:**
- Create: `cli/src/sources/help.ts`
- Test: `cli/test/sources/help.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// cli/test/sources/help.test.ts
import { describe, it, expect, vi } from "vitest";
import { fetchHelp, HELP_ARTICLE_SELECTOR } from "../../src/sources/help";

describe("help source", () => {
  it("renders the article container and converts to markdown", async () => {
    const browser = {
      renderAndExtract: vi.fn(async (_url: string, selector: string) => {
        expect(selector).toBe(HELP_ARTICLE_SELECTOR);
        return { html: "<h1>Sharing Rules</h1><p>Sharing rules let you...</p>", title: "Sharing Rules | Salesforce Help" };
      }),
      renderFull: vi.fn(),
    } as any;
    const res = await fetchHelp(browser, "https://help.salesforce.com/s/articleView?id=platform.security_about_sharing_rules&type=5", "help");
    expect(res.title).toContain("Sharing Rules");
    expect(res.markdown).toContain("Sharing rules let you");
    expect(res.source).toBe("help");
    expect(browser.renderFull).not.toHaveBeenCalled();
  });

  it("falls back to full-page render when the container selector times out", async () => {
    const browser = {
      renderAndExtract: vi.fn(async () => { throw new Error("Timeout"); }),
      renderFull: vi.fn(async () => ({ html: "<main><h1>Notes</h1><p>Body</p></main>", title: "Release Notes" })),
    } as any;
    const res = await fetchHelp(browser, "https://help.salesforce.com/s/articleView?id=release-notes.x&type=5", "release");
    expect(res.markdown).toContain("Body");
    expect(res.source).toBe("release");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/sources/help.test.ts`
Expected: FAIL — cannot find module `../../src/sources/help`.

- [ ] **Step 3: Create `cli/src/sources/help.ts`**

```ts
import type { BrowserManager } from "../browser";
import type { DocResult, Source } from "../types";
import { htmlToMarkdown } from "../markdown";

// The Lightning article body container (pierced via Playwright locator).
export const HELP_ARTICLE_SELECTOR = "article, .slds-rich-text-editor__output, .test-id__article-body, .content";

export async function fetchHelp(browser: BrowserManager, url: string, source: Source): Promise<DocResult> {
  let html: string;
  let title: string;
  try {
    const r = await browser.renderAndExtract(url, HELP_ARTICLE_SELECTOR);
    html = r.html;
    title = r.title;
  } catch {
    // Selector drift / not found -> degrade to full-page render.
    const r = await browser.renderFull(url);
    html = r.html;
    title = r.title;
  }
  const cleanTitle = title.replace(/\s*\|\s*Salesforce.*$/i, "").trim() || title;
  return {
    title: cleanTitle,
    url,
    source,
    html,
    markdown: htmlToMarkdown(html, { title: cleanTitle, url, source }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `cli/`): `npx vitest run test/sources/help.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/sources/help.ts cli/test/sources/help.test.ts
git commit -m "feat: help + release-notes source (render with readability fallback)"
```

---

## Task 11: Trailhead source (render)

**Files:**
- Create: `cli/src/sources/trailhead.ts`
- Test: `cli/test/sources/trailhead.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// cli/test/sources/trailhead.test.ts
import { describe, it, expect, vi } from "vitest";
import { fetchTrailhead, TRAILHEAD_SELECTOR } from "../../src/sources/trailhead";

describe("trailhead source", () => {
  it("renders the unit/module content into markdown", async () => {
    const browser = {
      renderAndExtract: vi.fn(async (_url: string, selector: string) => {
        expect(selector).toBe(TRAILHEAD_SELECTOR);
        return { html: "<h1>Apex Basics</h1><p>Learn the basics of Apex.</p>", title: "Apex Basics | Trailhead" };
      }),
      renderFull: vi.fn(),
    } as any;
    const res = await fetchTrailhead(browser, "https://trailhead.salesforce.com/content/learn/modules/apex_basics_dotnet");
    expect(res.title).toContain("Apex Basics");
    expect(res.markdown).toContain("Learn the basics of Apex.");
    expect(res.source).toBe("trailhead");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/sources/trailhead.test.ts`
Expected: FAIL — cannot find module `../../src/sources/trailhead`.

- [ ] **Step 3: Create `cli/src/sources/trailhead.ts`**

```ts
import type { BrowserManager } from "../browser";
import type { DocResult } from "../types";
import { htmlToMarkdown } from "../markdown";

export const TRAILHEAD_SELECTOR = "main, [data-content], article";

export async function fetchTrailhead(browser: BrowserManager, url: string): Promise<DocResult> {
  let html: string;
  let title: string;
  try {
    const r = await browser.renderAndExtract(url, TRAILHEAD_SELECTOR);
    html = r.html;
    title = r.title;
  } catch {
    const r = await browser.renderFull(url);
    html = r.html;
    title = r.title;
  }
  const cleanTitle = title.replace(/\s*\|\s*Trailhead.*$/i, "").trim() || title;
  return {
    title: cleanTitle,
    url,
    source: "trailhead",
    html,
    markdown: htmlToMarkdown(html, { title: cleanTitle, url, source: "trailhead" }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `cli/`): `npx vitest run test/sources/trailhead.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/sources/trailhead.ts cli/test/sources/trailhead.test.ts
git commit -m "feat: trailhead source (render)"
```

---

## Task 12: Coveo search (Help + release notes)

**Files:**
- Create: `cli/src/coveo.ts`
- Test: `cli/test/coveo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// cli/test/coveo.test.ts
import { describe, it, expect, vi } from "vitest";
import { objectTypeFilter, parseCoveoResults } from "../src/coveo";

describe("coveo helpers", () => {
  it("maps --source to an @objecttype filter", () => {
    expect(objectTypeFilter("help")).toBe('@objecttype==("HelpDocs","KBKnowledgeArticle")');
    expect(objectTypeFilter("release")).toBe('@objecttype==HTReleaseNotesDocumentationC');
  });

  it("parses Coveo results into {title,url,excerpt}", () => {
    const raw = {
      totalCount: 2,
      results: [
        { title: "Sharing Rules", clickUri: "https://help.salesforce.com/Help_DocContent?id=platform.security_about_sharing_rules&language=en_us&release=262.0.0", excerpt: "Sharing rules let you..." },
        { title: "Other", clickUri: "https://help.salesforce.com/s/articleView?id=platform.other", excerpt: "..." },
      ],
    };
    const out = parseCoveoResults(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ title: "Sharing Rules", url: "https://help.salesforce.com/Help_DocContent?id=platform.security_about_sharing_rules&language=en_us&release=262.0.0", excerpt: "Sharing rules let you..." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/coveo.test.ts`
Expected: FAIL — cannot find module `../src/coveo`.

- [ ] **Step 3: Create `cli/src/coveo.ts`**

```ts
import type { BrowserManager } from "./browser";

export type CoveoSource = "help" | "release";

export interface CoveoResult { title: string; url: string; excerpt: string; }

export function objectTypeFilter(source: CoveoSource): string {
  return source === "release"
    ? "@objecttype==HTReleaseNotesDocumentationC"
    : '@objecttype==("HelpDocs","KBKnowledgeArticle")';
}

export function parseCoveoResults(raw: any): CoveoResult[] {
  return (raw?.results ?? []).map((r: any) => ({
    title: r.title ?? "",
    url: r.clickUri ?? "",
    excerpt: (r.excerpt ?? "").trim(),
  }));
}

const SEARCH_PAGE = "https://help.salesforce.com/s/?language=en_US";

/** Scrape the anonymous Coveo access token by observing the search page's network calls. */
export async function scrapeToken(browser: BrowserManager): Promise<string> {
  return browser.captureCoveoToken(SEARCH_PAGE);
}

export async function coveoSearch(
  browser: BrowserManager,
  query: string,
  source: CoveoSource,
  numberOfResults = 10,
): Promise<CoveoResult[]> {
  const token = await scrapeToken(browser);
  const body = {
    q: query,
    searchHub: "HTCommunity",
    aq: objectTypeFilter(source),
    numberOfResults,
  };
  const raw = await browser.postJsonInPage(
    `https://platform.cloud.coveo.com/rest/search/v2?access_token=${encodeURIComponent(token)}`,
    body,
  );
  return parseCoveoResults(raw);
}
```

- [ ] **Step 4: Add the two browser helpers used above**

Add to `cli/src/browser.ts` inside the `BrowserManager` class (these are exercised only by live tests):

```ts
  /** POST JSON from inside a warmed page context. */
  async postJsonInPage(url: string, body: unknown): Promise<any> {
    const page = await this.page();
    try {
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
      await page.goto(searchPageUrl, { waitUntil: "networkidle", timeout: 45_000 });
      // Trigger a search so the token-bearing request fires if it hasn't yet.
      const box = page.locator('input[type="search"], input[placeholder*="Search"]').first();
      if (await box.count()) {
        await box.fill("sharing");
        await box.press("Enter");
        await page.waitForTimeout(3000);
      }
      if (!token) throw new Error("Could not capture Coveo token");
      return token;
    } finally {
      await page.context().close();
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `cli/`): `npx vitest run test/coveo.test.ts`
Expected: PASS (unit helpers). The live search is exercised in Task 18's smoke run.

- [ ] **Step 6: Commit**

```bash
git add cli/src/coveo.ts cli/src/browser.ts cli/test/coveo.test.ts
git commit -m "feat: coveo search for help + release notes (token scrape + filter)"
```

---

## Task 13: Engine orchestrator

The single seam the CLI calls. Routes input to the right source, applies caching.

**Files:**
- Create: `cli/src/engine.ts`
- Test: `cli/test/engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// cli/test/engine.test.ts
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engine } from "../src/engine";

function tmp() { return mkdtempSync(join(tmpdir(), "sf-docs-engine-")); }

describe("Engine.fetch", () => {
  it("routes a help URL to the help source", async () => {
    const browser = {
      renderAndExtract: vi.fn(async () => ({ html: "<h1>X</h1><p>Help body</p>", title: "X" })),
      renderFull: vi.fn(),
      close: vi.fn(),
    } as any;
    const engine = new Engine(browser, { dir: tmp() });
    const res = await engine.fetch("https://help.salesforce.com/s/articleView?id=platform.x&type=5");
    expect(res.source).toBe("help");
    expect(res.markdown).toContain("Help body");
  });

  it("serves a second identical fetch from cache (no second render)", async () => {
    const browser = {
      renderAndExtract: vi.fn(async () => ({ html: "<h1>X</h1><p>Body</p>", title: "X" })),
      renderFull: vi.fn(),
      close: vi.fn(),
    } as any;
    const engine = new Engine(browser, { dir: tmp() });
    const url = "https://help.salesforce.com/s/articleView?id=platform.y&type=5";
    await engine.fetch(url);
    await engine.fetch(url);
    expect(browser.renderAndExtract).toHaveBeenCalledTimes(1);
  });

  it("routes a component URL to the component source", async () => {
    const browser = {
      fetchJsonInPage: vi.fn(async () => ({ response: { name: "button", global: { description: "Click me" }, attributes: [] } })),
      close: vi.fn(),
    } as any;
    const engine = new Engine(browser, { dir: tmp() });
    const res = await engine.fetch("https://developer.salesforce.com/docs/component-library/bundle/lightning-button");
    expect(res.source).toBe("component");
    expect(res.markdown).toContain("Click me");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/engine.test.ts`
Expected: FAIL — cannot find module `../src/engine`.

- [ ] **Step 3: Create `cli/src/engine.ts`**

```ts
import type { BrowserManager } from "./browser";
import type { DocResult } from "./types";
import { route } from "./router";
import { Cache, type CacheOptions } from "./cache";
import { fetchAtlasDoc, listCatalog, fetchToc, type CatalogEntry, type TocEntry } from "./sources/atlas";
import { fetchComponent } from "./sources/component";
import { fetchHelp } from "./sources/help";
import { fetchTrailhead } from "./sources/trailhead";
import { coveoSearch, type CoveoResult, type CoveoSource } from "./coveo";

export class Engine {
  private cache: Cache;
  constructor(private browser: BrowserManager, cacheOpts: CacheOptions = {}) {
    this.cache = new Cache(cacheOpts);
  }

  async fetch(input: string): Promise<DocResult> {
    const r = route(input);
    const cacheKey = `fetch:${r.source}:${r.url}`;
    const cached = this.cache.get<DocResult>(cacheKey);
    if (cached) return cached;

    let result: DocResult;
    switch (r.source) {
      case "atlas":
        if (!r.atlas) throw new Error(`Unparseable Atlas URL: ${input}`);
        result = await fetchAtlasDoc(this.browser, r.atlas);
        break;
      case "component":
        if (!r.component) throw new Error(`Unparseable component URL: ${input}`);
        result = await fetchComponent(this.browser, r.component);
        break;
      case "help":
      case "release":
        result = await fetchHelp(this.browser, r.url, r.source);
        break;
      case "trailhead":
        result = await fetchTrailhead(this.browser, r.url);
        break;
      case "atlas-lwr":
      case "generic":
        result = await fetchTrailhead(this.browser, r.url); // render+extract is the same shape
        result = { ...result, source: r.source };
        break;
      default:
        throw new Error(`Unsupported source for ${input}`);
    }
    this.cache.set(cacheKey, result);
    return result;
  }

  async catalog(grep?: string): Promise<CatalogEntry[]> {
    const key = "catalog";
    let all = this.cache.get<CatalogEntry[]>(key);
    if (!all) {
      all = await listCatalog(this.browser);
      this.cache.set(key, all);
    }
    if (!grep) return all;
    const q = grep.toLowerCase();
    return all.filter((c) => c.deliverable.toLowerCase().includes(q) || c.title.toLowerCase().includes(q));
  }

  async toc(deliverable: string): Promise<TocEntry[]> {
    return fetchToc(this.browser, deliverable);
  }

  async search(query: string, source: CoveoSource): Promise<CoveoResult[]> {
    return coveoSearch(this.browser, query, source);
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `cli/`): `npx vitest run test/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/engine.ts cli/test/engine.test.ts
git commit -m "feat: engine orchestrator (route + cache + source dispatch)"
```

---

## Task 14: CLI entrypoint (Commander)

**Files:**
- Modify: `cli/src/index.ts`
- Create: `cli/src/format.ts`
- Test: `cli/test/format.test.ts`

- [ ] **Step 1: Write the failing test (output formatting is the unit-testable part)**

```ts
// cli/test/format.test.ts
import { describe, it, expect } from "vitest";
import { formatDoc } from "../src/format";

const doc = { title: "What is Apex?", url: "https://x", source: "atlas" as const, version: "262.0", html: "<p>hi</p>", markdown: "# What is Apex?\n\nhi" };

describe("formatDoc", () => {
  it("returns markdown by default", () => {
    expect(formatDoc(doc, "md")).toBe(doc.markdown);
  });
  it("returns html when requested", () => {
    expect(formatDoc(doc, "html")).toBe(doc.html);
  });
  it("returns JSON when requested", () => {
    expect(JSON.parse(formatDoc(doc, "json"))).toMatchObject({ title: "What is Apex?", source: "atlas" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `cli/`): `npx vitest run test/format.test.ts`
Expected: FAIL — cannot find module `../src/format`.

- [ ] **Step 3: Create `cli/src/format.ts`**

```ts
import type { DocResult } from "./types";

export type Format = "md" | "html" | "json";

export function formatDoc(doc: DocResult, format: Format): string {
  if (format === "html") return doc.html;
  if (format === "json") return JSON.stringify(doc, null, 2);
  return doc.markdown;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `cli/`): `npx vitest run test/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `cli/src/index.ts`**

```ts
import { Command } from "commander";
import { BrowserManager } from "./browser";
import { Engine } from "./engine";
import { formatDoc, type Format } from "./format";

// NOTE: Commander maps `--no-cache` to the property `cache` (default true), not `noCache`.
interface GlobalOpts { format: Format; debug?: boolean; cache: boolean; }

function makeEngine(opts: GlobalOpts): Engine {
  const browser = new BrowserManager({ debug: opts.debug });
  return new Engine(browser, { enabled: opts.cache });
}

async function run(fn: (engine: Engine) => Promise<void>, opts: GlobalOpts): Promise<void> {
  const engine = makeEngine(opts);
  try {
    await fn(engine);
  } catch (err) {
    console.error(`sf-docs error: ${(err as Error).message}`);
    process.exitCode = 1;
  } finally {
    await engine.close();
  }
}

const program = new Command();
program
  .name("sf-docs")
  .description("Retrieve clean Salesforce documentation without shadow-DOM/render friction.")
  .option("-f, --format <fmt>", "output format: md | html | json", "md")
  .option("--debug", "run the browser headed with verbose logs", false)
  .option("--no-cache", "bypass the on-disk cache");

program
  .command("fetch <url>")
  .description("Fetch a Salesforce doc page (any of the supported sources) as clean Markdown")
  .action(async (url: string) => {
    const opts = program.opts<GlobalOpts>();
    await run(async (engine) => {
      const doc = await engine.fetch(url);
      console.log(formatDoc(doc, opts.format));
    }, opts);
  });

program
  .command("catalog")
  .description("List developer-docs deliverables (books)")
  .option("--grep <term>", "filter by deliverable id or title")
  .action(async (cmdOpts: { grep?: string }) => {
    const opts = program.opts<GlobalOpts>();
    await run(async (engine) => {
      const entries = await engine.catalog(cmdOpts.grep);
      if (opts.format === "json") console.log(JSON.stringify(entries, null, 2));
      else for (const e of entries) console.log(`${e.deliverable}\t${e.title}`);
    }, opts);
  });

program
  .command("toc <deliverable>")
  .description("Show the table of contents for one deliverable (e.g. apexcode)")
  .action(async (deliverable: string) => {
    const opts = program.opts<GlobalOpts>();
    await run(async (engine) => {
      const entries = await engine.toc(deliverable);
      if (opts.format === "json") console.log(JSON.stringify(entries, null, 2));
      else for (const e of entries) console.log(`${e.href ?? "-"}\t${e.text}`);
    }, opts);
  });

program
  .command("component <namespace> <name>")
  .description("LWC/Aura component reference (e.g. component lightning button)")
  .option("--model <model>", "lwc | aura", "lwc")
  .action(async (namespace: string, name: string, cmdOpts: { model: "lwc" | "aura" }) => {
    const opts = program.opts<GlobalOpts>();
    await run(async (engine) => {
      const doc = await engine.fetch(
        `https://developer.salesforce.com/docs/component-library/bundle/${cmdOpts.model === "aura" ? "aura/" : ""}${namespace}-${name}`,
      );
      console.log(formatDoc(doc, opts.format));
    }, opts);
  });

program
  .command("search <query>")
  .description("Search Salesforce Help or release notes (Coveo)")
  .requiredOption("--source <source>", "help | release")
  .action(async (query: string, cmdOpts: { source: "help" | "release" }) => {
    const opts = program.opts<GlobalOpts>();
    await run(async (engine) => {
      const results = await engine.search(query, cmdOpts.source);
      if (opts.format === "json") console.log(JSON.stringify(results, null, 2));
      else for (const r of results) console.log(`${r.url}\n  ${r.title}\n  ${r.excerpt}\n`);
    }, opts);
  });

program.parseAsync(process.argv);
```

- [ ] **Step 6: Build and smoke-test the CLI wiring (no network)**

Run (from `cli/`): `npm run build && node dist/index.js --help`
Expected: prints usage with `fetch`, `catalog`, `toc`, `component`, `search` commands and the global `--format/--debug/--no-cache` options.

- [ ] **Step 7: Run the full unit suite**

Run (from `cli/`): `npm test`
Expected: all unit tests PASS; live-gated tests SKIPPED.

- [ ] **Step 8: Commit**

```bash
git add cli/src/index.ts cli/src/format.ts cli/test/format.test.ts
git commit -m "feat: commander CLI (fetch/catalog/toc/component/search) + output formatting"
```

---

## Task 15: SKILL.md (shared agent orchestration)

**Files:**
- Create: `.claude/skills/sf-docs/SKILL.md`

- [ ] **Step 1: Create `.claude/skills/sf-docs/SKILL.md`**

```markdown
---
name: sf-docs
description: Retrieve clean, source-grade Salesforce documentation (developer docs, Help, Trailhead, release notes) without shadow-DOM or client-render friction. Use when the user asks about Salesforce, Apex, SOQL/SOSL, LWC/Aura, Metadata/Tooling/REST APIs, admin or setup Help topics, Trailhead content, or what changed in a Salesforce release.
---

# sf-docs — Salesforce documentation retrieval

You have a CLI named `sf-docs` that fetches clean Markdown from Salesforce's
documentation sources. It clears the developer-docs bot-wall and renders the
shadow-DOM Help pages for you, so prefer it over fetching Salesforce URLs directly.

## Invoking the CLI

Run `sf-docs <command>`. If `sf-docs` is not found on PATH, run `npx sf-docs <command>`
(in Claude Code you may also run `node "${CLAUDE_PLUGIN_ROOT}/cli/dist/index.js" <command>`).

## Decision flow

1. **The user gave a documentation URL** → `sf-docs fetch "<url>"`.
2. **Developer reference (Apex, SOQL, LWC, Metadata/REST APIs):**
   - `sf-docs catalog --grep "<topic>"` to find the right book (deliverable).
   - `sf-docs toc <deliverable>` to locate the exact page href.
   - `sf-docs fetch "<deliverable>/<page>.htm"` to retrieve it.
   - For a specific component: `sf-docs component <namespace> <name>` (e.g. `component lightning button`).
3. **Admin / setup / "how do I configure…" (Salesforce Help):**
   - `sf-docs search "<query>" --source help` → `sf-docs fetch "<top result url>"`.
4. **"What changed in <release>" (release notes):**
   - `sf-docs search "<query>" --source release` → `sf-docs fetch "<top result url>"`.
5. **Anything else / unsure** → web-search restricted to the Salesforce doc domains,
   then fetch the best 1–3 URLs:
   `site:developer.salesforce.com OR site:help.salesforce.com OR site:trailhead.salesforce.com <query>`
   then `sf-docs fetch "<url>"` for each.

## Output

Each `fetch` returns Markdown with a provenance header (title, source URL, doc
version). **Always cite that title, URL, and version** when you answer.

## Flags

- `--format md|html|json` (default `md`)
- `--debug` shows the browser (troubleshooting only)
- `--no-cache` forces a fresh fetch
```

- [ ] **Step 2: Verify the frontmatter name matches the directory**

Run: `node -e "const fs=require('fs');const t=fs.readFileSync('.claude/skills/sf-docs/SKILL.md','utf8');if(!/^name:\s*sf-docs\s*$/m.test(t))throw new Error('name mismatch');console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/sf-docs/SKILL.md
git commit -m "feat: shared SKILL.md orchestration (Claude Code + Copilot)"
```

---

## Task 16: Claude Code plugin manifest + marketplace

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "sf-doc-search",
  "version": "0.1.0",
  "description": "Retrieve clean Salesforce documentation (dev docs, Help, Trailhead, release notes) without shadow-DOM/render friction.",
  "author": { "name": "ehartye" },
  "homepage": "https://github.com/ehartye/sf-doc-search",
  "repository": "https://github.com/ehartye/sf-doc-search",
  "license": "MIT",
  "keywords": ["salesforce", "documentation", "apex", "lwc", "trailhead"],
  "skills": ["./.claude/skills"]
}
```

- [ ] **Step 2: Create `.claude-plugin/marketplace.json`**

```json
{
  "name": "ehartye-plugins",
  "owner": { "name": "ehartye" },
  "plugins": [
    {
      "name": "sf-doc-search",
      "source": "./",
      "description": "Clean Salesforce documentation retrieval for Claude Code and GitHub Copilot.",
      "version": "0.1.0",
      "author": { "name": "ehartye" }
    }
  ]
}
```

- [ ] **Step 3: Validate JSON**

Run: `node -e "require('./.claude-plugin/plugin.json');require('./.claude-plugin/marketplace.json');console.log('valid')"`
Expected: prints `valid`.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/
git commit -m "feat: claude code plugin manifest + marketplace (points at shared skills)"
```

---

## Task 17: Claude `bin/` launcher (best-effort PATH nicety)

This is the optional Claude-only enhancement from the spec. The portable invocation
remains `sf-docs` (npm global) / `npx sf-docs`; this just lets a Claude user run the
bundled CLI without a global install.

**Files:**
- Create: `bin/sf-docs`

- [ ] **Step 1: Create `bin/sf-docs`**

```sh
#!/usr/bin/env node
import("../cli/dist/index.js");
```

- [ ] **Step 2: Mark it executable (POSIX) and verify it launches the built CLI**

Run (from repo root, after `cd cli && npm run build && cd ..`):
`chmod +x bin/sf-docs && node bin/sf-docs --help`
Expected: prints the CLI usage. (On Windows, `node bin/sf-docs --help` works without chmod; PATH-shim behavior is handled by Claude's plugin loader. If the bundled path differs at install time, users fall back to `npx sf-docs`.)

- [ ] **Step 3: Commit**

```bash
git add bin/sf-docs
git commit -m "feat: optional bin launcher for the bundled CLI (Claude PATH nicety)"
```

---

## Task 18: README + end-to-end live smoke + final verification

**Files:**
- Create: `README.md`
- Create: `LICENSE` (MIT)

- [ ] **Step 1: Create `LICENSE`** (MIT, author `ehartye`, year 2026 — use the standard MIT text).

- [ ] **Step 2: Create `README.md`**

```markdown
# sf-doc-search

Clean Salesforce documentation retrieval for AI coding agents — one plugin for
both **Claude Code** and **GitHub Copilot** (no MCP). A Node CLI (`sf-docs`)
clears the developer-docs bot-wall and renders the shadow-DOM Help pages, so the
agent gets real Markdown instead of empty bodies or shadow-DOM soup.

## What it retrieves

- **Developer docs** (Apex, SOQL, LWC/Aura, Metadata/REST/Tooling APIs) via the
  Atlas JSON API.
- **Salesforce Help** (admin/setup) via headless render.
- **Release notes** via headless render + Coveo search.
- **Trailhead** modules/units via render.

## Requirements

- Node.js 20+.
- Google Chrome installed (preferred). If absent, run `npx playwright install chromium`.

## Install — Claude Code

```
/plugin marketplace add ehartye/sf-doc-search
/plugin install sf-doc-search
```

Then build the bundled CLI once (or `npm i -g sf-docs`):

```
cd cli && npm install && npm run build
```

## Install — GitHub Copilot / VS Code

1. Install the CLI: `npm i -g sf-docs` (or rely on `npx sf-docs`).
2. Place this repo's `.claude/skills/sf-docs/` in your workspace (Copilot
   auto-discovers `.claude/skills/`).

## CLI usage

```
sf-docs fetch "<url>"                       # any supported source -> Markdown
sf-docs catalog --grep apex                 # find a dev-docs book
sf-docs toc apexcode                        # table of contents for a book
sf-docs component lightning button          # LWC component reference
sf-docs search "sharing rules" --source help
```

Flags: `--format md|html|json`, `--debug` (headed browser), `--no-cache`.

## Development

```
cd cli
npm install
npm test                 # unit tests (offline)
SF_DOCS_LIVE=1 npm test  # also run live network tests
npm run build
```
```

- [ ] **Step 3: Run the complete unit suite + typecheck + build**

Run (from `cli/`): `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all unit tests PASS (live SKIPPED); build emits `dist/index.js`.

- [ ] **Step 4: Live end-to-end smoke (requires Chrome + network)**

Run (from `cli/`, after build):
```
node dist/index.js fetch "https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_intro_what_is_apex.htm"
node dist/index.js catalog --grep apex
node dist/index.js search "sharing rules" --source help
```
Expected: the first prints Markdown with `# What is Apex?` and a fenced code block; `catalog` lists `apexcode  Apex Developer Guide` (among others); `search` prints ranked Help URLs. If any source's selector/endpoint has drifted, re-run with `--debug` to inspect, and adjust the relevant `sources/*.ts` selector. Per @h-superpowers:verification-before-completion, paste this real output into the task report — do not claim success without it.

- [ ] **Step 5: Commit**

```bash
git add README.md LICENSE
git commit -m "docs: README + MIT license; verified end-to-end smoke"
```

---

## Done

After Task 18, the repo provides: a tested `sf-docs` CLI (npm-publishable from `cli/`),
a shared `SKILL.md` auto-discovered by both Claude Code and Copilot, a Claude plugin
manifest + marketplace, and an optional `bin/` launcher. To publish the CLI:
`cd cli && npm publish` (after `npm run build`).

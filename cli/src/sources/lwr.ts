import type { TocEntry } from "./atlas";
import type { BrowserManager } from "../browser";
import type { DocResult } from "../types";
import { htmlToMarkdown } from "../markdown";

export interface LwrCatalogEntry {
  id: string;    // "<area>/<guide>", e.g. "ai/agentforce"
  title: string; // anchor text of the first link seen for this guide
  url: string;   // https://developer.salesforce.com/docs/<area>/<guide>
}

const DEV_ORIGIN = "https://developer.salesforce.com";
const ANCHOR = /<a[^>]*href="(\/docs\/([a-z0-9-]+)\/([a-z0-9-]+)[^"#?]*)"[^>]*>([\s\S]*?)<\/a>/gi;
// The /docs/apis directory renders links on web components (<dx-card-docs>, <dx-button>),
// NOT <a> tags (verified live). Match the href on any element; a card's `header` attribute
// carries the guide title.
const HREF_ELEMENT = /<([a-z][a-z0-9-]*)\b[^>]*?href="(\/docs\/([a-z0-9-]+)\/([a-z0-9-]+)[^"#?]*)"[^>]*>/gi;

function anchorText(inner: string): string {
  return inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract unique <area>/<guide> roots from the /docs/apis directory page's raw SSR HTML. */
export function parseLwrCatalog(html: string): LwrCatalogEntry[] {
  // Title candidates per guide id: a `header="..."` attribute (dx-card-docs) beats
  // anchor inner text, which beats the id itself.
  const headers = new Map<string, string>();
  const seen = new Map<string, LwrCatalogEntry>();

  for (const m of html.matchAll(HREF_ELEMENT)) {
    const [full, , , area, guide] = m;
    const id = `${area}/${guide}`;
    const header = /\bheader="([^"]+)"/i.exec(full)?.[1];
    if (header && !headers.has(id)) headers.set(id, header);
    if (!seen.has(id)) seen.set(id, { id, title: id, url: `${DEV_ORIGIN}/docs/${id}` });
  }
  for (const m of html.matchAll(ANCHOR)) {
    const [, , area, guide, inner] = m;
    const id = `${area}/${guide}`;
    const text = anchorText(inner);
    if (text && !headers.has(id)) headers.set(id, text);
    if (!seen.has(id)) seen.set(id, { id, title: id, url: `${DEV_ORIGIN}/docs/${id}` });
  }
  for (const e of seen.values()) e.title = headers.get(e.id) ?? e.id;
  return [...seen.values()];
}

/** Extract the guide nav (deduped by href) from any guide page's raw SSR HTML. */
export function parseLwrToc(html: string, guidePath: string): TocEntry[] {
  const re = new RegExp(`<a[^>]*href="(/docs/${escapeRegExp(guidePath)}/[^"#?]*)"[^>]*>([\\s\\S]*?)</a>`, "gi");
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

/** Notable LWR doc sets NOT listed on /docs/apis (it enumerates API doc sets only).
 *  Verified live 2026-07-02. Additive: a parsed entry with the same id wins. */
export const LWR_SEED_ROOTS: Array<{ id: string; title: string }> = [
  { id: "ai/agentforce", title: "Agentforce Developer Guide" },
  { id: "platform/lwc", title: "Lightning Web Components Developer Guide" },
  { id: "platform/mobile-sdk", title: "Mobile SDK Development Guide" },
];

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

/**
 * target: "<area>/<guide>" shorthand or a full /docs/... URL.
 * The LWR nav is hierarchical: a page's SSR HTML carries only its local nav level
 * (top-level sections at a guide root, sibling/child pages deeper in). To explore,
 * drill down — run toc again on an entry's URL to expand that section. Scope follows
 * the given depth: a section target (ai/agentforce/guide) matches that section's
 * links; a bare guide root (ai/agentforce) makes links from any section eligible.
 */
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

/**
 * Breadth-first expansion of the hierarchical LWR nav: fetch the target's toc,
 * then fetch each new entry's page and merge its scoped toc, `depth` levels deep.
 * Deduped by href; a discovered entry is expanded at most once (the target itself
 * may be re-fetched if its nav self-links). A child page whose nav yields nothing
 * (leaf) is skipped silently; any OTHER failure (HTTP error, dead docs page) is
 * surfaced as a warning so a systemic mid-run failure can't masquerade as leaves.
 * Hard cap guards against runaway guides.
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
      } catch (err) {
        // Leaf pages throw fetchLwrToc's zero-entries sentinel — that's expected.
        // Anything else (HTTP error, crashed docs page) must not hide behind it.
        if (!/No TOC links parsed/.test((err as Error).message)) {
          console.error(`sf-docs warning: skipping ${entry.href}: ${(err as Error).message}`);
        }
        continue;
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

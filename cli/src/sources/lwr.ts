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

function anchorText(inner: string): string {
  return inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

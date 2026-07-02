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

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

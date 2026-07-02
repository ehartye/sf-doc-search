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
  allResults = false,
): Promise<CoveoResult[]> {
  const token = await scrapeToken(browser);
  const fetchCount = allResults ? numberOfResults : numberOfResults * 3; // overfetch to survive filtering
  const body = {
    q: query,
    searchHub: "HTCommunity",
    aq: objectTypeFilter(source),
    numberOfResults: fetchCount,
  };
  // Use the Salesforce-proxied Coveo search endpoint (same-origin to help.salesforce.com,
  // which postJsonInPage warms first). The token's platformUri points here, not to
  // platform.cloud.coveo.com directly.
  const raw = await browser.postJsonInPage(
    `https://help.salesforce.com/services/apexrest/coveo/analytics/rest/search/v2?organizationId=org62salesforce&access_token=${encodeURIComponent(token)}`,
    body,
  );
  const results = parseCoveoResults(raw);
  if (allResults) return results;
  const filtered = filterOfficial(results);
  if (filtered.length === 0 && results.length > 0) {
    console.error(`sf-docs warning: all ${results.length} results were non-official or localized — use --all-results to see them`);
  }
  return filtered.slice(0, numberOfResults);
}

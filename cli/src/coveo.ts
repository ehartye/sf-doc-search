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
  // Use the Salesforce-proxied Coveo search endpoint (same-origin to help.salesforce.com,
  // which postJsonInPage warms first). The token's platformUri points here, not to
  // platform.cloud.coveo.com directly.
  const raw = await browser.postJsonInPage(
    `https://help.salesforce.com/services/apexrest/coveo/analytics/rest/search/v2?organizationId=org62salesforce&access_token=${encodeURIComponent(token)}`,
    body,
  );
  return parseCoveoResults(raw);
}

import { describe, it, expect, vi } from "vitest";
import { objectTypeFilter, parseCoveoResults, filterOfficial } from "../src/coveo";

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

describe("coveoSearch overfetch", () => {
  it("requests extra results when filtering, and slices back to the requested count", async () => {
    let requested = 0;
    const raw = {
      results: Array.from({ length: 30 }, (_, i) => ({
        title: `t${i}`,
        clickUri: i % 2 === 0
          ? `https://help.salesforce.com/Help_DocContent?id=a${i}&language=en_us`
          : `https://orgcs.my.salesforce.com/x${i}`,
        excerpt: "e",
      })),
    };
    const browser = {
      captureCoveoToken: async () => "tok",
      postJsonInPage: async (_u: string, body: any) => { requested = body.numberOfResults; return raw; },
    } as any;
    const { coveoSearch } = await import("../src/coveo");
    const results = await coveoSearch(browser, "q", "help");
    expect(requested).toBe(30);           // 3x overfetch in filtering mode
    expect(results).toHaveLength(10);     // sliced back to the requested count
    expect(results.every((r) => r.url.includes("help.salesforce.com"))).toBe(true);
  });
  it("does NOT overfetch in --all-results mode", async () => {
    let requested = 0;
    const browser = {
      captureCoveoToken: async () => "tok",
      postJsonInPage: async (_u: string, body: any) => { requested = body.numberOfResults; return { results: [] }; },
    } as any;
    const { coveoSearch } = await import("../src/coveo");
    await coveoSearch(browser, "q", "help", 10, true);
    expect(requested).toBe(10);
  });
});

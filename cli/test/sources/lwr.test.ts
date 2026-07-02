import { describe, it, expect } from "vitest";
import { parseLwrCatalog, parseLwrToc, cleanLwrTitle } from "../../src/sources/lwr";

const CATALOG_FIXTURE = `
<html><body>
<a href="/docs/marketing/pardot/overview">Marketing Cloud Account Engagement</a>
<a href="/docs/marketing/pardot/guide">Guide</a>
<a href="/docs/commerce/commerce-api/overview">Commerce API</a>
<a href="/docs/ai/agentforce/overview"><span>Agentforce</span></a>
<a href="/docs/ai/agentforce/guide/agent-api.html">deep link same guide root</a>
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
    expect(ids.filter((i) => i === "marketing/pardot")).toHaveLength(1);
    expect(ids.filter((i) => i === "ai/agentforce")).toHaveLength(1);
    expect(ids.some((i) => i.includes("blogs") || i === "onlyonesegment")).toBe(false);
    const pardot = entries.find((e) => e.id === "marketing/pardot")!;
    expect(pardot.title).toBe("Marketing Cloud Account Engagement");
    expect(pardot.url).toBe("https://developer.salesforce.com/docs/marketing/pardot");
  });
  it("returns [] on link-free HTML", () => {
    expect(parseLwrCatalog("<html><body>redesigned</body></html>")).toEqual([]);
  });
  it("extracts entries from web-component cards (the real /docs/apis markup — no <a> tags)", () => {
    // Live /docs/apis renders links on <dx-card-docs>/<dx-button>, not anchors.
    const html = `
      <dx-card-docs
        href="/docs/marketing/pardot/overview"
        header="Account Engagement API"
        body="Extend your B2B marketing efforts."
        label="API"
      >
        <dx-button href="/docs/marketing/pardot/overview" variant="inline">Overview</dx-button>
        <dx-button href="/docs/marketing/pardot/guide" variant="inline">Guide</dx-button>
      </dx-card-docs>
      <dx-card-docs href="/docs/ai/agentforce/overview" header="Agentforce"></dx-card-docs>`;
    const entries = parseLwrCatalog(html);
    expect(entries.map((e) => e.id).sort()).toEqual(["ai/agentforce", "marketing/pardot"]);
    // The card's header attribute wins over the child button labels ("Overview"/"Guide").
    expect(entries.find((e) => e.id === "marketing/pardot")!.title).toBe("Account Engagement API");
    expect(entries.find((e) => e.id === "ai/agentforce")!.title).toBe("Agentforce");
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
    expect(toc[1].text).toBe("Get Started");
    expect(toc.some((t) => t.href?.includes("/references/") || t.href?.includes("einstein"))).toBe(false);
  });
  it("tolerates regex metacharacters in guidePath (no crash, no false match)", () => {
    expect(() => parseLwrToc(TOC_FIXTURE, "ai/agentforce(evil")).not.toThrow();
    expect(parseLwrToc(TOC_FIXTURE, "ai/agentforce(evil")).toEqual([]);
    expect(parseLwrToc(TOC_FIXTURE, "ai/[agentforce")).toEqual([]);
    // sanity: the legitimate path still works after the fix
    expect(parseLwrToc(TOC_FIXTURE, "ai/agentforce/guide")).toHaveLength(2);
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

import { fetchLwr, listLwrCatalog, fetchLwrToc, fetchLwrTocDeep } from "../../src/sources/lwr";

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
    expect(doc.markdown).toMatch(/> Retrieved: \d{4}-\d{2}-\d{2} via sf-docs \(lwr\)/);
  });
  it("falls back to renderFull when the selector extraction fails", async () => {
    const browser = {
      renderAndExtract: async () => { throw new Error("selector timeout"); },
      renderFull: async () => ({ html: "<p>Fallback body.</p>", title: "T | Salesforce Developers" }),
    } as any;
    const doc = await fetchLwr(browser, "https://developer.salesforce.com/docs/ai/agentforce/guide/x.html");
    expect(doc.title).toBe("T");
    expect(doc.html).toContain("Fallback body");
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
    expect(entries).toContainEqual(
      { id: "ai/agentforce", title: "Agentforce", url: "https://developer.salesforce.com/docs/ai/agentforce" },
    );
  });
  it("throws (not empty) when the page parses to zero entries", async () => {
    const browser = { fetchTextInPage: async () => "<html>redesigned</html>" } as any;
    await expect(listLwrCatalog(browser)).rejects.toThrow(/docs\/apis/);
  });
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
  it("a bare guide-root URL makes links from any section eligible (scope = guide root)", async () => {
    const browser = {
      fetchTextInPage: async () =>
        '<a href="/docs/ai/agentforce/guide/x.html">X</a><a href="/docs/ai/agentforce/references/r.html">R</a>',
    } as any;
    const toc = await fetchLwrToc(browser, "https://developer.salesforce.com/docs/ai/agentforce");
    expect(toc).toHaveLength(2); // both sections' links pass the root scope (nav itself is hierarchical)
  });
});

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

  it("warns on systemic child failures (HTTP errors) but stays silent on leaf pages", async () => {
    const failing = {
      fetchTextInPage: async (u: string) => {
        if (u.endsWith("/s1.html")) throw new Error("HTTP 500 for " + u); // systemic
        return NAVS[u] ?? "<html></html>"; // s2 ok; s2-child is a silent leaf
      },
    } as any;
    const warnings: string[] = [];
    const orig = console.error;
    console.error = (m: string) => { warnings.push(String(m)); };
    try {
      const toc = await fetchLwrTocDeep(failing, "ai/agentforce/guide", 3);
      expect(toc.map((t) => t.text).sort()).toEqual(["S1", "S2", "S2 Child"]);
      // the HTTP failure is surfaced...
      expect(warnings.some((w) => w.includes("HTTP 500") && w.includes("s1.html"))).toBe(true);
      // ...but the leaf page (No TOC links parsed) is not
      expect(warnings.some((w) => w.includes("s2-child"))).toBe(false);
    } finally {
      console.error = orig;
    }
  });
});

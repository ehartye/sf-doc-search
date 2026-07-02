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

import { fetchLwr, listLwrCatalog, fetchLwrToc } from "../../src/sources/lwr";

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
    expect(doc.markdown).toContain("> Retrieved via sf-docs (lwr)");
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
    expect(entries).toEqual([
      { id: "ai/agentforce", title: "Agentforce", url: "https://developer.salesforce.com/docs/ai/agentforce" },
    ]);
  });
  it("throws (not empty) when the page parses to zero entries", async () => {
    const browser = { fetchTextInPage: async () => "<html>redesigned</html>" } as any;
    await expect(listLwrCatalog(browser)).rejects.toThrow(/docs\/apis/);
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
  it("a bare guide-root URL yields the whole doc-set TOC (all sections)", async () => {
    const browser = {
      fetchTextInPage: async () =>
        '<a href="/docs/ai/agentforce/guide/x.html">X</a><a href="/docs/ai/agentforce/references/r.html">R</a>',
    } as any;
    const toc = await fetchLwrToc(browser, "https://developer.salesforce.com/docs/ai/agentforce");
    expect(toc).toHaveLength(2); // scope is the guide root, so every section is included
  });
});

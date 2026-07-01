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

  it("falls back to the first TOC node with an href when ref.file is absent", async () => {
    const browser = fakeBrowser({
      "get_document/atlas.en-us.apexcode.meta": {
        title: "Apex Developer Guide",
        deliverable: "apexcode",
        version: { doc_version: "262.0" },
        toc: [{ id: "root", text: "Guide", children: [{ id: "intro", text: "Intro", a_attr: { href: "intro.htm" } }] }],
      },
      "get_document_content/apexcode/intro.htm/en-us/262.0": { title: "Intro", content: "<p>Body</p>" },
    });
    const res = await fetchAtlasDoc(browser, { longId: "atlas.en-us.apexcode.meta", deliverable: "apexcode", locale: "en-us" });
    expect(res.url).toContain("/intro.htm/");
    expect(res.markdown).toContain("Body");
  });

  it("uses meta.title when the content title is an empty string", async () => {
    const browser = fakeBrowser({
      "get_document/atlas.en-us.apexcode.meta": { title: "Apex Developer Guide", deliverable: "apexcode", version: { doc_version: "262.0" }, toc: [{ id: "x", text: "X", a_attr: { href: "x.htm" } }] },
      "get_document_content/apexcode/x.htm/en-us/262.0": { title: "", content: "<p>hi</p>" },
    });
    const res = await fetchAtlasDoc(browser, { longId: "atlas.en-us.apexcode.meta", deliverable: "apexcode", locale: "en-us" });
    expect(res.title).toBe("Apex Developer Guide");
  });
});

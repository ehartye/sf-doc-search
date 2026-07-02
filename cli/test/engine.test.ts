import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engine } from "../src/engine";

function tmp() { return mkdtempSync(join(tmpdir(), "sf-docs-engine-")); }

describe("Engine.fetch", () => {
  it("routes a help URL to the help source", async () => {
    const browser = {
      renderAndExtract: vi.fn(async () => ({ html: "<h1>X</h1><p>Help body</p>", title: "X" })),
      renderFull: vi.fn(),
      close: vi.fn(),
    } as any;
    const engine = new Engine(browser, { dir: tmp() });
    const res = await engine.fetch("https://help.salesforce.com/s/articleView?id=platform.x&type=5");
    expect(res.source).toBe("help");
    expect(res.markdown).toContain("Help body");
  });

  it("serves a second identical fetch from cache (no second render)", async () => {
    const browser = {
      renderAndExtract: vi.fn(async () => ({ html: "<h1>X</h1><p>Body</p>", title: "X" })),
      renderFull: vi.fn(),
      close: vi.fn(),
    } as any;
    const engine = new Engine(browser, { dir: tmp() });
    const url = "https://help.salesforce.com/s/articleView?id=platform.y&type=5";
    await engine.fetch(url);
    await engine.fetch(url);
    expect(browser.renderAndExtract).toHaveBeenCalledTimes(1);
  });

  it("routes a component URL to the component source", async () => {
    const browser = {
      fetchJsonInPage: vi.fn(async () => ({ response: { name: "button", global: { description: "Click me" }, attributes: [] } })),
      close: vi.fn(),
    } as any;
    const engine = new Engine(browser, { dir: tmp() });
    const res = await engine.fetch("https://developer.salesforce.com/docs/component-library/bundle/lightning-button");
    expect(res.source).toBe("component");
    expect(res.markdown).toContain("Click me");
  });
});

describe("lwr integration", () => {
  it("fetch dispatches lwr URLs to the lwr fetcher (provenance says lwr)", async () => {
    const browser = {
      renderAndExtract: async () => ({ html: "<p>Some LWR doc body text.</p>", title: "T | G | Salesforce Developers" }),
    } as any;
    const engine = new Engine(browser, { enabled: false });
    const doc = await engine.fetch("https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api.html");
    expect(doc.source).toBe("lwr");
    expect(doc.title).toBe("T");
    expect(doc.markdown).toContain("(lwr)");
  });

  it("catalog merges atlas and lwr entries with platform tags", async () => {
    const browser = {
      fetchJsonInPage: async () => ({
        content: [{ id: "atlas.en-us.262.0.apexcode.meta", key: "en-us", value: { deliverable: "apexcode", title: "Apex Developer Guide" } }],
      }),
      fetchTextInPage: async () => '<a href="/docs/ai/agentforce/overview">Agentforce</a>',
    } as any;
    const engine = new Engine(browser, { enabled: false });
    const all = await engine.catalog();
    expect(all).toContainEqual({ deliverable: "apexcode", title: "Apex Developer Guide", longId: "atlas.en-us.262.0.apexcode.meta", platform: "atlas" });
    expect(all).toContainEqual({ deliverable: "ai/agentforce", title: "Agentforce", longId: "https://developer.salesforce.com/docs/ai/agentforce", platform: "lwr" });
    expect(await engine.catalog("agentforce")).toHaveLength(1);
  });

  it("toc dispatches slash-targets to lwr and bare words to atlas", async () => {
    const browser = {
      fetchTextInPage: async () => '<a href="/docs/ai/agentforce/guide/x.html">X</a>',
      fetchJsonInPage: async () => ({ title: "Apex", toc: [{ id: "n1", text: "Intro", a_attr: { href: "intro.htm" } }] }),
    } as any;
    const engine = new Engine(browser, { enabled: false });
    expect((await engine.toc("ai/agentforce/guide"))[0].text).toBe("X");
    expect((await engine.toc("apexcode"))[0].text).toBe("Intro");
  });
});

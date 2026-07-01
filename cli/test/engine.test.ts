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

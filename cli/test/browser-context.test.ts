import { describe, it, expect, vi, beforeEach } from "vitest";

// Counters exposed by the playwright mock (hoisted access via vi.hoisted).
const state = vi.hoisted(() => ({
  launches: 0,
  contexts: 0,
  failNextGoto: false,
  pages: [] as Array<{ gotos: string[]; closed: boolean }>,
}));

vi.mock("playwright", () => {
  const makePage = () => {
    const p = { gotos: [] as string[], closed: false };
    state.pages.push(p);
    return {
      goto: async (u: string) => {
        if (state.failNextGoto) { state.failNextGoto = false; throw new Error("goto timeout"); }
        p.gotos.push(u);
      },
      evaluate: async (_fn: any, arg?: any) => `evaluated:${JSON.stringify(arg ?? null)}`,
      close: async () => { p.closed = true; },
      isClosed: () => p.closed,
      context: () => ({ close: async () => {} }),
      title: async () => "t",
      content: async () => "<html></html>",
      locator: () => ({ first: () => ({ waitFor: async () => {}, innerText: async () => "x".repeat(200), evaluate: async () => "<p>x</p>" }) }),
      waitForTimeout: async () => {},
      on: () => {},
    };
  };
  return {
    chromium: {
      launch: async () => {
        state.launches++;
        return {
          newContext: async () => {
            state.contexts++;
            return { newPage: async () => makePage(), close: async () => {} };
          },
          close: async () => {},
          version: () => "test",
        };
      },
    },
  };
});

import { BrowserManager } from "../src/browser";

beforeEach(() => { state.launches = 0; state.contexts = 0; state.failNextGoto = false; state.pages.length = 0; });

describe("shared browser context", () => {
  it("N page-context fetches share one launch, one context, one warmup navigation", async () => {
    const bm = new BrowserManager({});
    await bm.fetchJsonInPage("https://developer.salesforce.com/docs/a");
    await bm.fetchTextInPage("https://developer.salesforce.com/docs/b");
    await bm.fetchJsonInPage("https://developer.salesforce.com/docs/c");
    await bm.close();
    expect(state.launches).toBe(1);
    expect(state.contexts).toBe(1);
    // exactly one page did the warmup goto, and only once
    const gotos = state.pages.flatMap((p) => p.gotos);
    expect(gotos).toEqual(["https://developer.salesforce.com/docs"]);
  });

  it("render calls open their own page in the shared context and close it", async () => {
    const bm = new BrowserManager({});
    await bm.renderFull("https://example.com/x");
    await bm.renderFull("https://example.com/y");
    await bm.close();
    expect(state.contexts).toBe(1);
    const renderPages = state.pages.filter((p) => p.gotos.some((g) => g.includes("example.com")));
    expect(renderPages).toHaveLength(2);
    expect(renderPages.every((p) => p.closed)).toBe(true);
  });

  it("a failed warmup does not poison the docs page — the next fetch re-warms", async () => {
    const bm = new BrowserManager({});
    state.failNextGoto = true;
    await expect(bm.fetchJsonInPage("https://developer.salesforce.com/docs/a")).rejects.toThrow("goto timeout");
    // recovery: the next call creates a fresh page and warms successfully
    const out = await bm.fetchJsonInPage("https://developer.salesforce.com/docs/a");
    expect(out).toContain("evaluated");
    const gotos = state.pages.flatMap((p) => p.gotos);
    expect(gotos).toEqual(["https://developer.salesforce.com/docs"]); // exactly one SUCCESSFUL warmup
    // the failed page was closed, not leaked
    expect(state.pages.filter((p) => p.closed)).toHaveLength(1);
    await bm.close();
  });

  it("interleaved render calls do not disturb the persistent docs page", async () => {
    const bm = new BrowserManager({});
    await bm.fetchJsonInPage("https://developer.salesforce.com/docs/a");
    await bm.renderFull("https://example.com/x");
    await bm.fetchTextInPage("https://developer.salesforce.com/docs/b");
    await bm.close();
    const warmups = state.pages.flatMap((p) => p.gotos).filter((g) => g === "https://developer.salesforce.com/docs");
    expect(warmups).toHaveLength(1);
  });
});

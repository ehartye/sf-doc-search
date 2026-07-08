import { describe, it, expect } from "vitest";
import { resolveLaunch, BrowserManager } from "../src/browser";

describe("resolveLaunch", () => {
  it("is headless by default", () => {
    expect(resolveLaunch({}).headless).toBe(true);
  });
  it("is headed in debug mode", () => {
    expect(resolveLaunch({ debug: true }).headless).toBe(false);
  });
  it("prefers the system chrome channel", () => {
    expect(resolveLaunch({}).channel).toBe("chrome");
  });
});

describe.skipIf(!process.env.SF_DOCS_LIVE)("BrowserManager (live)", () => {
  it("fetches JSON from inside a developer.salesforce.com page (clears Akamai)", async () => {
    const bm = new BrowserManager({});
    try {
      const json = await bm.fetchJsonInPage(
        "https://developer.salesforce.com/docs/get_document/atlas.en-us.apexcode.meta",
      );
      expect(json.title).toMatch(/Apex/i);
      expect(Array.isArray(json.toc)).toBe(true);
    } finally {
      await bm.close();
    }
  }, 60_000);

  it("captures a Knowledge Article record via Aura XHR intercept (type=1)", async () => {
    const bm = new BrowserManager({});
    try {
      const record = await bm.captureArticleRecord(
        "https://help.salesforce.com/s/articleView?id=000383103&type=1&language=en_US",
      );
      expect(record.title).toMatch(/Automated Process/i);
      expect(typeof record.resolution).toBe("string");
    } finally {
      await bm.close();
    }
  }, 60_000);
});

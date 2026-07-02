import { describe, it, expect, vi } from "vitest";
import { fetchHelp, HELP_ARTICLE_SELECTOR, stripHelpBoilerplate } from "../../src/sources/help";

describe("help source", () => {
  it("renders the article container and converts to markdown", async () => {
    const browser = {
      renderAndExtract: vi.fn(async (_url: string, selector: string) => {
        expect(selector).toBe(HELP_ARTICLE_SELECTOR);
        return { html: "<h1>Sharing Rules</h1><p>Sharing rules let you...</p>", title: "Sharing Rules | Salesforce Help" };
      }),
      renderFull: vi.fn(),
    } as any;
    const res = await fetchHelp(browser, "https://help.salesforce.com/s/articleView?id=platform.security_about_sharing_rules&type=5", "help");
    expect(res.title).toContain("Sharing Rules");
    expect(res.markdown).toContain("Sharing rules let you");
    expect(res.source).toBe("help");
    expect(browser.renderFull).not.toHaveBeenCalled();
  });

  it("falls back to full-page render when the container selector times out", async () => {
    const browser = {
      renderAndExtract: vi.fn(async () => { throw new Error("Timeout"); }),
      renderFull: vi.fn(async () => ({ html: "<main><h1>Notes</h1><p>Body</p></main>", title: "Release Notes" })),
    } as any;
    const res = await fetchHelp(browser, "https://help.salesforce.com/s/articleView?id=release-notes.x&type=5", "release");
    expect(res.markdown).toContain("Body");
    expect(res.source).toBe("release");
  });

  it("records the release from the articleView URL as the doc version", async () => {
    const browser = { renderAndExtract: async () => ({ html: "<p>Body text.</p>", title: "T | Salesforce" }) } as any;
    const doc = await fetchHelp(
      browser,
      "https://help.salesforce.com/s/articleView?id=ai.x.htm&type=5&language=en_US&release=262.0.0",
      "help",
    );
    expect(doc.version).toBe("262.0.0");
    expect(doc.markdown).toContain("> Version: 262.0.0");
  });

  it("fetchHelp strips boilerplate before conversion", async () => {
    const browser = {
      renderAndExtract: async () => ({
        html: '<div>You are here: <ol><li>Docs</li></ol></div><p>Body text that matters.</p>',
        title: "T | Salesforce",
      }),
    } as any;
    const doc = await fetchHelp(browser, "https://help.salesforce.com/s/articleView?id=x.htm", "help");
    expect(doc.markdown).not.toContain("You are here");
    expect(doc.markdown).toContain("Body text that matters.");
  });
});

describe("stripHelpBoilerplate", () => {
  it("removes breadcrumbs, editions/permissions tables, headings, and note icons", () => {
    const html = `
      <div>You are here: <ol><li><a href="/">Salesforce Help</a></li><li>Docs</li></ol></div>
      <h3>Required Editions</h3>
      <table><tr><td>Available in: Lightning Experience</td></tr></table>
      <table><tr><th>User Permissions Needed</th></tr><tr><td>To create: X</td></tr></table>
      <img src="https://cdn/images/icon_note_important.png" alt="Important">
      <img src="https://cdn/images/icon_important.png" alt="Important">
      <img src="https://cdn/images/icon_white.png" alt="">
      <p>Real content stays.</p>
      <table><tr><th>Feature</th></tr><tr><td>Real table stays</td></tr></table>`;
    const out = stripHelpBoilerplate(html);
    expect(out).not.toContain("You are here");
    expect(out).not.toContain("Available in:");
    expect(out).not.toContain("User Permissions Needed");
    expect(out).not.toContain("Required Editions");
    expect(out).not.toContain("icon_note");
    expect(out).not.toContain("icon_important");
    expect(out).not.toContain("icon_white");
    expect(out).toContain("Real content stays.");
    expect(out).toContain("Real table stays");
  });
});

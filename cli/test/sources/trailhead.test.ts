import { describe, it, expect, vi } from "vitest";
import { fetchTrailhead, TRAILHEAD_SELECTOR } from "../../src/sources/trailhead";

describe("trailhead source", () => {
  it("renders the unit/module content into markdown", async () => {
    const browser = {
      renderAndExtract: vi.fn(async (_url: string, selector: string) => {
        expect(selector).toBe(TRAILHEAD_SELECTOR);
        return { html: "<h1>Apex Basics</h1><p>Learn the basics of Apex.</p>", title: "Apex Basics | Trailhead" };
      }),
      renderFull: vi.fn(),
    } as any;
    const res = await fetchTrailhead(browser, "https://trailhead.salesforce.com/content/learn/modules/apex_basics_dotnet");
    expect(res.title).toContain("Apex Basics");
    expect(res.markdown).toContain("Learn the basics of Apex.");
    expect(res.source).toBe("trailhead");
  });
});

import { describe, it, expect } from "vitest";
import { fetchKnowledgeArticle, recordToHtml, type KnowledgeArticleRecord } from "../../src/sources/knowledge";

const KNOWN_ISSUE_RECORD: KnowledgeArticleRecord = {
  title: "Apex Platform Event Triggers Execute as 'Automated Process' User Instead of Causing User",
  summary: "Learn why Apex Platform Event Triggers are executed as an 'Automated Process' user.",
  description: "<p>When an Apex trigger is configured as the subscriber of a Platform Event...</p>",
  resolution: "<p>Apex triggers that subscribe to Platform Events execute as the 'Automated Process' system user by design.</p>",
  prerequisites: "",
  steps: "",
  task: "",
  additionalResources:
    '<ul><li><a href="https://developer.salesforce.com/docs/atlas.en-us.platform_events.meta/platform_events/platform_events_intro.htm">Platform Events Developer Guide</a></li></ul>',
  articleNumber: "000383103",
  lastPublishedDate: "2026-05-30 02:40:07",
  versionNumber: "3",
};

describe("recordToHtml", () => {
  it("includes every non-empty section, in a fixed reading order (no duplicate title heading)", () => {
    const html = recordToHtml(KNOWN_ISSUE_RECORD);
    expect(html).not.toContain("<h1>");
    const summaryIdx = html.indexOf("<h2>Summary</h2>");
    const descriptionIdx = html.indexOf("<h2>Description</h2>");
    const resolutionIdx = html.indexOf("<h2>Resolution</h2>");
    const resourcesIdx = html.indexOf("<h2>Additional Resources</h2>");
    expect(summaryIdx).toBeGreaterThan(-1);
    expect(descriptionIdx).toBeGreaterThan(summaryIdx);
    expect(resolutionIdx).toBeGreaterThan(descriptionIdx);
    expect(resourcesIdx).toBeGreaterThan(resolutionIdx);
  });

  it("omits empty optional fields (prerequisites, steps, task) entirely", () => {
    const html = recordToHtml(KNOWN_ISSUE_RECORD);
    expect(html).not.toContain("<h2>Prerequisites</h2>");
    expect(html).not.toContain("<h2>Steps</h2>");
    expect(html).not.toContain("<h2>Task</h2>");
  });

  it("handles a how-to article shape (task/steps present, no resolution)", () => {
    const howTo: KnowledgeArticleRecord = {
      title: "How to Reset a Password",
      task: "<p>Reset a user's password from Setup.</p>",
      steps: "<p>1. Go to Setup. 2. Find the user. 3. Click Reset Password.</p>",
    };
    const html = recordToHtml(howTo);
    expect(html).toContain("<h2>Task</h2>");
    expect(html).toContain("<h2>Steps</h2>");
    expect(html).not.toContain("<h2>Resolution</h2>");
  });
});

describe("fetchKnowledgeArticle", () => {
  it("captures the Aura record and converts it to a DocResult", async () => {
    const url = "https://help.salesforce.com/s/articleView?id=000383103&type=1&language=en_US";
    const browser = {
      captureArticleRecord: async (capturedUrl: string) => {
        expect(capturedUrl).toBe(url);
        return KNOWN_ISSUE_RECORD;
      },
    } as any;
    const doc = await fetchKnowledgeArticle(browser, url);
    expect(doc.source).toBe("knowledge");
    expect(doc.url).toBe(url);
    expect(doc.title).toBe(KNOWN_ISSUE_RECORD.title);
    expect(doc.version).toBe("2026-05-30 02:40:07");
    expect(doc.markdown).toContain("Apex Platform Event Triggers Execute as 'Automated Process' User");
    expect(doc.markdown).toContain("Apex triggers that subscribe to Platform Events execute as the 'Automated Process' system user");
    expect(doc.markdown).toContain("Platform Events Developer Guide");
  });
});

import { describe, it, expect, vi } from "vitest";
import { objectTypeFilter, parseCoveoResults } from "../src/coveo";

describe("coveo helpers", () => {
  it("maps --source to an @objecttype filter", () => {
    expect(objectTypeFilter("help")).toBe('@objecttype==("HelpDocs","KBKnowledgeArticle")');
    expect(objectTypeFilter("release")).toBe('@objecttype==HTReleaseNotesDocumentationC');
  });

  it("parses Coveo results into {title,url,excerpt}", () => {
    const raw = {
      totalCount: 2,
      results: [
        { title: "Sharing Rules", clickUri: "https://help.salesforce.com/Help_DocContent?id=platform.security_about_sharing_rules&language=en_us&release=262.0.0", excerpt: "Sharing rules let you..." },
        { title: "Other", clickUri: "https://help.salesforce.com/s/articleView?id=platform.other", excerpt: "..." },
      ],
    };
    const out = parseCoveoResults(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ title: "Sharing Rules", url: "https://help.salesforce.com/Help_DocContent?id=platform.security_about_sharing_rules&language=en_us&release=262.0.0", excerpt: "Sharing rules let you..." });
  });
});

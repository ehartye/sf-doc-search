import { describe, it, expect } from "vitest";
import { getDocumentUrl, getContentUrl, getIndexUrl } from "../src/atlas-id";

describe("atlas-id", () => {
  it("builds the get_document URL from a long id", () => {
    expect(getDocumentUrl("atlas.en-us.apexcode.meta")).toBe(
      "https://developer.salesforce.com/docs/get_document/atlas.en-us.apexcode.meta",
    );
  });

  it("builds the get_document URL from a bare deliverable", () => {
    expect(getDocumentUrl("apexcode")).toBe(
      "https://developer.salesforce.com/docs/get_document/atlas.en-us.apexcode.meta",
    );
  });

  it("builds the get_document_content URL", () => {
    expect(getContentUrl("apexcode", "apex_intro_what_is_apex.htm", "en-us", "262.0")).toBe(
      "https://developer.salesforce.com/docs/get_document_content/apexcode/apex_intro_what_is_apex.htm/en-us/262.0",
    );
  });

  it("appends a missing .htm suffix on the content file", () => {
    expect(getContentUrl("apexcode", "apex_intro_what_is_apex", "en-us", "262.0")).toContain(
      "/apex_intro_what_is_apex.htm/",
    );
  });

  it("builds the get_index catalog URL", () => {
    expect(getIndexUrl()).toBe(
      "https://developer.salesforce.com/docs/get_index/en-us/000.0/false/All%20Services/all",
    );
  });
});

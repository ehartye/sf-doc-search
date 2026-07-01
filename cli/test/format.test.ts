import { describe, it, expect } from "vitest";
import { formatDoc } from "../src/format";

const doc = { title: "What is Apex?", url: "https://x", source: "atlas" as const, version: "262.0", html: "<p>hi</p>", markdown: "# What is Apex?\n\nhi" };

describe("formatDoc", () => {
  it("returns markdown by default", () => {
    expect(formatDoc(doc, "md")).toBe(doc.markdown);
  });
  it("returns html when requested", () => {
    expect(formatDoc(doc, "html")).toBe(doc.html);
  });
  it("returns JSON when requested", () => {
    expect(JSON.parse(formatDoc(doc, "json"))).toMatchObject({ title: "What is Apex?", source: "atlas" });
  });
});

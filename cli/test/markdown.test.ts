import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "../src/markdown";

describe("htmlToMarkdown", () => {
  const meta = { title: "What is Apex?", url: "https://developer.salesforce.com/x", source: "atlas" as const, version: "262.0" };

  it("prepends a provenance header", () => {
    const md = htmlToMarkdown("<p>Hello</p>", meta);
    expect(md).toContain("# What is Apex?");
    expect(md).toContain("Source: https://developer.salesforce.com/x");
    expect(md).toContain("Version: 262.0");
  });

  it("converts headings, code blocks and tables", () => {
    const html = `<h1 class="helpHead1">What is Apex?</h1><pre><code>System.debug('x');</code></pre>
      <table><tr><th>A</th></tr><tr><td>1</td></tr></table>`;
    const md = htmlToMarkdown(html, meta);
    expect(md).toContain("```");
    expect(md).toContain("System.debug('x');");
    expect(md).toContain("| A |");
  });

  it("omits the version line when version is absent", () => {
    const md = htmlToMarkdown("<p>x</p>", { ...meta, version: undefined });
    expect(md).not.toContain("Version:");
  });
});

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

  it("does not flatten nested table rows into the outer table", () => {
    const html = `<table><tr><th>A</th><th>B</th></tr><tr><td><table><tr><td>n1</td><td>n2</td></tr></table></td><td>c2</td></tr></table>`;
    const md = htmlToMarkdown(html, meta);
    expect(md).toContain("| A | B |");
    expect(md).toContain("| --- | --- |");
    const bodyRow = md.split("\n").find((l) => l.includes("c2"));
    expect(bodyRow).toBeDefined();
    // a clean 2-column row "| ... | c2 |" has exactly 3 pipe characters
    expect((bodyRow!.match(/\|/g) || []).length).toBe(3);
  });

  it("pads a short row to the header width", () => {
    const html = `<table><tr><th>A</th><th>B</th><th>C</th></tr><tr><td>1</td></tr></table>`;
    const md = htmlToMarkdown(html, meta);
    expect(md).toContain("| 1 |  |  |");
  });

  it("stamps a retrieved date in the provenance header", () => {
    const md = htmlToMarkdown("<p>x</p>", { title: "T", url: "https://u", source: "atlas", version: "262.0", retrieved: "2026-07-02" });
    expect(md).toContain("> Retrieved: 2026-07-02 via sf-docs (atlas)");
  });

  it("defaults the retrieved date to today (ISO)", () => {
    const md = htmlToMarkdown("<p>x</p>", { title: "T", url: "https://u", source: "help" });
    expect(md).toMatch(/> Retrieved: \d{4}-\d{2}-\d{2} via sf-docs \(help\)/);
  });
});

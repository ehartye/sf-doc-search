import TurndownService from "turndown";
import type { Source } from "./types";

const td = new TurndownService({ codeBlockStyle: "fenced", headingStyle: "atx" });

// Render HTML tables as GitHub-flavored Markdown tables.
td.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const rows = Array.from((node as HTMLElement).querySelectorAll("tr"));
    if (rows.length === 0) return "";
    const cells = (r: Element) =>
      Array.from(r.querySelectorAll("th,td")).map((c) => (c.textContent ?? "").trim().replace(/\|/g, "\\|"));
    const header = cells(rows[0]);
    const sep = header.map(() => "---");
    const body = rows.slice(1).map((r) => `| ${cells(r).join(" | ")} |`);
    return `\n\n| ${header.join(" | ")} |\n| ${sep.join(" | ")} |\n${body.join("\n")}\n\n`;
  },
});

export interface DocMeta {
  title: string;
  url: string;
  source: Source;
  version?: string;
}

export function htmlToMarkdown(html: string, meta: DocMeta): string {
  const body = td.turndown(html).trim();
  const header = [
    `# ${meta.title}`,
    "",
    `> Source: ${meta.url}`,
    meta.version ? `> Version: ${meta.version}` : undefined,
    `> Retrieved via sf-docs (${meta.source})`,
    "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
  return `${header}\n${body}\n`;
}

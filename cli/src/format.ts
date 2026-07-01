import type { DocResult } from "./types";

export type Format = "md" | "html" | "json";

export function formatDoc(doc: DocResult, format: Format): string {
  if (format === "html") return doc.html;
  if (format === "json") return JSON.stringify(doc, null, 2);
  return doc.markdown;
}

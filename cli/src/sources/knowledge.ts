import type { BrowserManager } from "../browser";
import type { DocResult } from "../types";
import { htmlToMarkdown } from "../markdown";

/** The record fields a Knowledge Article (incl. Known Issues) actually carries.
 *  Salesforce's schema allows any of the body fields to be absent depending on
 *  article type (e.g. a how-to article uses `steps`/`task`, a Known Issue uses
 *  `description`/`resolution`), so all are optional except the always-present title. */
export interface KnowledgeArticleRecord {
  title: string;
  summary?: string;
  description?: string;
  resolution?: string;
  prerequisites?: string;
  steps?: string;
  task?: string;
  additionalResources?: string;
  articleNumber?: string;
  lastPublishedDate?: string;
  versionNumber?: string;
}

/** Section label, in display order, for each optional HTML body field. */
const SECTIONS: Array<[keyof KnowledgeArticleRecord, string]> = [
  ["summary", "Summary"],
  ["description", "Description"],
  ["prerequisites", "Prerequisites"],
  ["steps", "Steps"],
  ["task", "Task"],
  ["resolution", "Resolution"],
  ["additionalResources", "Additional Resources"],
];

/** Assemble the record's non-empty fields into one HTML document, in a fixed
 *  reading order, so `htmlToMarkdown` can convert it like any other page.
 *  No title heading here — `htmlToMarkdown` already renders `meta.title` as the
 *  page's H1 in the provenance header, and this HTML (unlike a rendered page's
 *  extracted body) is ours to construct, so there's no reason to duplicate it. */
export function recordToHtml(record: KnowledgeArticleRecord): string {
  const parts: string[] = [];
  for (const [field, label] of SECTIONS) {
    const value = record[field];
    if (typeof value === "string" && value.trim().length > 0) {
      parts.push(`<h2>${label}</h2>${value}`);
    }
  }
  return parts.join("\n");
}

export async function fetchKnowledgeArticle(browser: BrowserManager, url: string): Promise<DocResult> {
  const record = (await browser.captureArticleRecord(url)) as KnowledgeArticleRecord;
  const html = recordToHtml(record);
  return {
    title: record.title,
    url,
    source: "knowledge",
    version: record.lastPublishedDate,
    html,
    markdown: htmlToMarkdown(html, { title: record.title, url, source: "knowledge", version: record.lastPublishedDate }),
  };
}

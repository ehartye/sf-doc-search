import type { BrowserManager } from "../browser";
import type { DocResult } from "../types";
import { htmlToMarkdown } from "../markdown";

export const TRAILHEAD_SELECTOR = "main, [data-content], article";

export async function fetchTrailhead(browser: BrowserManager, url: string): Promise<DocResult> {
  let html: string;
  let title: string;
  try {
    const r = await browser.renderAndExtract(url, TRAILHEAD_SELECTOR);
    html = r.html;
    title = r.title;
  } catch {
    const r = await browser.renderFull(url);
    html = r.html;
    title = r.title;
  }
  const cleanTitle = title.replace(/\s*\|\s*Trailhead.*$/i, "").trim() || title;
  return {
    title: cleanTitle,
    url,
    source: "trailhead",
    html,
    markdown: htmlToMarkdown(html, { title: cleanTitle, url, source: "trailhead" }),
  };
}

import type { BrowserManager } from "../browser";
import type { DocResult, Source } from "../types";
import { htmlToMarkdown } from "../markdown";

// The Lightning article body container (pierced via Playwright locator).
export const HELP_ARTICLE_SELECTOR = "article, .slds-rich-text-editor__output, .test-id__article-body, .content";

export async function fetchHelp(browser: BrowserManager, url: string, source: Source): Promise<DocResult> {
  let html: string;
  let title: string;
  try {
    const r = await browser.renderAndExtract(url, HELP_ARTICLE_SELECTOR);
    html = r.html;
    title = r.title;
  } catch {
    // Selector drift / not found -> degrade to full-page render.
    const r = await browser.renderFull(url);
    html = r.html;
    title = r.title;
  }
  const cleanTitle = title.replace(/\s*\|\s*Salesforce.*$/i, "").trim() || title;
  return {
    title: cleanTitle,
    url,
    source,
    html,
    markdown: htmlToMarkdown(html, { title: cleanTitle, url, source }),
  };
}

import type { BrowserManager } from "../browser";
import type { DocResult, Source } from "../types";
import { htmlToMarkdown } from "../markdown";

// The Lightning article longform body container (pierced via Playwright locator).
// `.slds-text-longform` is the article body region on help.salesforce.com articleView pages.
export const HELP_ARTICLE_SELECTOR = ".slds-text-longform, .test-id__article-body, article";

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

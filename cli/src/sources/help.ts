import type { BrowserManager } from "../browser";
import type { DocResult, Source } from "../types";
import { htmlToMarkdown } from "../markdown";

// The Lightning article longform body container (pierced via Playwright locator).
// `.slds-text-longform` is the article body region on help.salesforce.com articleView pages.
export const HELP_ARTICLE_SELECTOR = ".slds-text-longform, .test-id__article-body, article";

/** Remove Help-article chrome that adds noise to Markdown: breadcrumbs,
 *  Required Editions / User Permissions tables, and decorative callout icons (icon_*.png). */
export function stripHelpBoilerplate(html: string): string {
  return html
    .replace(/You are here:[\s\S]*?<\/ol>/gi, "")
    .replace(/<h\d[^>]*>\s*Required Editions[\s\S]*?<\/h\d>/gi, "")
    .replace(/<table[\s\S]*?<\/table>/gi, (t) =>
      /Available in:|User Permissions Needed|Required Editions/i.test(t) ? "" : t,
    )
    .replace(/<img[^>]*\/icon_[a-z_]+\.(?:png|gif|svg)[^>]*>/gi, "");
}

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
  html = stripHelpBoilerplate(html);
  const cleanTitle = title.replace(/\s*\|\s*Salesforce.*$/i, "").trim() || title;
  let version: string | undefined;
  try {
    version = new URL(url).searchParams.get("release") ?? undefined;
  } catch {
    version = undefined;
  }
  return {
    title: cleanTitle,
    url,
    source,
    version,
    html,
    markdown: htmlToMarkdown(html, { title: cleanTitle, url, source, version }),
  };
}

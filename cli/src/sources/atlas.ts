import type { BrowserManager } from "../browser";
import type { AtlasRef, DocResult } from "../types";
import { getDocumentUrl, getContentUrl, getIndexUrl } from "../atlas-id";
import { flattenToc, findHref, type TocNode } from "../toc";
import { htmlToMarkdown } from "../markdown";

interface AtlasDocMeta {
  title: string;
  deliverable: string;
  version?: { doc_version?: string };
  toc?: TocNode[];
}

export async function fetchDocumentMeta(browser: BrowserManager, deliverable: string): Promise<AtlasDocMeta> {
  return browser.fetchJsonInPage(getDocumentUrl(deliverable));
}

export async function fetchAtlasDoc(browser: BrowserManager, ref: AtlasRef): Promise<DocResult> {
  const meta = await fetchDocumentMeta(browser, ref.deliverable);
  const docVersion = ref.docVersion ?? meta.version?.doc_version;
  if (!docVersion) throw new Error(`Could not resolve doc version for ${ref.deliverable}`);

  // If no explicit file, default to the deliverable's landing page (first TOC entry).
  let file = ref.file;
  if (!file && meta.toc?.length) file = meta.toc[0].a_attr?.href;
  if (!file) throw new Error(`No content file for ${ref.deliverable}`);

  const url = getContentUrl(ref.deliverable, file, ref.locale, docVersion);
  const content = await browser.fetchJsonInPage(url);
  return {
    title: content.title ?? meta.title,
    url,
    source: "atlas",
    version: docVersion,
    html: content.content ?? "",
    markdown: htmlToMarkdown(content.content ?? "", {
      title: content.title ?? meta.title,
      url,
      source: "atlas",
      version: docVersion,
    }),
  };
}

export interface CatalogEntry { deliverable: string; title: string; longId: string; }

export async function listCatalog(browser: BrowserManager): Promise<CatalogEntry[]> {
  const idx = await browser.fetchJsonInPage(getIndexUrl());
  return (idx.content ?? []).map((c: any) => ({ deliverable: c.id, title: c.key, longId: c.value }));
}

export interface TocEntry { id: string; text: string; href?: string; }

export async function fetchToc(browser: BrowserManager, deliverable: string): Promise<TocEntry[]> {
  const meta = await fetchDocumentMeta(browser, deliverable);
  return flattenToc(meta.toc ?? []).map((n) => ({ id: n.id, text: n.text, href: n.a_attr?.href }));
}

export { findHref };

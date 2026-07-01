const BASE = "https://developer.salesforce.com/docs";

/** Accepts a bare deliverable ("apexcode") or a long id ("atlas.en-us.apexcode.meta"). */
export function toLongId(deliverableOrLong: string, locale = "en-us"): string {
  if (deliverableOrLong.startsWith("atlas.")) return deliverableOrLong;
  return `atlas.${locale}.${deliverableOrLong}.meta`;
}

export function getDocumentUrl(deliverableOrLong: string, locale = "en-us"): string {
  return `${BASE}/get_document/${toLongId(deliverableOrLong, locale)}`;
}

export function getContentUrl(
  shortDeliverable: string,
  file: string,
  locale: string,
  docVersion: string,
): string {
  const htm = file.endsWith(".htm") ? file : `${file}.htm`;
  return `${BASE}/get_document_content/${shortDeliverable}/${htm}/${locale}/${docVersion}`;
}

export function getIndexUrl(): string {
  return `${BASE}/get_index/en-us/000.0/false/All%20Services/all`;
}

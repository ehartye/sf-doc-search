import type { DocResult } from "./types";
import { formatDoc, type Format } from "./format";

export interface BatchResult { output: string; failures: string[]; }

/** Fetch each URL sequentially over the caller's engine; never abort the batch on one failure. */
export async function fetchBatch(
  engine: { fetch(url: string): Promise<DocResult> },
  urls: string[],
  format: Format,
): Promise<BatchResult> {
  const docs: DocResult[] = [];
  const failures: string[] = [];
  for (const url of urls) {
    try {
      docs.push(await engine.fetch(url));
    } catch (err) {
      failures.push(`${url}: ${(err as Error).message}`);
    }
  }
  const output =
    format === "json"
      ? JSON.stringify(urls.length === 1 ? (docs[0] ?? null) : docs, null, 2)
      : docs.map((d) => formatDoc(d, format)).join("\n---\n");
  return { output, failures };
}

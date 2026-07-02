import type { BrowserManager } from "../browser";
import type { ComponentRef, DocResult } from "../types";
import { todayISO } from "../markdown";

export function componentUrl(ref: ComponentRef): string {
  const q = encodeURIComponent;
  return `https://developer.salesforce.com/cx-router/components?model=${q(ref.model)}&namespace=${q(ref.namespace)}&component=${q(ref.name)}`;
}

export async function fetchComponent(browser: BrowserManager, ref: ComponentRef): Promise<DocResult> {
  const url = componentUrl(ref);
  const json = await browser.fetchJsonInPage(url);
  const r = json.response ?? {};
  const title = `${ref.namespace}-${ref.name}`;
  const lines = [
    `# ${title}`,
    "",
    `> Source: ${url}`,
    `> Retrieved: ${todayISO()} via sf-docs (component)`,
    "",
    r.global?.description ?? "",
    "",
    "## Attributes",
    "",
    "| Attribute | Required | Description |",
    "| --- | --- | --- |",
    ...(r.attributes ?? []).map(
      (a: any) => `| ${a.nameInKebabCase ?? a.name} | ${a.required ? "yes" : "no"} | ${(a.description ?? "").replace(/\|/g, "\\|")} |`,
    ),
    "",
  ];
  const markdown = lines.join("\n");
  return { title, url, source: "component", version: r.global?.support, html: "", markdown };
}

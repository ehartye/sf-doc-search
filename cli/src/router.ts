import type { RouteResult, AtlasRef, ComponentRef, Source } from "./types";

const ATLAS_LONG = /^atlas\.([a-z-]+)\.(?:(\d+\.\d+)\.)?([a-z0-9_]+)\.meta$/i;

function parseAtlasFromPath(pathname: string): AtlasRef | undefined {
  // /docs/atlas.en-us[.262.0].apexcode.meta/apexcode/apex_intro_what_is_apex.htm
  const parts = pathname.split("/").filter(Boolean); // [docs, atlas..., apexcode, file.htm]
  const idx = parts.findIndex((p) => p.toLowerCase().startsWith("atlas."));
  if (idx === -1) return undefined;
  const m = ATLAS_LONG.exec(parts[idx]);
  if (!m) return undefined;
  const [, locale, docVersion, deliverable] = m;
  const file = parts.slice(idx + 1).find((p) => p.endsWith(".htm"));
  return {
    longId: parts[idx].toLowerCase(),
    deliverable: deliverable.toLowerCase(),
    file,
    locale: locale.toLowerCase(),
    docVersion,
  };
}

function parseComponent(pathname: string): ComponentRef | undefined {
  // .../component-library/bundle/lightning-button  OR  .../bundle/aura/lightning-card
  const m = /component-library\/bundle\/(?:(aura|lwc)\/)?([a-z]+)-([a-z0-9_-]+)/i.exec(pathname);
  if (!m) return undefined;
  const model = (m[1]?.toLowerCase() as "aura" | "lwc") ?? "lwc";
  return { namespace: m[2].toLowerCase(), name: m[3].toLowerCase(), model };
}

export function route(input: string): RouteResult {
  const trimmed = input.trim();

  // Bare atlas shorthand: "apexcode/apex_intro_what_is_apex.htm" or an atlas id.
  if (!/^https?:\/\//i.test(trimmed)) {
    if (ATLAS_LONG.test(trimmed)) {
      const m = ATLAS_LONG.exec(trimmed)!;
      return {
        source: "atlas",
        url: trimmed,
        atlas: {
          longId: trimmed.toLowerCase(),
          deliverable: m[3].toLowerCase(),
          locale: m[1].toLowerCase(),
          docVersion: m[2],
        },
      };
    }
    const m = /^([a-z0-9_]+)\/([a-z0-9_]+\.htm)$/i.exec(trimmed);
    if (m) {
      return {
        source: "atlas",
        url: trimmed,
        atlas: { longId: `atlas.en-us.${m[1]}.meta`, deliverable: m[1], file: m[2], locale: "en-us" },
      };
    }
    return { source: "generic", url: trimmed };
  }

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { source: "generic", url: trimmed };
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;

  if (host === "developer.salesforce.com") {
    if (path.includes("/component-library/")) {
      return { source: "component", url: trimmed, component: parseComponent(path) };
    }
    if (path.includes("/atlas.")) {
      return { source: "atlas", url: trimmed, atlas: parseAtlasFromPath(path) };
    }
    return { source: "atlas-lwr", url: trimmed };
  }

  if (host === "help.salesforce.com") {
    const id = u.searchParams.get("id") ?? "";
    const source: Source = id.startsWith("release-notes.") ? "release" : "help";
    // Normalize any Help URL (e.g. Coveo's Help_DocContent clickUri, whose id lacks
    // the .htm suffix) to the canonical Lightning articleView URL, the only form
    // that renders the article body.
    let url = trimmed;
    if (id) {
      const htmId = id.endsWith(".htm") ? id : `${id}.htm`;
      const release = u.searchParams.get("release");
      url =
        `https://help.salesforce.com/s/articleView?id=${htmId}&type=5&language=en_US` +
        (release ? `&release=${release}` : "");
    }
    return { source, url };
  }

  if (host === "releasenotes.docs.salesforce.com") {
    return { source: "release", url: trimmed };
  }

  if (host === "trailhead.salesforce.com") {
    return { source: "trailhead", url: trimmed };
  }

  return { source: "generic", url: trimmed };
}

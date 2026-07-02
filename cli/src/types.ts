export type Source =
  | "atlas"        // developer.salesforce.com Atlas JSON API
  | "lwr"          // developer.salesforce.com LWR docs platform (server-rendered narrative docs)
  | "component"    // LWC/Aura component library (cx-router)
  | "help"         // help.salesforce.com article (shadow DOM)
  | "release"      // release notes (Help article, release-notes.* id)
  | "trailhead"    // trailhead.salesforce.com learn content
  | "generic";     // any other host -> readability render

export interface AtlasRef {
  longId: string;        // e.g. atlas.en-us.apexcode.meta (version may be absent until resolved)
  deliverable: string;   // short, e.g. apexcode
  file?: string;         // e.g. apex_intro_what_is_apex.htm
  locale: string;        // e.g. en-us
  docVersion?: string;   // e.g. 262.0 (resolved from get_document if absent)
}

export interface ComponentRef {
  namespace: string;     // e.g. lightning
  name: string;          // e.g. button
  model: "lwc" | "aura";
}

export interface RouteResult {
  source: Source;
  url: string;           // normalized absolute URL (or original shorthand)
  atlas?: AtlasRef;
  component?: ComponentRef;
}

export interface DocResult {
  title: string;
  url: string;
  source: Source;
  version?: string;
  html: string;
  markdown: string;
}

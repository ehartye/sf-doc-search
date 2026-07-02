# sf-docs v0.4.0 — LWR docs platform first-class + friction fixes

**Date:** 2026-07-02
**Status:** Approved (design)
**Type:** CLI feature bundle + skill doc updates. One release (0.4.0).

## Problem

Two live guide-compilation runs surfaced friction that maps to tool gaps:

1. Salesforce's **newer docs platform** (`developer.salesforce.com/docs/<area>/<guide>/...`,
   e.g. all Agentforce and Agent API docs) is typed in the codebase (`atlas-lwr`)
   but half-implemented: no discovery (catalog/toc are blind to it), provenance
   mislabeled `(trailhead)`, developer-site title residue. The Atlas API our
   catalog speaks is the *legacy* platform — an increasing share of current
   Salesforce docs lives only on the new one, which cuts against this project's
   core promise of current information.
2. `search` returns non-official domains (`orgcs.my.salesforce.com`) and
   non-English duplicates that must be hand-filtered.
3. Each `fetch` pays full browser startup; guide compilation makes 6–12 fetches.
4. Provenance headers lack a retrieved-date (required by the sf-docs-reference
   citation format) and help pages lack a version line.
5. Help-page Markdown carries boilerplate (breadcrumbs, editions/permissions
   tables, icon images).

## Probe findings (2026-07-02, live)

Ground truth for the LWR design — verified in a real browser session:

- The platform is **MPA, server-rendered (LWR/shadow DOM)**. No content-JSON API,
  no docs sitemap (`/sitemap.xml` → 92 marketing URLs, 1 doc link).
- **Any guide page's raw SSR HTML contains the full guide nav** (verified:
  `agent-api-get-started.html` raw HTML includes sibling links; rendered
  shadow-walk found 58 nav links). → per-guide TOC from one raw fetch.
- **`/docs/apis` raw SSR HTML lists 67 unique guide roots** matching
  `/docs/<area>/<guide>...` (e.g. `marketing/pardot`, `commerce/commerce-api`).
  → catalog from one raw fetch. (`/docs` landing itself: 0 parseable links.)
- Plain HTTP is Akamai-blocked (existing constraint); raw fetches must run in
  page context, like `fetchJsonInPage` does today.

## Design

### 1. LWR lane first-class

**Rename** the `Source` variant `atlas-lwr` → `lwr` (types.ts, router.ts,
engine.ts, router test). It is not Atlas; the name misleads.

**New module `cli/src/sources/lwr.ts`:**

- `fetchLwr(browser, url): DocResult` — render+extract like trailhead, but:
  - provenance label `lwr` (fixes the baked `(trailhead)` header; the re-stamp
    hack at engine.ts:43 is removed),
  - title cleanup: strip trailing `| <segment>` chains ending in
    `| Salesforce Developers`,
  - `> Version: current (unversioned platform)` header line (the platform serves
    only the current revision).
- `parseLwrCatalog(html): { area, guide, title? }[]` — pure function; extracts
  unique `/docs/<area>/<guide>` roots from `/docs/apis` raw HTML.
- `parseLwrToc(html, guidePath): TocEntry[]` — pure function; extracts nav
  anchors scoped to `guidePath` from a guide page's raw HTML, deduped by href,
  same `TocEntry` shape as Atlas (`{ text, href }`).

**BrowserManager:** add `fetchTextInPage(url): string` — same page-context +
warmup pattern as `fetchJsonInPage`, returning raw response text.

**CLI wiring:**

- `sf-docs toc <target>` — disambiguation: an argument containing `/` (e.g.
  `ai/agentforce/guide` or a full `/docs/...` URL) → LWR path; a bare word
  (e.g. `apexcode`) → Atlas deliverable, as today.
- `sf-docs catalog` — merged output: Atlas deliverables + LWR guides, with a
  platform column (`atlas` | `lwr`). Text format becomes
  `<id>\t<platform>\t<title>`; JSON gains a `platform` field. `--grep` filters
  both. LWR ids are `<area>/<guide>`.

**Failure mode:** if either parser yields zero entries (site redesign), throw
with a message naming the URL and suggesting `--debug` — never return an empty
catalog/TOC silently.

### 2. Search filtering by default

`parseCoveoResults` (coveo.ts) gains a filter step, applied by default:

- keep only results whose URL host is `help.salesforce.com`,
  `developer.salesforce.com`, or `trailhead.salesforce.com`;
- drop results whose URL carries a `language=` param other than `en_us`
  (case-insensitive), deduplicating localized variants;
- `--all-results` flag on `search` disables the filter.

### 3. Multi-URL fetch

`sf-docs fetch <url...>` (Commander variadic). URLs are fetched **sequentially**
over the single shared BrowserManager (one startup, one warmup). Output:

- `md` / `html`: documents joined by a line containing only `---`;
- `json`: a single object for one URL (unchanged), an array for >1.

A failed URL doesn't abort the batch: emit `sf-docs error: <url>: <message>` to
stderr, continue, and exit non-zero if any URL failed.

### 4. Provenance completeness

`htmlToMarkdown` header (markdown.ts) and the component header gain
`> Retrieved: <YYYY-MM-DD>` (UTC). Help fetches gain `> Version: <release>`
parsed from the articleView URL's `release` param when present. Atlas/component
keep their existing version lines; lwr uses the fixed line from §1.

### 5. Help boilerplate strip

The help extractor removes, before Markdown conversion: breadcrumb nav ("You are
here" list), "Required Editions" / "User Permissions Needed" tables, and
note/warning/tip icon `<img>` elements (keep the callout text).

### 6. Skill updates

`.claude/skills/sf-docs/SKILL.md` decision flow:

- Step 2 (developer reference) covers both platforms: catalog/toc now list LWR
  guides; fetch handles `/docs/<area>/<guide>/...` URLs.
- New guidance line: "If the catalog misses a developer topic, newer content
  lives at `developer.salesforce.com/docs/<area>/<guide>` — fetch it directly."
- Flags section documents `--all-results` and multi-URL fetch.

Mirror to `.github/skills/` (glob test enforces byte-identity automatically).
`sf-docs-reference` skill is unchanged (delegates retrieval).

### 7. Packaging

- Version 0.4.0 across all six declarations (versions-in-sync test enforces).
- One feature branch → PR → merge, as previous releases.

## Non-goals

- No JSON-API reverse-engineering for LWR content (none exists — probed).
- No parallel fetching (sequential over one browser is the win; parallelism adds
  Playwright-context complexity for little gain at 6–12 URLs).
- No caching changes (existing Cache applies to LWR fetches unchanged).
- No pagination/depth for LWR catalog beyond `/docs/apis` (67 guides today; if a
  guide is missing there, direct URL fetch still works).

## Testing

- **Pure parsers** (`parseLwrCatalog`, `parseLwrToc`, coveo filter, title
  cleanup, provenance lines): fixture-based unit tests, TDD.
- **Multi-fetch + catalog merge + toc dispatch**: engine/CLI tests with the fake
  browser stubs.
- **Live gate (`SF_DOCS_LIVE`)**: fetch an Agentforce page (assert `(lwr)`
  provenance + clean title), `toc ai/agentforce/guide` (assert >20 entries),
  `catalog --grep agentforce` (assert the LWR guide appears), one filtered
  search (assert only official domains).

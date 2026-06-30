# sf-doc-search — Design

**Date:** 2026-06-30
**Status:** Approved (design); ready for implementation planning
**Author:** Brainstormed with Claude (h-superpowers:brainstorming)

## Problem

Salesforce's documentation and help sites are notoriously hard to retrieve
programmatically. Pages are client-rendered Lightning/Aura apps with shadow DOM
(`help.salesforce.com`), and the high-value developer docs sit behind an Akamai
bot-wall that returns HTTP 403 to plain HTTP clients. The result: agents and
tools that try to "just fetch the page" get empty bodies, blocked requests, or
shadow-DOM soup instead of the actual documentation.

We want a single, low-friction way for an AI coding agent (Claude Code **and**
GitHub Copilot) to retrieve **clean, source-grade Salesforce documentation** —
developer docs, Help articles, Trailhead, and release notes — without the user
ever seeing a browser popup or fighting render failures.

## Goals

- Retrieve clean documentation content from the four major Salesforce sources:
  **developer docs, Salesforce Help, Trailhead, release notes**.
- **Seamless UX:** no visible browser-automation popups. Headless by default;
  an opt-in `--debug` headed mode is acceptable.
- **CLI owns all logic.** The agent writes little to no code; it shells out to a
  pre-built CLI that handles source identification, fetch, render, and cleaning.
- **One package, two ecosystems.** Ship a single plugin directory that works in
  both Claude Code and GitHub Copilot, with **no MCP server**.
- Ground the design in the *current* (late-2025/2026) Claude Code and GitHub
  Copilot plugin/"Agent Skills" conventions.

## Non-Goals

- No hosted service / GitHub App "Copilot Extension" (local-first only).
- No authenticated/org-specific Salesforce data (public docs only).
- No full offline doc index/crawl (live retrieval; only lightweight caching).
- The agent's own web search is the primary discovery mechanism; the CLI does
  not reimplement general web search (it adds only a narrow Coveo helper, below).

## Key Research Findings (ground truth, verified by live fetch 2026-06-30)

These shaped the design and are recorded so implementation doesn't re-derive them.

### Plugin / skills format convergence
- Both Claude Code and GitHub Copilot/VS Code implement the open **"Agent Skills"**
  standard (a folder + `SKILL.md`, `agentskills.io`).
- **`.claude/skills/<name>/SKILL.md` is auto-discovered by BOTH tools** — this is
  the shared source of truth; no file duplication needed.
- Open-spec frontmatter: `name` (≤64 chars, lowercase/hyphen, matches dir),
  `description` (≤1024 chars, what + when). Stick to this subset for portability.
- **Copilot cannot inject a binary onto PATH.** The portable CLI-invocation
  mechanism is `npx <pkg>` (or `node ./scripts/...`). Claude Code *can* put a
  binary on PATH via the plugin `bin/` dir — used as an optional enhancement.
- Claude Code distribution: `.claude-plugin/plugin.json` (with
  `"skills": ["./.claude/skills"]` to reuse the shared folder) + a
  `.claude-plugin/marketplace.json`.
- Caveat: Copilot Agent Skills is new and partly experimental (discovery dirs,
  `context: fork` may shift). We pin to the stable open-spec subset.

### Salesforce retrieval mechanisms
- **Developer docs ("Atlas") — clean JSON API (the crown jewel):**
  - `GET /docs/get_index/en-us/000.0/false/All%20Services/all` → catalog of ~118
    "deliverables" (books); each `value` is a full id like
    `atlas.en-us.262.0.apexcode.meta`.
  - `GET /docs/get_document/atlas.<locale>.<name>.meta` → metadata + `toc` nav
    tree (`id`, `text`, `a_attr.href`, recursive `children`) + `version`
    (`doc_version`, e.g. `262.0`) + short `deliverable` (e.g. `apexcode`).
  - `GET /docs/get_document_content/<shortDeliverable>/<file.htm>/<locale>/<docVersion>`
    → clean per-page HTML (`{id, title, content}`). The `.htm` suffix is
    **required**.
  - **Deliverable name is overloaded:** long `atlas.en-us.262.0.apexcode.meta`
    for `get_document`, short `apexcode` for content. Normalize both from the
    `get_document` response.
  - **Akamai bot-wall:** plain `curl`/Node `fetch` gets HTTP 403 regardless of
    headers (TLS/JA3 fingerprinting). The JSON only returns from a real browser
    context → drives the headless-engine decision.
- **Component library (LWC/Aura) — JSON API:**
  `GET /cx-router/components?model=lwc|aura&namespace=<ns>&component=<name>`
  (note: root path, not under `/docs`).
- **Salesforce Help + release notes — shadow DOM, render required:**
  - Articles render at `/s/articleView?id=<id>&type=5&language=en_US` via Aura;
    body is **not** available as static HTML or in any index → must headless-render.
  - Discovery via **Coveo** JSON search: `POST platform.cloud.coveo.com/rest/search/v2`
    with an **anonymous ~24h JWT** scraped from a Help search page (`q`,
    `searchHub:HTCommunity`, filter by `@objecttype`). Body not indexed (excerpts
    only) → search for URLs, then render for content.
  - Release notes are now Help articles (`id` prefix `release-notes.*`,
    `objecttype = HTReleaseNotesDocumentationC`); legacy
    `releasenotes.docs.salesforce.com/*` 301-redirects into Help.
- **Trailhead — server-rendered HTML:** module/unit pages render content in
  initial HTML (HTTP+parse works). A GraphQL endpoint
  (`/services/mobile/graphql`) exists and accepts anonymous POST, but
  introspection is disabled and content query names are undocumented — so we use
  rendered HTML extraction, kept uniform with the single engine.

## Architecture

Three layers, strict separation of concerns:

```
Agent (Claude Code / Copilot)
  └─ web-search scoped to SF doc domains → candidate URLs   (agent's built-in tool)
       │ shells out
SKILL.md  (.claude/skills/sf-docs/)
  └─ thin orchestration prose: "given a URL or topic, call sf-docs like this…"
       │ invokes
sf-docs CLI  (Node/TS, npm)  ← ALL logic
  └─ source-id · tiered fetch · single headless render · clean Markdown
```

- The **agent** only performs web search and citation.
- The **SKILL.md** is instructions, not logic; shared verbatim by both ecosystems.
- The **CLI** is the entire engine.

### Repo / package layout

```
sf-doc-search/
├── .claude/skills/sf-docs/
│   └── SKILL.md                 # shared source of truth (read by both tools)
├── .claude-plugin/
│   ├── plugin.json              # name, version, "skills":["./.claude/skills"]
│   └── marketplace.json         # `/plugin marketplace add ehartye/sf-doc-search`
├── bin/sf-docs                  # Claude-only: CLI on Bash PATH (no global install)
├── cli/                         # engine — published to npm as `sf-docs`
│   ├── src/
│   │   ├── index.ts             # arg parsing, command dispatch
│   │   ├── router.ts            # URL/topic → source classification
│   │   ├── browser.ts           # one lazy headless Chromium (system Chrome); --debug=headed
│   │   ├── sources/             # atlas.ts, help.ts, trailhead.ts, component.ts
│   │   ├── coveo.ts             # anonymous-token scrape + search (help/release)
│   │   ├── markdown.ts          # HTML → clean Markdown (Turndown)
│   │   └── cache.ts
│   ├── package.json
│   └── tsconfig.json
├── package.json
└── README.md                    # per-ecosystem install steps
```

## CLI Surface

| Command | Purpose |
|---|---|
| `sf-docs fetch <url>` | **Workhorse.** Classify source from URL, retrieve, return clean Markdown. |
| `sf-docs catalog [--grep <term>]` | List the ~118 dev-docs deliverables (books). |
| `sf-docs toc <deliverable>` | Table of contents for one book (e.g. `apexcode`). |
| `sf-docs component <ns> <name> [--model lwc\|aura]` | LWC/Aura component reference via `cx-router`. |
| `sf-docs search <query> --source help\|release` | Coveo-backed discovery for the two hard sources only. |

Global flags: `--format md|html|json` (default `md`), `--debug` (headed browser +
tier/timing logs), `--no-cache`, `--version`.

Dev docs and Trailhead discovery stay on **agent web-search** (the chosen
division of labor); `search` exists only for Help/release-notes, where general
web search is weakest.

## Source Routing (`router.ts`)

`fetch` classifies by host + path, then dispatches to a source module:

| Input pattern | Source | Retrieval |
|---|---|---|
| `developer.salesforce.com/docs/atlas.<locale>.…/<deliv>/<file>.htm` | Atlas dev docs | Atlas JSON API |
| `developer.salesforce.com/docs/platform/…/guide/*.html` | LWR narrative docs | render → extract |
| `…/docs/component-library/…` / `lightning-component-reference` | Component lib | `cx-router/components` JSON |
| `help.salesforce.com/s/articleView?id=…` | Salesforce Help | render `/s/articleView`, extract article container |
| `releasenotes.docs.salesforce.com/*` | Release notes | follow 301 → Help render |
| `trailhead.salesforce.com/content/learn/*` | Trailhead | render → extract |
| bare `apexcode/apex_intro_what_is_apex.htm` or atlas id | Atlas shorthand | Atlas JSON API |
| any other SF host | generic | render → readability extract |

## Fetch Engine (`browser.ts`) — Single Headless Engine (Approach A)

One warm headless Chromium, reused across all fetches in a process:

1. **Lazy launch** Playwright with `channel: 'chrome'` (reuse system Chrome — no
   ~150 MB download); fall back to bundled Chromium only if no system Chrome.
   `--debug` → `headless: false` + tier/timing logs.
2. **Atlas JSON path:** navigate once to a `developer.salesforce.com` page to
   acquire Akamai cookies, then call the `get_index` / `get_document` /
   `get_document_content` endpoints from **inside** the page context
   (`page.evaluate(fetch…)`) so Akamai sees a real browser and returns clean
   JSON. Walk `toc` for whole-book fetches. Normalize the long/short deliverable
   name from the `get_document` response.
3. **Help / release notes:** navigate `/s/articleView`, wait for the article
   container, pierce shadow DOM via Playwright locators, extract `innerHTML`.
4. **Trailhead / LWR / generic:** render and extract the content container
   (readability fallback for generic).
5. **HTML → Markdown** via Turndown (preserve code blocks, tables, anchors);
   prepend a provenance header: **title · source URL · doc version**.

## Coveo Search (`coveo.ts`)

- Scrape the anonymous ~24h JWT from a Help search page load (cached).
- `POST platform.cloud.coveo.com/rest/search/v2?access_token=<JWT>` with `q`,
  `searchHub: "HTCommunity"`, `numberOfResults`, and an `aq`/`cq` filter on
  `@objecttype` (`HelpDocs`/`KBKnowledgeArticle` for `--source help`;
  `HTReleaseNotesDocumentationC` for `--source release`).
- Returns ranked `{title, url (clickUri), excerpt}` for the agent to then
  `fetch`. No API key, no login.

## Caching (`cache.ts`)

- Content keyed by **normalized URL + doc version** (docs change per release),
  stored in OS cache dir (`~/.cache/sf-docs`, overridable via env; under Claude,
  `${CLAUDE_PLUGIN_DATA}`).
- Catalog/`get_index` and the Coveo token cached (token ~24h).
- `--no-cache` bypasses. Keeps repeat lookups instant and traffic polite.

## Output

- Default **Markdown** (LLM-friendly), with a provenance header.
- `--format json` → `{title, url, source, version, markdown, html}` for chaining.
- `--format html` → cleaned HTML.

## Error Handling

Actionable, structured to stderr so the agent can react:

- Akamai still blocking → one retry with a fresh browser context, then a clear
  "blocked" message.
- Help selector timeout (layout drift) → fall back to full-page readability
  extract + warn (degrade, don't fail).
- 404 / empty body → "not found"; suggest refining or `catalog`/`toc`.
- Non-zero exit on hard failure; warnings do not fail the fetch.

## SKILL.md Orchestration

Frontmatter (open-spec subset only):

```yaml
---
name: sf-docs
description: Retrieve clean, source-grade Salesforce documentation (developer docs,
  Help, Trailhead, release notes) without shadow-DOM or client-render friction. Use
  when the user asks about Salesforce/Apex/SOQL/LWC/Metadata APIs, admin/setup Help
  topics, Trailhead content, or "what changed" in a release.
---
```

Body — decision flow the agent follows:

1. User gave a URL → `sf-docs fetch <url>`.
2. Dev-docs/Apex/LWC reference topic → `sf-docs catalog --grep <topic>` →
   `sf-docs toc <deliverable>` → `sf-docs fetch`.
3. Help or release-notes topic → `sf-docs search "<query>" --source help|release`
   → `sf-docs fetch` the top hit.
4. Anything else → web-search
   `site:developer.salesforce.com OR site:help.salesforce.com OR site:trailhead.salesforce.com <query>`
   → `sf-docs fetch` top 1–3 URLs.
5. Always cite title · URL · version from the provenance header.
6. Invoke as bare `sf-docs` (Claude, on PATH) or `npx sf-docs` (Copilot) — one
   note in the skill covers both.

## Distribution

- **`plugin.json`:** `{ name: "sf-doc-search", version, description,
  "skills": ["./.claude/skills"] }` — reuses the shared folder, no duplication.
- **`marketplace.json`:** single-plugin marketplace pointing at `./`, enabling
  `/plugin marketplace add ehartye/sf-doc-search` → `/plugin install sf-doc-search`.
- **npm:** `cli/` publishes as `sf-docs`; `bin/sf-docs` wraps the installed/
  bundled CLI so Claude users get bare-command + offline use without a global
  install.
- **README:** two install sections (Claude Code / Copilot+VS Code), Node
  prerequisite, system-Chrome note, `--debug` tip.

## Testing (TDD — failing test first)

- **Unit (pure, fast, the bulk):** router URL→source classification
  (table-driven), Atlas deliverable long/short normalization, Markdown
  conversion fidelity (code/tables/anchors), Coveo token parse, cache-key
  derivation.
- **Integration (recorded fixtures):** saved real JSON/HTML responses (one per
  source: Apex page, Help article, Trailhead unit, release note, LWC component)
  replayed for deterministic offline CI. Assert title + non-empty Markdown +
  provenance header.
- **Live smoke (opt-in `--live`, not in CI):** hit each source live to catch
  upstream drift (Akamai/Coveo/selector changes). Run on demand, non-gating.
- **Success criteria:** `sf-docs fetch <known-apex-url>` returns the expected H1
  + a fenced code block; `sf-docs search "sharing rules" --source help` returns
  ranked hits.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Copilot Agent Skills is new/partly experimental (discovery dirs, `context:fork` may shift) | Pin to the stable open-spec frontmatter subset (`name`, `description`); the shared `.claude/skills/` path is read by both today. |
| Akamai / Coveo / Help-selectors change upstream | Headed `--debug` mode for diagnosis; readability fallback on selector failure; opt-in live-smoke suite to detect drift early. |
| System Chrome absent on a machine | Playwright falls back to a bundled Chromium (one-time download). |
| Chromium cold-start latency (~1–2 s) per process | One warm browser reused across a batch of fetches; acceptable for the typical 1–3 fetches per question. (Persistent daemon deferred — YAGNI.) |

## Decisions Locked During Brainstorming

- Sources: developer docs, Salesforce Help, Trailhead, release notes (all four).
- Runtime: **Node/TypeScript**.
- Browser: **headless by default, no popups**; opt-in `--debug` headed mode.
- Packaging: **one plugin dir + shared `.claude/skills/SKILL.md` + bundled CLI**;
  works in Claude Code **and** Copilot; **no MCP**.
- Search division: **agent web-searches → CLI fetches/cleans**; plus a thin
  **Coveo `search` for Help + release notes** only.
- Fetch engine: **Approach A — single headless engine** (clears Akamai + renders
  shadow DOM + parses SSR uniformly).

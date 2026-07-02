---
name: sf-docs
description: Retrieve clean, source-grade Salesforce documentation (developer docs, Help, Trailhead, release notes) without shadow-DOM or client-render friction. Use when the user asks about Salesforce, Apex, SOQL/SOSL, LWC/Aura, Metadata/Tooling/REST APIs, Agentforce, admin or setup Help topics, Trailhead content, or what changed in a Salesforce release.
---

# sf-docs — Salesforce documentation retrieval

You have a CLI named `sf-docs` that fetches clean Markdown from Salesforce's
documentation sources. It clears the developer-docs bot-wall and renders the
shadow-DOM Help pages for you, so prefer it over fetching Salesforce URLs directly.

## First-run check

Before your first `sf-docs` command in a session — and whenever one fails with
"command not found", a browser/launch error, or a version mismatch — run the
**sf-docs-preflight** skill (it runs `sf-docs doctor` and gives exact remediation).
Only proceed once it reports ready.

## Invoking the CLI

Run `sf-docs <command>`. If `sf-docs` is not found on PATH, run `npx sf-docs <command>`
(in Claude Code you may also run `node "${CLAUDE_PLUGIN_ROOT}/cli/dist/index.js" <command>`).

## Decision flow

1. **The user gave a documentation URL** → `sf-docs fetch "<url>"`.
2. **Developer reference (Apex, SOQL, LWC, Metadata/REST APIs, Agentforce, newer product docs):**
   - `sf-docs catalog --grep "<topic>"` to find the right entry. The catalog spans BOTH
     platforms: classic Atlas books (platform `atlas`, e.g. `apexcode`) and newer LWR
     API doc sets (platform `lwr`, e.g. `platform/pub-sub-api`). LWR rows come from the
     /docs/apis directory plus a seeded list of notable doc sets (`ai/agentforce`,
     `platform/lwc`, `platform/mobile-sdk`); anything still missing is fully fetchable
     by URL (next bullets).
   - Atlas: `sf-docs toc <deliverable>` then `sf-docs fetch "<deliverable>/<page>.htm"`.
   - LWR: the nav is hierarchical — `sf-docs toc <catalog-id>/guide` (e.g.
     `ai/agentforce/guide`) lists that level's sections; add `--depth 2` (max 3) to
     expand sub-levels in one call, or run `sf-docs toc "<entry url>"` on a result to
     expand just that section. Then `sf-docs fetch "<page url>"`.
   - If the catalog misses a developer topic, newer content lives at
     `developer.salesforce.com/docs/<area>/<guide>` — fetch such URLs directly,
     or fall through to step 5's domain-restricted web search to find them.
   - For a specific component: `sf-docs component <namespace> <name>` (e.g. `component lightning button`).
3. **Admin / setup / "how do I configure…" (Salesforce Help):**
   - `sf-docs search "<query>" --source help` → `sf-docs fetch "<top result url>"`.
4. **"What changed in <release>" (release notes):**
   - `sf-docs search "<query>" --source release` → `sf-docs fetch "<top result url>"`.
5. **Anything else / unsure** → web-search restricted to the Salesforce doc domains,
   then fetch the best 1–3 URLs:
   `site:developer.salesforce.com OR site:help.salesforce.com OR site:trailhead.salesforce.com <query>`
   then `sf-docs fetch "<url>"` for each.

## Output

Each `fetch` returns Markdown with a provenance header (title, source URL, doc
version). **Always cite that title, URL, and version** when you answer.

## Flags

- `--format md|html|json` (default `md`)
- `--debug` shows the browser (troubleshooting only)
- `--no-cache` forces a fresh fetch
- `search --all-results` includes non-official domains and localized variants
  (default output is official Salesforce domains, English only)

`fetch` accepts multiple URLs in one call (they share one browser session):
`sf-docs fetch "<url1>" "<url2>" ...` — much faster for compiling guides.

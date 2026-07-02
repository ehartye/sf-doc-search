---
name: sf-docs
description: Retrieve clean, source-grade Salesforce documentation (developer docs, Help, Trailhead, release notes) without shadow-DOM or client-render friction. Use when the user asks about Salesforce, Apex, SOQL/SOSL, LWC/Aura, Metadata/Tooling/REST APIs, admin or setup Help topics, Trailhead content, or what changed in a Salesforce release.
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
2. **Developer reference (Apex, SOQL, LWC, Metadata/REST APIs):**
   - `sf-docs catalog --grep "<topic>"` to find the right book (deliverable).
   - `sf-docs toc <deliverable>` to locate the exact page href.
   - `sf-docs fetch "<deliverable>/<page>.htm"` to retrieve it.
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

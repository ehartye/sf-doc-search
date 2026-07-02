# sf-doc-search

Clean Salesforce documentation retrieval for AI coding agents — one plugin for
both **Claude Code** and **GitHub Copilot** (no MCP). A Node CLI (`sf-docs`)
clears the developer-docs bot-wall and renders the shadow-DOM Help pages, so the
agent gets real Markdown instead of empty bodies or shadow-DOM soup.

## What it retrieves

- **Developer docs** (Apex, SOQL, LWC/Aura, Metadata/REST/Tooling APIs) via the
  Atlas JSON API.
- **Salesforce Help** (admin/setup) via headless render.
- **Release notes** via headless render + Coveo search.
- **Trailhead** modules/units via render.

## Requirements

- Node.js 20+.
- Google Chrome installed (preferred). If absent, run `npx playwright install chromium`.

## Install — Claude Code

```
/plugin marketplace add ehartye/sf-doc-search
/plugin install sf-doc-search@sf-doc-search-marketplace
```

Then build the bundled CLI once (or `npm i -g sf-docs`):

```
cd cli && npm install && npm run build
```

## Install — GitHub Copilot / VS Code

First install the CLI: `npm i -g sf-docs` (or rely on `npx sf-docs`). Then pick a
distribution path:

**A. Agent Skill (simplest, well-supported).** Copilot (CLI, coding/cloud agent,
code review, and agent mode in VS Code / JetBrains) auto-discovers the skill.

- Install from this repo: `gh skill install ehartye/sf-doc-search sf-docs`
  (requires GitHub CLI ≥ 2.90.0; preview with `gh skill preview ehartye/sf-doc-search sf-docs`).
- Or drop the repo into your workspace — Copilot scans both `.github/skills/` and
  `.claude/skills/`, and this repo ships the skill in both.

**B. Agent Plugin marketplace (Preview).** This repo also exposes a Copilot plugin
marketplace (`.github/plugin.json` + `.github/plugin/marketplace.json`, which use
the same schema as the Claude Code marketplace):

```
copilot plugin marketplace browse ehartye/sf-doc-search
copilot plugin install sf-doc-search@sf-doc-search-marketplace
```

> **Preview caveat:** Copilot Agent Plugins are a preview feature and the exact
> manifest location (plugin root vs `.github/`) is still stabilizing. If
> `copilot plugin install` can't resolve the manifest, fall back to path **A**
> (`gh skill install`), which is fully supported, and adjust the manifest paths to
> match your installed `copilot` CLI version.

> **Maintainers:** `.github/skills/sf-docs/SKILL.md` is a mirror of
> `.claude/skills/sf-docs/SKILL.md` — keep the two in sync when editing the skill.

## Verify the install

After installing, confirm the CLI is runnable and matches the plugin:

```
sf-docs doctor
```

It checks Node (>= 20), browser availability (system Chrome or bundled Chromium),
and that the running CLI version matches the installed plugin version — printing
exact remediation for anything that's off. Agents can invoke the **sf-docs-preflight**
skill, which wraps this and is referenced as the first step by the `sf-docs` skill.

## CLI usage

```
sf-docs fetch "<url>"                       # any supported source -> Markdown
sf-docs catalog --grep apex                 # find a dev-docs book
sf-docs toc apexcode                        # table of contents for a book
sf-docs component lightning button          # LWC component reference
sf-docs search "sharing rules" --source help
```

Flags: `--format md|html|json`, `--debug` (headed browser), `--no-cache`.

## Development

```
cd cli
npm install
npm test                 # unit tests (offline)
SF_DOCS_LIVE=1 npm test  # also run live network tests
npm run build
```

## Status (verified live)

All source paths work end-to-end against live Salesforce:

- **Developer docs** — `fetch`, `catalog`, `toc` (Atlas JSON API; Akamai cleared).
- **Component library** — `component <ns> <name>` (cx-router JSON).
- **Salesforce Help** — `fetch` of articles (shadow-DOM body extracted) and
  `search --source help` (Coveo discovery).
- **Release notes** — `fetch` + `search --source release`.
- **Trailhead** — `fetch` of module/unit pages.

## Known limitations

- Help and Trailhead output includes a small amount of leading breadcrumb /
  JSON-LD noise that could be trimmed further.
- Relative cross-reference links inside developer-doc pages are emitted as-is
  (not rewritten to absolute browsable URLs); the provenance header carries the
  source URL.
- Selectors and the Coveo token flow track Salesforce's current markup; if
  Salesforce changes it, run with `--debug` and update
  `cli/src/sources/` / `cli/src/browser.ts`.

## License

MIT — see [LICENSE](LICENSE).

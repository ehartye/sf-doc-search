# sf-doc-search

Clean Salesforce documentation retrieval for AI coding agents — one plugin for
both **Claude Code** and **GitHub Copilot** (no MCP). A Node CLI (`sf-docs`)
clears the developer-docs bot-wall and renders the shadow-DOM Help pages, so the
agent gets real Markdown instead of empty bodies or shadow-DOM soup.

## What it retrieves

- **Developer docs — classic Atlas** (Apex, SOQL, LWC/Aura, Metadata/REST/Tooling
  APIs) via the Atlas JSON API.
- **Developer docs — LWR platform** (Agentforce, Pub/Sub API, Models API, and the
  other `developer.salesforce.com/docs/<area>/<guide>` doc sets) via server-rendered
  HTML — catalog, hierarchical toc, and fetch.
- **Salesforce Help** (admin/setup) via headless render, boilerplate stripped.
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

Then build the bundled CLI once:

```
cd "${CLAUDE_PLUGIN_ROOT}/cli" && npm install && npm run build
```

## Install — GitHub Copilot / VS Code

Pick a distribution path:

**A. Agent Plugin marketplace (recommended).** A single plugin manifest
(`.claude-plugin/plugin.json`) and a repo-root `skills/` dir back both this
marketplace and the Claude Code one above — `cli/` and `bin/` ship with the
install, so no separate global CLI install is required:

```
copilot plugin marketplace add ehartye/sf-doc-search
copilot plugin install sf-doc-search@sf-doc-search-marketplace
```

Then build the bundled CLI once:

```
cd "${PLUGIN_ROOT}/cli" && npm install && npm run build
```

**B. Agent Skill only.** If you just want the skill (no bundled CLI), install it
directly: `gh skill install ehartye/sf-doc-search sf-docs` (requires GitHub CLI
≥ 2.90.0; preview with `gh skill preview ehartye/sf-doc-search sf-docs`). You'll
still need the CLI itself — clone this repo and `cd cli && npm install && npm run
build`, or run it via `npx` from a local checkout.

> **Maintainers:** the CLI/plugin/marketplace versions must all match. Enforced by
> `cli/test/versions-in-sync.test.ts` (part of `npm test`), so drift fails the suite.
> When bumping the version, update `cli/package.json`, `.claude-plugin/plugin.json`,
> `.claude-plugin/marketplace.json`, and `.github/plugin/marketplace.json` together.

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
sf-docs fetch "<url>" ["<url>" ...]         # any supported source -> Markdown; multiple URLs share one browser
sf-docs catalog --grep apex                 # find a doc set (columns: id, platform atlas|lwr, title)
sf-docs toc apexcode                        # Atlas book table of contents
sf-docs toc ai/agentforce/guide --depth 2   # LWR guide nav (hierarchical; --depth 1-3 expands sub-levels in one call)
sf-docs component lightning button          # LWC component reference
sf-docs search "sharing rules" --source help
```

Flags: `--format md|html|json`, `--debug` (headed browser), `--no-cache`.

- `search --all-results` — include non-official domains and localized variants (default output is official Salesforce domains, English only)
- LWR catalog rows come from the `/docs/apis` directory plus a seeded list of notable
  doc sets (`ai/agentforce`, `platform/lwc`, `platform/mobile-sdk`); anything still
  missing is fully fetchable by URL.
- Every fetch's provenance header carries the source URL, doc version (or release),
  and retrieved date.

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

- **Developer docs (Atlas)** — `fetch`, `catalog`, `toc` (Atlas JSON API; Akamai cleared).
- **Developer docs (LWR)** — `fetch` (clean titles + lwr provenance), `catalog`
  (merged with Atlas, platform-tagged), `toc` (hierarchical drill-down).
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

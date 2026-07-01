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
/plugin install sf-doc-search
```

Then build the bundled CLI once (or `npm i -g sf-docs`):

```
cd cli && npm install && npm run build
```

## Install — GitHub Copilot / VS Code

1. Install the CLI: `npm i -g sf-docs` (or rely on `npx sf-docs`).
2. Place this repo's `.claude/skills/sf-docs/` in your workspace (Copilot
   auto-discovers `.claude/skills/`).

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

Working end-to-end against live Salesforce:

- **Developer docs** — `fetch`, `catalog`, `toc` (Atlas JSON API; Akamai cleared).
- **Component library** — `component <ns> <name>` (cx-router JSON).
- **Trailhead** — `fetch` of module/unit pages.
- **Help / release-notes discovery** — `search --source help|release` (Coveo).

## Known limitations

- **Help / release-notes article *body* rendering is not yet working.** `search`
  returns correct Help result URLs, but fetching a Help article renders the
  Lightning shell without the shadow-DOM article body (the `/s/articleView`
  route needs further reverse-engineering of Salesforce's article id → route
  mapping and body selector). Tracked as the top follow-up.
- Trailhead output includes minor JSON-LD/breadcrumb noise at the top that
  should be stripped.
- Relative cross-reference links inside developer-doc pages are emitted as-is
  (not rewritten to absolute browsable URLs); the provenance header carries the
  source URL.
- Selectors and the Coveo token flow track Salesforce's current markup; if
  Salesforce changes it, run with `--debug` and update
  `cli/src/sources/` / `cli/src/browser.ts`.

## License

MIT — see [LICENSE](LICENSE).

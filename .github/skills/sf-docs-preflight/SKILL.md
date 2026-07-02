---
name: sf-docs-preflight
description: Preflight/health check for the sf-docs CLI — verify it is installed and runnable, that a browser is available, and that the running CLI version matches the installed plugin version. Use once before the first sf-docs command in a session, and whenever an sf-docs command fails with "command not found", a browser/launch error, or a version mismatch.
---

# sf-docs preflight

Confirms the `sf-docs` CLI (the engine behind the `sf-docs` skill) is actually
usable before you rely on it. Run this once per session before the first
`sf-docs` command, or any time `sf-docs` misbehaves.

## Step 1 — run the check

Run the doctor, trying these in order until one executes:

1. `sf-docs doctor`
2. `npx sf-docs doctor`
3. `node "${CLAUDE_PLUGIN_ROOT}/cli/dist/index.js" doctor`  (Claude Code, if the bundled CLI is built)

It prints one line per check and a final `sf-docs is ready.` / `NOT ready`, and
exits non-zero when it isn't ready.

## Step 2 — if NO variant runs (CLI not installed)

The plugin ships the skill, not a runnable binary — the CLI must be installed once:

- Preferred: `npm i -g sf-docs` (then re-run `sf-docs doctor`).
- Or build the bundled copy: `cd "${CLAUDE_PLUGIN_ROOT}/cli" && npm install && npm run build`, then invoke via `node "${CLAUDE_PLUGIN_ROOT}/cli/dist/index.js"` (or `npx sf-docs`).

## Step 3 — interpret the checks and remediate

- `!! node` → install/switch to Node.js >= 20.
- `!! browser` → install Google Chrome, or run `npx playwright install chromium`.
- `!! plugin-version` (CLI ≠ plugin) → the `sf-docs` on PATH doesn't match the
  installed plugin. Update it: `npm i -g sf-docs@<plugin-version>` (or rebuild the
  bundled CLI). This is a warning, not a hard block, but versions should align.

## Step 4 — report

State clearly whether `sf-docs` is ready. If not, give the single most relevant
remediation command from above. Only proceed to `sf-docs` doc commands once the
check reports ready (Node + browser OK).

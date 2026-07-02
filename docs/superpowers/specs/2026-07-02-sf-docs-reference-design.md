# sf-docs-reference — official-sources reference guide skill

**Date:** 2026-07-02
**Status:** Approved (design)
**Type:** New skill (agent orchestration). No new CLI code.

## Problem

Users want a comprehensive, trustworthy reference guide on a specific Salesforce
topic, compiled *strictly* from official Salesforce documentation and focused on
the most current information. Ad-hoc research drifts into blogs, Stack Exchange,
and model-improvised content, and silently papers over pages that failed to
retrieve. This skill removes that drift: it compiles only from official sources,
records every source, and surfaces retrieval failures and coverage gaps loudly
instead of filling them.

## Non-goals

- No new CLI code. All retrieval goes through the existing `sf-docs` CLI/skill
  (`catalog`, `toc`, `fetch`, `search`). Per the project constraint, logic lives
  in the CLI; this skill is orchestration + discipline.
- Not a search tool or a single-page fetcher — those are the `sf-docs` skill.
- Does not evaluate or rank non-official sources; they are simply excluded.

## What "official" means

Exactly these domains count as official Salesforce sources:

- `developer.salesforce.com` (developer docs, component library, release notes)
- `help.salesforce.com` (Help articles, release notes)
- `trailhead.salesforce.com` (Trailhead)

Nothing else is eligible for the guide: no Stack Exchange / Salesforce Ben /
blogs / community posts, and **no content improvised from model training
knowledge**. If it did not come out of `sf-docs fetch`/`search` against one of
those domains, it does not go in the guide.

## Workflow the skill instructs the agent to follow

1. **Preflight.** Run the `sf-docs-preflight` skill first (as the `sf-docs` skill
   requires). Do not proceed unless it reports ready.
2. **Scope.** Restate the topic as 4–7 concrete, checkable sub-points to cover.
   This makes "coverage" and "gaps" objective later.
3. **Identify sources.** For each sub-point, find the official source by
   **delegating to the `sf-docs` skill's decision flow** (`catalog --grep`,
   `toc`, `search --source help|release`, or a Salesforce-domain-restricted web
   search that then feeds `sf-docs fetch`). Do not restate CLI mechanics here —
   `sf-docs` is the retrieval authority.
4. **Retrieve.** `sf-docs fetch` each page, preferring the latest doc version the
   catalog/TOC reports. Capture the provenance header (title, source URL, doc
   version) that every fetch returns.
5. **Compile** the retrieved material into the fixed template (below). Every
   substantive claim cites a reference number.
6. **Write** the guide to `./sf-reference/<topic-slug>.md` (create the folder if
   needed). Report the path.

## Fixed output template

```
# <Topic> — Salesforce reference

> Compiled from official Salesforce sources on <retrieved-date>.
> <If any core sub-point is unsourced, a one-line warning here.>

## Overview
## Key concepts
## Common tasks / how-to
## Gotchas & limits
## Gaps & retrieval failures
## References
```

- **Gaps & retrieval failures** — every fetch error and every sub-point with no
  official source, named explicitly (which sub-point, what was tried, what
  failed). Never empty by omission: if there were none, state "None."
- **References** — a numbered list. Each entry records: title · URL · doc version
  (or release) · retrieved-date. Body claims cite `[n]`.

## Strictness rules (hard directives in the skill)

These are the point of the skill and are written as non-negotiable instructions:

1. **Official only.** Only the three domains above. No other source, and no
   model-knowledge fill-in, enters the guide.
2. **Fail fast, log, move on.** On a retrieval error or a sub-point with no
   official source: stop pursuing it, record it in *Gaps & retrieval failures*,
   and continue. Do **not** substitute non-official content or improvise.
3. **Surface early.** If a *core* sub-point lands in Gaps, say so in the header
   warning at the top — the guide is only as good as its sourcing.
4. **Currency.** Prefer the newest doc version. Dev-doc fetches use the latest
   catalog version; Help/release results note the release. Every reference
   records version + retrieved-date so staleness is visible. If a page looks
   superseded, note it rather than guessing.

## Currency handling

The `sf-docs` provenance header already carries the doc version per page; the
skill just requires it to be recorded in each reference and prefers the latest
version when the catalog/TOC offers a choice. No new version-resolution logic.

## Packaging

- New skill dir: `.claude/skills/sf-docs-reference/SKILL.md`.
- Byte-identical mirror: `.github/skills/sf-docs-reference/SKILL.md` (Copilot).
- Frontmatter: `name: sf-docs-reference` (must match dir) + a `description` that
  triggers on "reference guide", "compile docs on <topic>", "official Salesforce
  reference", etc.
- Cross-links: delegates retrieval to `[[sf-docs]]` and preflight to
  `[[sf-docs-preflight]]`.

## Testing / verification

- The existing `versions-in-sync` test already asserts every `.claude/skills/*`
  has a byte-identical `.github/skills/*` mirror; adding the new pair extends
  that coverage automatically — the test must stay green.
- Manual live check: run the skill for one topic (e.g. "async Apex") and confirm
  the produced `./sf-reference/async-apex.md` has (a) only official URLs in
  References, (b) a populated Gaps section or an explicit "None", and (c) version
  + retrieved-date on every reference.

No unit tests for the skill body itself (it is prose instructions, not code); the
sync test plus the manual live check are the verification surface.
```

---
name: sf-docs-reference
description: Compile a comprehensive Salesforce reference guide on a specific topic, strictly from official Salesforce sources (developer.salesforce.com, help.salesforce.com, trailhead.salesforce.com), with a mandatory reference list and explicit gap reporting. Use when the user asks for a "reference guide", "cheat sheet", "compile docs on <topic>", "official Salesforce reference", or a written summary of a Salesforce topic grounded only in official documentation.
---

# sf-docs-reference — official-sources reference guide

Compile a single Markdown reference guide on one Salesforce topic, built **only**
from official Salesforce documentation. This skill orchestrates retrieval through
the `sf-docs` skill; it does not fetch or search on its own. Its job is
discipline: official sources only, every source cited, and every gap or retrieval
failure surfaced instead of hidden.

## Official sources — the only ones allowed

Content may come **only** from these domains, via `sf-docs`:

- `developer.salesforce.com` (developer docs, component library, release notes)
- `help.salesforce.com` (Help articles, release notes)
- `trailhead.salesforce.com` (Trailhead)

Nothing else is eligible: no Stack Exchange, Salesforce Ben, blogs, or community
posts, and **no content improvised from your own training knowledge**. If it did
not come out of an `sf-docs` fetch/search against one of those domains, it does
not go in the guide.

## Workflow

1. **Preflight.** Run the **sf-docs-preflight** skill first. Do not proceed unless
   it reports ready.
2. **Scope.** Restate the topic as 4–7 concrete, checkable sub-points to cover.
   This makes coverage and gaps objective. Show them to the user.
3. **Identify sources & retrieve.** For each sub-point, use the **sf-docs** skill
   and its decision flow to find and fetch the official source (catalog/toc for
   developer reference, `search --source help|release` for Help/release notes,
   or a Salesforce-domain-restricted web search that then feeds `sf-docs fetch`).
   Do not restate `sf-docs` command mechanics — that skill is the retrieval
   authority. Prefer the latest doc version the catalog/TOC reports.
4. **Capture provenance.** Every `sf-docs fetch` returns a provenance header
   (title, source URL, doc version). Record it for each page — you need it for
   the References list.
5. **Compile** into the fixed template below. Every substantive claim cites a
   reference number `[n]`.
6. **Write** the guide to `./sf-reference/<topic-slug>.md` (create the folder if
   needed) and report the path.

## Hard rules — do not deviate

1. **Official only.** Only the three domains above. No other source, and no
   model-knowledge fill-in, enters the guide.
2. **Fail fast, log, move on.** On a retrieval error, or a sub-point with no
   official source: stop pursuing it, record it in *Gaps & retrieval failures*
   (which sub-point, what you tried, what failed), and continue. Do **not**
   substitute non-official content or improvise from training knowledge.
3. **Surface early.** If a *core* sub-point ends up in Gaps, put a one-line
   warning in the header at the top of the guide — it is only as good as its
   sourcing. Also tell the user in chat.
4. **Currency.** Prefer the newest doc version. Record version (or release) and
   retrieved-date on every reference so staleness is visible. If a page looks
   superseded, note it rather than guessing.

## Fixed output template

    # <Topic> — Salesforce reference

    > Compiled from official Salesforce sources on <retrieved-date>.
    > <One-line warning here only if a core sub-point is unsourced.>

    ## Overview
    ## Key concepts
    ## Common tasks / how-to
    ## Gotchas & limits
    ## Gaps & retrieval failures
    ## References

- **Gaps & retrieval failures** is never empty by omission. If there were none,
  write "None." Otherwise name each gap: the sub-point, what was tried, what
  failed.
- **References** is a numbered list. Each entry: `title · URL · doc version (or
  release) · retrieved-date`. Body claims cite `[n]`.

## Report

State where the file was written, how many sub-points were fully sourced vs.
listed in Gaps, and the count of references. Cite the guide's own References when
answering follow-up questions.

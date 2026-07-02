# sf-docs-reference Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use h-superpowers:subagent-driven-development, h-superpowers:team-driven-development, or h-superpowers:executing-plans to implement this plan (ask user which approach). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `sf-docs-reference` skill that compiles a comprehensive Salesforce reference guide strictly from official sources, with a mandatory reference list and explicit gap reporting.

**Architecture:** A pure agent-orchestration skill (prose `SKILL.md`, no CLI code). It delegates all retrieval to the existing `sf-docs` skill and preflight to `sf-docs-preflight`, then compiles fetched official content into a fixed Markdown template written to `./sf-reference/<topic-slug>.md`. The skill is mirrored byte-for-byte into `.github/skills/` for GitHub Copilot; the existing `versions-in-sync` test enforces that mirror.

**Tech Stack:** Agent Skills open format (`SKILL.md` + YAML frontmatter), Vitest (existing `versions-in-sync` test), git.

---

## File Structure

- `.claude/skills/sf-docs-reference/SKILL.md` — the skill (source of truth).
- `.github/skills/sf-docs-reference/SKILL.md` — byte-identical Copilot mirror.
- `cli/test/versions-in-sync.test.ts` — existing test; **must be edited**. Its mirror check is a hardcoded list (`it.each(["sf-docs", "sf-docs-preflight"])` at line 36), NOT a dynamic glob, so the new skill must be added to that array. Once added, it byte-compares source vs mirror and serves as the red/green anchor.

No `plugin.json` change: it already registers the whole `./.claude/skills` directory, so a new subfolder is picked up automatically. No version bump (adding a skill is additive; confirm with user if they want one).

---

### Task 1: Author the skill and prove the mirror-sync test catches a missing mirror

**Files:**
- Create: `.claude/skills/sf-docs-reference/SKILL.md`
- Create: `.github/skills/sf-docs-reference/SKILL.md`
- Modify: `cli/test/versions-in-sync.test.ts:36` (add the new skill to the mirror list)

- [ ] **Step 1: Write the skill file (source of truth)**

Create `.claude/skills/sf-docs-reference/SKILL.md` with exactly this content:

```markdown
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
```

- [ ] **Step 2: Add the new skill to the mirror-sync test**

Edit `cli/test/versions-in-sync.test.ts` line 36, adding `"sf-docs-reference"` to the array:

```ts
  it.each(["sf-docs", "sf-docs-preflight", "sf-docs-reference"])(
```

- [ ] **Step 3: Run the sync test to verify it FAILS (no mirror yet)**

Run: `cd cli && npx vitest run test/versions-in-sync.test.ts`
Expected: FAIL — the new `sf-docs-reference` case fails because
`.github/skills/sf-docs-reference/SKILL.md` does not exist yet (readFileSync
throws / ENOENT). This confirms the test now guards the new skill.

- [ ] **Step 4: Create the byte-identical Copilot mirror**

Copy the source file to the mirror path verbatim (no edits):

```bash
mkdir -p .github/skills/sf-docs-reference
cp .claude/skills/sf-docs-reference/SKILL.md .github/skills/sf-docs-reference/SKILL.md
```

- [ ] **Step 5: Run the sync test to verify it PASSES**

Run: `cd cli && npx vitest run test/versions-in-sync.test.ts`
Expected: PASS — mirror now byte-identical.

- [ ] **Step 6: Run the full suite to confirm nothing regressed**

Run: `cd cli && npx vitest run`
Expected: PASS — same totals as before plus one new mirror case (baseline 77 pass + 1 skipped → 78 pass + 1 skipped).

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/sf-docs-reference/SKILL.md .github/skills/sf-docs-reference/SKILL.md cli/test/versions-in-sync.test.ts
git commit -m "feat: add sf-docs-reference skill (official-sources reference guides)"
```

---

### Task 2: Live verification — compile one real guide

This task has no automated test (the skill body is prose). It is a manual live
run that proves the skill produces a correct guide against real Salesforce
sources. Requires network + a usable browser (the `sf-docs` engine).

- [ ] **Step 1: Preflight the CLI**

Run: `sf-docs doctor` (or `npx sf-docs doctor`, or `node cli/dist/index.js doctor`)
Expected: `sf-docs is ready.` If not, resolve per the `sf-docs-preflight` skill before continuing.

- [ ] **Step 2: Execute the skill for a known topic**

Invoke the `sf-docs-reference` skill with topic **"async Apex"**. Let it run its
full workflow (scope → retrieve via `sf-docs` → compile → write).

- [ ] **Step 3: Verify the output guide**

Open `./sf-reference/async-apex.md` and confirm ALL of:
- Every URL in **References** is on `developer.salesforce.com`,
  `help.salesforce.com`, or `trailhead.salesforce.com` — no other domain.
- Every reference entry has a doc version (or release) AND a retrieved-date.
- **Gaps & retrieval failures** is present and either lists real gaps or says
  "None" — it is not missing.
- Body claims cite `[n]` reference numbers.
- No section contains content that could not have come from a fetched page
  (spot-check 2–3 claims against their cited reference).

Expected: all checks pass. If the skill improvised or pulled a non-official
domain, fix the skill's hard rules wording and re-run before committing.

- [ ] **Step 4: Clean up the sample artifact (do not commit generated guides)**

```bash
rm -rf sf-reference
```

Confirm `sf-reference/` is not tracked. If it should never be committed, note it
for a `.gitignore` follow-up (ask the user — out of scope for this plan).

- [ ] **Step 5: No commit**

Task 2 produces no source changes (only a throwaway guide). Nothing to commit.

---

## Self-Review

- **Spec coverage:** Official-domains definition (Task 1 skill body) ✓; workflow
  incl. preflight delegation (Step 1 body) ✓; fixed template with Gaps +
  References (body) ✓; strictness rules incl. fail-fast + official-only +
  currency (body) ✓; write to `./sf-reference/<slug>.md` (body + Task 2) ✓;
  byte-identical mirror + sync test edit + red/green (Task 1 Steps 2–5) ✓; delegate to `sf-docs`
  and `sf-docs-preflight` (body) ✓; no CLI/version changes (File Structure) ✓;
  manual live check (Task 2) ✓.
- **Placeholders:** none — full skill content is inline; `<Topic>` / `<slug>` /
  `<retrieved-date>` are intentional template tokens, not plan TODOs.
- **Decomposition consistency:** skill name `sf-docs-reference` and path used
  identically across File Structure, Task 1, and Task 2. Output path
  `./sf-reference/<topic-slug>.md` consistent throughout.
- **Buildability:** exact file paths, exact commands, exact expected test
  outcomes; a fresh engineer can copy the skill body verbatim and run the two
  commands. The one judgment step (Task 2 Step 3 verification) has an explicit
  checklist.
```

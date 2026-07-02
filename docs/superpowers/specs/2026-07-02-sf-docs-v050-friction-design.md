# sf-docs v0.5.0 — shared browser context, toc depth, LWR catalog seeds

**Date:** 2026-07-02
**Status:** Approved (design; direction pre-approved by user — "deliver all 3")
**Type:** CLI feature bundle + one skill-prose line. One release (0.5.0).

## Problem

The v0.4.0 live guide-compilation run left three unresolved frictions:

1. **Repeated Akamai warmup.** Every page-context fetch (`fetchJsonInPage`,
   `fetchTextInPage`) creates a fresh browser context and must re-navigate the
   warmup page, because Akamai cookies live per-context. Correct (fixed a real
   bug in 0.4.0) but wasteful: every Atlas/LWR raw fetch double-navigates, and
   batch operations repay the cost per URL.
2. **LWR toc drill-down costs one CLI invocation per level.** The LWR nav is
   hierarchical (each page's SSR HTML carries only its local level), so exploring
   an unfamiliar guide takes 2–4 `toc` runs, each paying browser launch.
3. **Notable LWR doc sets are invisible to `catalog`.** `/docs/apis` enumerates
   API doc sets only (23 entries). Verified missing live: `ai/agentforce`,
   `platform/lwc`, `platform/mobile-sdk` — all real, fetchable doc roots.

Plus one minor: the `sf-docs-reference` skill hand-transcribes its References
list although `fetch --format json` already returns structured
`{title, url, version}` per document.

## Probe findings (2026-07-02, live)

- `/docs/ai` redirects to `/developer-centers/agentforce`, whose raw HTML carries
  exactly one doc root (`ai/agentforce`). The `/developer-centers` index lists
  **37 centers** (raw-parseable). A two-hop crawl (index → 37 center pages) would
  recover doc roots but costs ~38 fetches for a handful of additions — rejected
  (see Non-goals).
- Confirmed live via HTTP 200: `/docs/platform/lwc/guide`,
  `/docs/platform/mobile-sdk/guide` exist and are absent from `/docs/apis`.

## Design

### 1. Shared browser context (per BrowserManager)

`BrowserManager` keeps **one context for its lifetime** instead of one per call:

- New private `context()` — lazily creates a single `BrowserContext` from
  `launch()`; `page()` opens pages in it. Methods close **their page** after use,
  never the context. `close()` closes the browser (context dies with it).
- A **persistent docs page** (not an origin memo): evaluate-fetches must run from
  a page that IS on developer.salesforce.com — a fresh page in a warmed context
  sits on `about:blank`, making its `fetch()` cross-origin. So one page is
  navigated to the warmup URL once and reused for every
  `fetchJsonInPage`/`fetchTextInPage` evaluate. It is assigned only after a
  successful navigation (a failed warmup must not poison the slot). Lazy init is
  documented as sequential-only (one CLI command per process).
- Navigation-based methods (`renderAndExtract`, `renderFull`, `postJsonInPage`,
  `captureCoveoToken`) share the context's cookies, reducing repeated bot-wall
  negotiation on help.salesforce.com; `postJsonInPage` still navigates its help
  origin per call (searches are rare — accepted).
- Failure semantics unchanged: per-call errors still throw; a crashed context is
  not resurrected mid-process (acceptable: the CLI is short-lived per invocation).

### 2. `toc --depth <n>` (LWR drill-down in one session)

- `sf-docs toc <target> --depth <n>` (default 1, max 3). Depth 1 = current
  behavior. For n > 1: after parsing level 1, fetch each entry's URL (sequential,
  same BrowserManager) and merge its scoped TOC; repeat for the next level.
  Dedupe by href across the whole result; already-seen pages are not re-fetched.
- Safety cap: stop expanding once the merged TOC reaches **150 entries** and
  print a stderr note (`sf-docs warning: toc truncated at 150 entries — narrow
  the target or reduce --depth`). No silent truncation.
- Atlas targets ignore `--depth` (their toc is already the full tree); if given,
  print a stderr note and proceed.
- Output shape unchanged (flat `href\ttext` / JSON array), so consumers and the
  skill prose stay valid; the skill gains a mention of `--depth`.

### 3. LWR catalog seed roots

- New constant in `cli/src/sources/lwr.ts`:
  `LWR_SEED_ROOTS: { id, title }[]` = `ai/agentforce` (Agentforce Developer
  Guide), `platform/lwc` (Lightning Web Components Developer Guide),
  `platform/mobile-sdk` (Mobile SDK Development Guide).
- `listLwrCatalog` merges seeds with the parsed `/docs/apis` entries, deduped by
  id (parsed entry wins on title collision — the live page is fresher).
- Seeds are additive-only and cheap to extend; a stale seed (root 404s) fails at
  fetch time with the existing actionable error, not silently.
- Skill prose: soften the "non-API doc sets may be absent" caveat to reflect that
  notable ones are seeded, keeping the direct-URL fallback line.

### 4. `sf-docs-reference` skill: mechanical citations

One addition to the skill's workflow step 3/4 prose: retrieve with multi-URL
`sf-docs fetch --format json "<url>"...` where practical and build the References
list from the returned array's `title`/`url`/`version` fields plus today's date,
instead of hand-transcribing headers. Byte-mirrored to `.github/skills/`.

## Non-goals

- **No developer-centers crawl** for catalog discovery (37 fetches for a handful
  of roots; the seed list covers the known gap and is trivially extensible).
- No parallel fetching inside `--depth` expansion (sequential over the shared
  context is fast enough once warmup is amortized).
- No context resurrection/retry on browser crash mid-process.
- No change to Atlas/help/component fetch behavior beyond the shared context.

## Testing

- Unit (TDD): shared-context lifecycle (one `newContext` across N calls, pages
  closed per call, warmup navigations memoized per origin) via the existing fake
  playwright stubs in `browser.test.ts`; `--depth` merge/dedupe/cap logic as a
  pure function over stubbed `fetchTextInPage`; seed merge/dedupe in
  `lwr.test.ts`; versions-in-sync stays green (0.5.0 across six declarations,
  skill mirrors byte-identical).
- Live gate (controller-run): `catalog --grep agentforce` shows the `lwr` seed
  row; `catalog --grep lwc` shows `platform/lwc`; `toc ai/agentforce/guide
  --depth 2` returns strictly more entries than depth 1 and includes agent-api
  pages; timed comparison shows a multi-URL Atlas fetch and a catalog run
  measurably faster than 0.4.0 (warmup amortized); full guide-compile smoke
  optional.

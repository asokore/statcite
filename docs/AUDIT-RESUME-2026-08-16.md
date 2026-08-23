# Site audit: resume point, 2026-08-16

**Status: PAUSED by the owner mid-audit. Resume from section 3.** Delete this
file when the audit is finished.

## 1. What the task is

Owner instruction, verbatim intent: *review previous issues and audits for
anything missed, then run a full audit of the website to ensure it is running
well and has the best features; fix anything that needs fixing, improve
anything that can be improved; plan and strategise; do not return until done.*

The plan adopted: (1) recover prior audit findings, (2) live site sweep,
(3) API surface, (4) cross-document consistency, (5) accessibility and mobile,
(6) feature improvements. Steps 1 to 4 are done. Steps 5 and 6 are not started.

## 2. Done and verified, as of this pause

Everything below is committed on `main`, pushed via `public-sync`, deployed
(worker version `188b216f`), and confirmed against the live origin.

- **`tools/audit-live.py`** exists and passes **68/68** against the deployed
  service. It re-checks the 41 defects in `audit-defects.json` plus SEO
  metadata on every page, internal links, published counts, the `/v1` index
  examples, and both MCP protocol eras. Run it first on resume; if it is not
  68/68, something regressed since this pause.
- **All 41 prior defects are fixed on live.** Verified by the harness rather
  than by reading the repository.
- **Search no longer recommends `euro_area_hicp` for non-euro countries.**
  "barbados inflation" and "jamaica inflation" both ranked it third, and
  following it returned 422. Fixed in `searchIndicators` with a structural
  rule (SDMX key with no `{ISO2}` is fixed-geography). Three tests, mutation-
  proven.
- **Homepage no longer claims `country_snapshot` returns "11 indicators".**
  Measured: 11 for USA/DEU, 10 for JAM/GUY, 9 for BRB, 5 for AIA/MSR. The
  count is removed; `BRIEF.md` records the spread and says not to put a fixed
  number back.

## 3. RESUME HERE: what remains

In the order they should be taken.

### 3a. Accessibility and mobile (step 5, not started)

Nothing on the site has been checked for accessibility or small screens. Use
the in-app browser (`preview_start` with the live URL), then:

- `resize_window` to the mobile preset and screenshot every page in
  `PAGES = ["/", "/docs", "/sources", "/bench", "/privacy", "/terms"]`.
  Look for horizontal overflow, overlapping cards, unreadable code blocks.
- Contrast: the site is dark (`#0b0f14` on `#dbe4ec`, secondary `#8fa1b0`).
  Probe a NON-root element with `javascript_tool` and `getComputedStyle`; the
  preview pane pins root colours, so checking `body` is fake (see memory
  `preview-pane-pins-root-colours`).
- Keyboard: tab through the homepage; every interactive element must show
  focus. Check the "Connect" CTA and any copy-to-clipboard buttons.
- Headings: one `h1` per page, no skipped levels. `grep -c "<h1"` per file.
- Images: `og.png` and the icons need `alt` where they appear inline.
- Add whatever is found as checks in `tools/audit-live.py` so it cannot
  regress silently. Structural checks (headings, alt, lang attribute, viewport
  meta) can be static; contrast and overflow cannot.

### 3b. Feature improvements (step 6, not started)

Candidates, none yet evaluated. Evaluate against the growth plan in
`docs/GROWTH-PLAN-2026-08.md` and the venture roadmap before building any.

- The `/try` page: does one exist and does it work? The decision record on
  user counting suggested a one-line "what do you use this for" prompt there.
- `llms.txt` and `llms-full.txt`: re-read against the current tool count and
  the CaribStat catalogue (16 CBB categories, 7 ECCB tables). They were last
  swept before Phase 3 doubled the CBB corpus.
- `openapi.json`: does it document the `#Row Label[n]` occurrence selector and
  the `caribstat/` id form? Both shipped this week.
- `site/docs.html` changelog: confirm it covers everything deployed today.
  The audit harness only checks the NEWEST version number is present, not that
  the entries describe what shipped.
- The 404 page: check it links back and carries the site chrome.

### 3c. Close out

- Re-run `python tools/audit-live.py`; it must be clean.
- Run the two independent data verifiers (`caribstat/README.md` has the
  commands); they must report zero disagreements.
- `npm test` in `server/`, `node --test "tools/**/*.test.mjs"` in
  `caribstat/`.
- Commit, push via `public-sync`, confirm the embargo count is 0.
- Delete this file.

## 4. Things learned during this audit that a resumer needs

- **Do not GET-probe `/v1/verify_claims`.** The index documents it as POST-only
  and the 405 is correct. The harness now skips anything the index marks
  `(POST`.
- **`grep -rn` across the repo root hangs.** `caribstat/data`, `.capture` and
  `bench` are large. Use the Grep tool with a glob exclusion, or target paths.
- **The heredoc hook blocks any heredoc carrying code.** Write scripts to the
  scratchpad with the Write tool and run them by path. Prose heredocs for
  `git commit -F -` are fine.
- **`/tmp` is a Git Bash path.** Windows Python cannot open it. Put scratch
  files under the session scratchpad directory.
- **Measure before you write a number.** The "11 indicators" fix was itself
  wrong on the first attempt ("up to 11") because the attempted set is larger
  than 11. Count from the code, then from the live response, then write.

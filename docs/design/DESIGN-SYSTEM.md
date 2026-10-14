# Observatory kit: design system

Written 14 October 2026 for the StatCite redesign (reference observations: `REFERENCE-artcraft-2026-10.md`, font record: `FONTS.md`). This file is the contract for the reusable kit. It names no owner, employer or venture. Probed on 14 October 2026: every ratio below is the output of `tools/contrast.mjs` run against `site/assets/sc.css` and `docs/design/brand-atlas.css`. Browser measurements (layout shift, frame cost, Lighthouse, console, widths) are recorded in the verification table in section 9.

## 1. What the kit is

A dark, instrument-styled page shell for sites that bots and people both read. Every fact stays in server-sent HTML. The orbit, arcs, ticker, section bars and ruler are decoration layered on top, hidden from assistive technology and absent from the page's text content.

The kit is `site/assets/sc.css` layers 2 to 4, `site/assets/sc.js`, the fonts directory layout, the test file `server/test/site-design.test.ts` and this document. Layer 1 of `sc.css` is the brand block, and it is the only part a new site rewrites. Today the kit lives inside the StatCite repository because StatCite is its only user. It moves to its own repository when a second site adopts it. These sites have no build step, so a copied file is the honest dependency.

Probed on 14 October 2026 with `wc -c`: `sc.css` is 13,885 bytes against a 14,000 byte cap and `sc.js` is 4,985 bytes against a 5,000 byte cap. For comparison `site/index.html` is 65,078 bytes against a 66,000 byte cap. The caps are asserted by test (a) in section 9.

## 2. Tokens

The kit addresses colour only through these names. Floors: 4.5:1 for text, 3:1 for control boundaries and focus rings, none for hairline separators (WCAG 1.4.11 does not cover them). Ratios are WCAG 2.x relative luminance, computed by `tools/contrast.mjs`.

### 2.1 Colour, StatCite brand (layer 1 of sc.css)

| Token | Hex | Role | Measured contrast |
|---|---|---|---|
| `--bg` | `#0e0f13` | page ground | |
| `--bg-2` | `#15171d` | code blocks, ticker band, orbit card fill | |
| `--card` | `#171a21` | cards, panels, details, form fields | |
| `--sbar-fill` | `#121318` | sticky section bar, a solid fill with no transparency and no backdrop blur | |
| `--line` | `#262a33` | hairlines, ring base stroke, minor ticks | 1.33:1 on bg (exempt) |
| `--line-strong` | `#626b7c` | field and tab borders, major ticks, control affordance | 3.57:1 on bg, 3.24:1 on card |
| `--text` | `#e8eaf0` | headings, body | 15.92:1 bg, 14.89:1 bg-2, 14.47:1 card, 15.42:1 sbar-fill |
| `--text-2` | `#a3a9b8` | leads, captions, nav links, bar labels, table headers | 8.14:1 bg, 7.61:1 bg-2, 7.40:1 card, 7.88:1 sbar-fill |
| `--text-3` | `#7c8494` | footer, footnotes, ruler labels | 5.09:1 bg, 4.76:1 bg-2, 4.63:1 card, 4.93:1 sbar-fill |
| `--link` | `#6fb4ff` | inline links | 8.80:1 bg, 8.00:1 card |
| `--accent` | `#3fd68f` | primary button, ruler needle, active bar number | 10.24:1 bg, 9.31:1 card |
| `--on-accent` | `#07110c` | text on the primary button | 10.26:1 on accent |
| `--fam-1` | `#4da3ff` | family 1 (arc, card rule, focus ring) | 7.30:1 bg, 6.82:1 bg-2, 6.63:1 card (focus ring) |
| `--fam-2` | `#b48cff` | family 2 | 7.42:1 bg, 6.94:1 bg-2 |
| `--fam-3` | `#f2b544` | family 3 | 10.46:1 bg, 9.78:1 bg-2 |
| `--fam-4` | `#3fd68f` | family 4 (declared apart from accent so a brand can split them) | 10.24:1 bg, 9.58:1 bg-2 |
| `--v-match` | `#3fd68f` | verdict match | 10.24:1 bg, 9.31:1 card |
| `--v-close` | `#f2b544` | verdict close | 10.46:1 bg, 9.51:1 card |
| `--v-mismatch` | `#ff6b6b` | verdict mismatch, refused, error text | 6.90:1 bg, 6.27:1 card |
| `--v-cannot` | `#a3a9b8` | verdict cannot_verify | 8.14:1 bg, 7.40:1 card |

Aliases kept for existing page markup: `--fam-wb`, `--fam-imf`, `--fam-ecb`, `--fam-carib` (to `--fam-1` through `--fam-4`), `--err`, `--warn`, `--dim`, `--faint`, `--mono`. They are declared in layer 1 and nowhere else. `--accent2` has been removed because nothing in `site/` reads it. `--err`, `--warn`, `--dim`, `--faint` and `--mono` are read only by page-level styles in `index.html`, `docs.html` and `sources.html`. The `[data-fam=wb]`, `[data-fam=imf]`, `[data-fam=ecb]` and `[data-fam=carib]` selectors in layer 1 read the family aliases, and the rest of the kit's selectors read the role names.

Lowest text pair in the set: `--text-3` on `--card` at 4.63:1. Lowest control pair: `--line-strong` on `--card` at 3.24:1.

### 2.2 Type, spacing, radius, motion, geometry (layer 2)

- Type scale `--fs-0` to `--fs-7`: 11, 12.5, 14, 16, 18, 22, 26, 38 px.
- Labels (nav links, badges, table headers, tabs, pills, the live verifier result and the motion toggle label) are small caps through `font-variant-caps: all-small-caps`, set in one rule at a font size of the cap height divided by 0.7. The characters in the HTML are unchanged, so textContent and innerText read the same as before. Text drawn from attributes (section bars, verdict stamps) still uses `text-transform: uppercase`.
- Spacing `--sp-1` to `--sp-9` on a 4px grid: 4, 8, 12, 16, 24, 32, 48, 64, 96 px.
- Radii `--r-1` 6px, `--r-2` 10px, `--r-3` 14px. Pills use 20px.
- Motion `--period-a` 54s, `--period-b` 84s, `--ticker-period` 60s, `--ease` ease-out.
- Hairline shorthand `--hl: 1px solid var(--line)`.
- Orbit geometry per breakpoint: `--ra-rx`, `--ra-ry`, `--rb-rx`, `--rb-ry`, `--card-w`, `--card-h`, `--band` (height of the stacked orbit band on narrow screens), `--ua` and `--ub` (the stroke-width unit that cancels the non-uniform SVG scale). Declared in `:root` at phone size and overridden inside the 640, 1024 and 1280 pixel media queries.

## 3. Fonts

Four roles, three self-hosted files, body on the system stack.

| Role | Token | Kit family | Upstream (planned) |
|---|---|---|---|
| Body | `--font-body` | system stack, 0 KB | none |
| Display | `--font-display` | `Orbit Display`, weight 800 | Archivo ExtraBold, SIL OFL 1.1 |
| Accent | `--font-serif` | `Orbit Serif`, italic 400 | Instrument Serif Italic, SIL OFL 1.1 |
| Labels | `--font-mono` | `Orbit Mono`, 400 | Geist Mono Regular, SIL OFL 1.1 |

Licence statements are from memory until each upstream `OFL.txt` is opened at download time. The kit names are brand-neutral on purpose. A subset is a Modified Version under the OFL, and both Archivo and Instrument Serif are expected to declare Reserved Font Names, so the served files never carry the upstream family names.

### 3.1 Status, probed on 14 October 2026

No font file is downloaded yet. `sc.css` declares no `@font-face`, and pages send no font preload, so nothing can 404. The tokens resolve to system stacks, with the kit name first so the real file takes over the moment an `@font-face` for that name exists:

- `--font-display: "Orbit Display","Arial Black",system-ui,sans-serif` at weight 800
- `--font-serif: "Orbit Serif",Georgia,serif` at italic 400
- `--font-mono: "Orbit Mono",ui-monospace,"Cascadia Mono",Consolas,monospace` at 400, with `font-synthesis: none` so the mono never fakes a bold

### 3.2 Plan once approved

1. Fill `tools/fonts-src/` (gitignored) by hand from each upstream release, one fresh empty directory per download. Run every Python step that reads them with `python -I`.
2. Run `python -I tools/build-fonts.py`. It subsets with `pyftsubset <ttf> --flavor=woff2 --layout-features='kern,liga' --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2018-201D,U+2022,U+2026,U+20AC,U+2197,U+2713,U+25F7"`, names each output with the first 8 hex of its SHA-256, prints size and full hash, and exits non-zero above 30 KB per file.
3. Add `@font-face` with `font-display: optional` for each face, three `<link rel="preload" as="font" type="font/woff2" crossorigin>` per page, and the metric-matched fallback faces (`Orbit Display Fallback`, `Orbit Serif Fallback`, `Orbit Mono Fallback`) with `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override` measured against the real files in DevTools.
4. Fill the per-file record in `FONTS.md` in the same commit. Confirm each file with `git hash-object` against `git rev-parse HEAD:<path>` after a branch switch.

Ceilings: 30 KB per file, 100 KB in all (targets 28, 22 and 28 KB, estimates until the build prints them). The CSP needs no change, since `default-src 'self'` covers same-origin fonts.

## 4. Components

Primitives (layer 3 of sc.css): reset, type roles, nav with logo mark, footer, skip link, buttons (`.btn.primary`, `.btn.ghost`), `.badge`, cards (`.card`, with `data-fam` giving a 3px top rule in the family colour), `details`, tables inside `.tscroll` wrappers, forms, `pre` and `code`, pills and stamps, focus ring.

Instruments (layer 4):

| Component | Markup | Behaviour |
|---|---|---|
| Hero | `<header class="hero"><div class="orbit" aria-hidden="true" data-nosnippet>...</div><div class="hero-copy">...</div></header>` | min-height hero, orbit out of flow, copy block in flow with a radial ground so a card passing behind it fades |
| Orbit ring | `<svg class="ring" data-ring="a">` with `.base`, `.bezel`, and `<g class="arcs">` of circles | squashed-circle method: viewBox `-1 -1 2 2`, `preserveAspectRatio="none"` for the static `.base` and `.bezel` circles. On the index page the 8 arc circles sit in their own `<span class="ring spin" data-ring><svg class="arcs" viewBox="-1 -1 2 2">`, a square as wide as its ring, flattened by a static `scale: 1 <ry/rx>` per breakpoint. The `svg.arcs` turns 0 to 360deg clockwise with `will-change: transform`, so the turn runs on the compositor. The `.spin` rules sit in the page's inline style. The 404 page keeps the older `<g class="arcs">` inside the ring SVG |
| Orbit card | `<span class="oc" data-ring="a" data-fam="wb" data-tag="..." data-label="..." style="--i:0">` | text rendered by `::before` and `::after` from attributes, no text node. `data-mobile` marks the phone subset. `.oc.stamp` gives a rotated verdict stamp |
| Motion toggle | `<input type="checkbox" id="motion"><label for="motion">Pause motion</label>` | checked means paused. Works with JavaScript off where `:has()` is supported. Hidden below 640px |
| Ticker | `<div class="ticker" aria-hidden="true" data-nosnippet><div class="ticker-row"><span data-t="..."></span>...</div>` | row duplicated once in the HTML so the loop is seamless without JavaScript. Text from `data-t` |
| Section bar | `<div class="sbar" aria-hidden="true" data-nosnippet data-label="..." data-tag="..."><span class="tag" data-tag="..."></span></div>` as the first child of `section[id]` | sticky 40px with the solid `--sbar-fill` (no blur, no transparency at any width), number from a CSS counter, label and tag from attributes |
| Ruler | built by sc.js: `aside.ruler > div.ticks, div.bands, div.needle` | fixed right edge, 44px, 1160px and wider, only on pages at least 1.5 viewport heights tall. Contains nothing focusable. A page opts out with `data-ruler="off"` on `body`, which privacy, terms and the 404 page do |
| Progress hairline | built by sc.js: `div.progress` | 2px accent line scaled by scroll, replaces the ruler below 1160px |
| Stamp | `.stamp`, `.pill`, `.v-ok`, `.v-bad`, `.try-result [class*=v-]` | 1.5px border in the verdict colour, mono, small rotation on the live verifier result |
| Eyebrow | `data-eyebrow="REFERENCE"` on an element | renders above the heading from `::before`, no text node |

Family hooks: `data-fam="wb|imf|ecb|carib|accent|fam-1|fam-2|fam-3|fam-4"` sets `--f`, which the card rule, orbit card tag, section bar tag, ticker dot and ruler band all read.

## 5. The sc.css to sc.js class contract

sc.css and sc.js are written against this table so either can change without reading the other.

sc.js sets:

- `html.sc-paused` (user choice, persisted in `localStorage` key `sc-motion` as `paused` or `on`)
- `html.sc-hidden` (document hidden)
- `.is-offscreen` on `.hero` and `.ticker` (IntersectionObserver)
- `.is-active` on exactly one `.sbar` and one `.band`
- the DOM `aside.ruler > div.ticks > i*51`, `div.bands > span.band*N`, `div.needle > span.pct + span.label`, and `div.progress`, appended to `body`. `i.major` marks every fifth tick and carries `data-v` (0 to 100). Each `span.band` copies `data-fam` from its target.

sc.css styles exactly those names, and pauses animation on `:is(:root:has(#motion:checked), .sc-paused, .sc-hidden, .is-offscreen) :is(.oc, .arcs, .ticker-row)`.

sc.js reads only: `#motion`, `.hero`, `.ticker`, `.sbar`, `section[id]`, `h2[id]`, `h2, h3` inside a target, `[data-label]`, `[data-fam]`. It never reads the verifier form or any id that belongs to a page. Target label order: the target's `data-label`, else its bar's `data-label`, else the heading text uppercased and cut to 18 characters. Target selection order: `section[id]` containing a bar, else every `section[id]`, else `h2[id]`.

Degradation: with JavaScript off there is no ruler, no persistence of the pause choice and no off-screen pause. Everything else holds.

## 6. Motion and honesty rules

Motion:

1. Every `animation`, `transition`, `animation-timeline` and `scroll-behavior: smooth` declaration sits inside one `@media (prefers-reduced-motion: no-preference)` block, enforced by test (h).
2. The base rules give a finished still. Orbit cards sit evenly spread by a static `offset-distance` and arcs sit at their initial offsets. The stamp tilt has its own `tilt` keyframes, applied beside `orbit` on `.oc.stamp`, and the static `rotate(-6deg)` stays for reduced motion. The `orbit` and `depth` keyframes hold literal values and read no custom properties. Under reduced motion nothing collapses into a stack.
3. Clockwise is stated three ways. Geometry: every `A` segment in an `offset-path` carries sweep-flag 1. A regex test asserts it (test g). A human watches a two-second recording before the direction is written down as verified.
4. A visible pause control ships with any auto-playing motion over five seconds (WCAG 2.2.2). The animation also pauses off-screen and in a hidden tab.
5. Below 640px the orbit does not animate at all, and the toggle is hidden there.
6. No entrance animation, no parallax, no flashing, no content change on hover. The ruler needle follows scroll with no transition because it reports a position.

Honesty:

1. No decorative element shows a number. Orbit cards, ticker items and bar labels carry names (indicator keys, source names, ISO3 codes, tool names, verdict words) that cannot go stale. Tests (e) and (f) refuse a digit and refuse a label that resolves to nothing real.
2. A figure appears only where it is real, sourced and dated on the page. The ruler's per cent is a layout measurement.
3. A verdict stamp on a live result shows the API's own verdict.
4. Decoration is `aria-hidden="true"` with `data-nosnippet`, contains no link, button, heading or `tabindex`, and renders text from attributes. Bot safety: compared with the pages before the redesign, the HTML source, textContent and innerText are unchanged apart from three added strings: `Pause motion` (the toggle label), `Skip to main content` (the skip link) and the 404 page's nav label. Attribute-rendered text appears in none of the three.
5. Two literal rules stay in the inline `<style>` of every page that has a wide table: `.tscroll{overflow-x:auto}` and `.tscroll.wide table{min-width:560px}`. A site test reads them from the page's own HTML. Do not tidy them into sc.css.

## 7. The brand.css recipe: re-skinning another site

A brand block is layer 1 of `sc.css`. It sets values only. Steps:

1. Copy `site/assets/sc.css` and replace the first `:root` block with the new brand's tokens. The required set:
   - ground and surfaces: `--bg`, `--bg-2`, `--card`, `--sbar-fill`, `--line`, `--line-strong`
   - text: `--text`, `--text-2`, `--text-3`, `--link`
   - action: `--accent`, `--on-accent`
   - four families `--fam-1` to `--fam-4`, each assigned a meaning (publisher group, category, region and so on)
   - four verdict or status tokens `--v-match`, `--v-close`, `--v-mismatch`, `--v-cannot`
2. Run `node tools/contrast.mjs path/to/brand.css`. It reads every `:root` block, resolves `var()` aliases, measures the pairs listed in section 2 and exits 1 if any falls below its floor or a token is missing. Record the printed ratios in that site's copy of this document before committing.
3. Optionally set `--period-a`, `--period-b`, the ring geometry tokens and the literal `offset-path` strings, which must match each other. Test (g) compares the radii in each path with `--ra-*` and `--rb-*` declared in the same media block.
4. Supply three font files under the kit family names, or drop the serif by not loading it (the italic then falls back to the display face), with `FONTS.md` beside them.
5. Write orbit content: 6 to 20 short non-numeric strings that cannot go stale, each an `.oc` with label, tag and family, plus a `data-mobile` subset of six. For a property site that means parish names, listing-status words and property types. For an events site, categories and venues. A personal site probably wants no orbit, and the bars, ruler, type and colour carry the brand alone.
6. Write section labels and tags and a `data-fam` per section, supply the SVG mark in the nav, and adapt the registry in test (f).

A worked example is `docs/design/brand-atlas.css`: deep sea ground, warm paper text, lagoon accent, sun, coral and reef families. It is not served. Probed on 14 October 2026, its pairs:

| Pair | Ratio |
|---|---|
| text on bg | 16.09:1 |
| text-3 on card | 4.72:1 |
| accent (lagoon) on bg | 10.37:1 |
| fam-2 (sun) on bg | 12.04:1 |
| fam-3 (coral) on bg | 7.35:1 |
| fam-4 (reef) on bg | 9.98:1 |
| line-strong on card (the field border) | 4.41:1 |
| line-strong on bg | 5.26:1 |
| on-accent on accent | 9.45:1 |
| v-mismatch on card | 6.17:1 |

`tools/contrast.mjs docs/design/brand-atlas.css` exits 0 with every pair at or above its floor. The figures for ground, text, lagoon, sun, coral, reef, faint text and field border agree with the design brief's Atlas measurements to two decimals. The remaining Atlas values (`--bg-2`, `--sbar-fill`, `--line`, `--text-2`, `--link`, `--on-accent`, `--v-cannot`) were chosen in this file and are measured here for the first time.

What a brand never changes: the honesty rules, the motion rules, the contrast floors, the ruler and bar behaviour, `aria-hidden` and `data-nosnippet` on decoration, attribute-rendered decorative text, and the two literal table rules.

## 8. The contrast script

`tools/contrast.mjs` has no dependencies. `node tools/contrast.mjs` reads `site/assets/sc.css`. Pass one or more paths to check other files. It prints every pair with its ratio, floor and status, and exits 1 on any FAIL or MISSING row.

Probed on 14 October 2026: lowering `--text-3` in a copy of the Atlas block to `#3f4f5a` produced four FAIL rows (2.21, 2.05, 1.86 and 2.12:1) and exit 1. Deleting `--accent` from a copy produced MISSING rows and exit 1.

Limits: six-digit hex only, no alpha blending. The sticky bar is a solid fill, so its ratios are measured directly. Hairlines are reported as information with no floor.

## 9. Checks

The checks below run in this order. A result is recorded beside its row only after the check has run. Browser results were taken on 14 October 2026 against `wrangler dev`.

| Check | Method | Result |
|---|---|---|
| Token contrast | `node tools/contrast.mjs` | Probed on 14 October 2026: exit 0, 36 rows plus 1 information row |
| Alternate brand contrast | `node tools/contrast.mjs docs/design/brand-atlas.css` | Probed on 14 October 2026: exit 0 |
| Contrast script fires | mutate a token, expect exit 1 | Probed on 14 October 2026: exit 1 on both mutations |
| Site tests | `cd server && npm run typecheck && npm test`, print both exit codes | `npm test` 543 of 543 pass, exit 0. Typecheck result exit 0 |
| Design guards (a) to (o) | `server/test/site-design.test.ts`, each mutation-tested by breaking what it protects | 22 of 22 (15 of 15 mutations killed in the last round) pass after the ring restructure. Mutation results to be recorded at release |
| Pages, widths and modes | load `/`, `/docs`, `/guide`, `/sources`, `/bench`, `/privacy`, `/terms`, `/missing` at 320, 375, 768, 1024, 1280, 1440 px, each with JavaScript on, JavaScript off, and reduced motion emulated, and screenshot | Zero animations under reduced motion and while off-screen. innerText unchanged apart from the three added strings. Frozen screenshots of the old and new arc markup at 1440, 1100, 800 and 375 px differ by more than 32 levels in 0.007, 0.023, 0.005 and 0 per cent of pixels. JavaScript-off screenshots to be recorded at release |
| Direction | record two seconds of the index hero at 1440 and watch one card travel bottom, left, top, right | Clockwise on both rings over a full loop |
| Pause persistence | toggle Pause motion, reload, confirm it holds | to be recorded at release |
| Layout shift | CLS in DevTools, target 0 | CLS 0 |
| Off-screen cost | rAF callbacks with hero off-screen, target 0 | Zero animations running with the hero off-screen. A raw rAF callback count is to be recorded at release |
| Frame cost | main thread per frame with hero in view, target at most 4 ms. Scroll frames, target p95 at most 8 ms. The bars shipped with the solid fill and no blur | DevTools traces at 1440 by 900 on a 240 Hz display, hero over 5 s. Before: mean 4.96 ms, p95 6.20 ms, GPU main 26.9 ms per frame, 37 main frames per second. After, three windows: mean 3.36, 3.67 and 3.21 ms, p95 4.53, 5.20 and 4.44 ms, GPU main 1.7 to 2.5 ms, 230 to 239 frames per second. Scroll over 6 s through all 10 bars, driven by script: before p95 5.70 ms, mean 2.98 ms, 151 frames per second. After p95 4.06 ms, mean 2.25 ms, 238 frames per second. The hero margin is thin and varies between runs. Traces include the screenshot overhead |
| CSP | `npx wrangler@4.131.1 dev`, read console, target 0 violations | 0 violations on 8 pages at 375, 1280 and 1440 px. The DevTools issues list is empty on the index page |
| Lighthouse | performance at least 95 on mobile, accessibility 100 | Lighthouse 13.4.1 on the index page: accessibility 100 on desktop and mobile, target-size scores 1, no failing audits. With the footer link rule removed in a test copy, target-size scored 0 and accessibility 97. A performance score is to be recorded at release |
| Narrow screens | no horizontal scroll at 320px, ruler absent below 1160px and on privacy, terms and 404 | No horizontal scroll from 320 to 1440 px. Ruler absent on privacy, terms and the 404 page. Ruler absence below 1160 px is to be recorded at release |
| Bands recompute | open three FAQ details on index, load `/sources` and wait for its fetch | to be recorded at release |
| Independent review | a reviewer who did not write the kit reads the diff before any deploy | to be recorded at release |
| AI marks and voice | scan every changed surface for AI marks and run a voice check on the new text, self-tests first | to be recorded at release |
| Live audit | `python tools/audit-live.py` against production after deploy | to be recorded at release |

A row counts as verified only when its result column holds a recorded result.

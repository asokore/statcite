# Observatory kit: design system

Written 14 October 2026 for the StatCite redesign (reference observations: `REFERENCE-artcraft-2026-10.md`, font record: `FONTS.md`). This file is the contract for the reusable kit. It names no owner, employer or venture. Probed on 14 October 2026: every ratio below is the output of `tools/contrast.mjs` run against `site/assets/sc.css` and `docs/design/brand-atlas.css`. Browser measurements (layout shift, frame cost, Lighthouse, console, widths) are recorded in the verification table in section 9.

## 1. What the kit is

A dark, instrument-styled page shell for sites that bots and people both read. Every fact stays in server-sent HTML. The orbit, arcs, ticker, section bars and ruler are decoration layered on top, hidden from assistive technology and absent from the page's text content.

The kit is `site/assets/sc.css` layers 2 to 4, `site/assets/sc.js`, the fonts directory layout, the test file `server/test/site-design.test.ts` and this document. Layer 1 of `sc.css` is the brand block, and it is the only part a new site rewrites. Today the kit lives inside the StatCite repository because StatCite is its only user. It moves to its own repository when a second site adopts it. These sites have no build step, so a copied file is the honest dependency.

Probed on 14 October 2026 with `wc -c`, after the third orbit round: `sc.css` is 19,630 bytes against a 20,000 byte cap (raised from 14,000 in the second round, because the nine glyph masks and the three `@font-face` rules live in the sheet) and `sc.js` is 4,985 bytes against a 5,000 byte cap. `site/index.html` is 64,881 bytes against a 66,000 byte cap. The caps are asserted by test (a) in section 9. The fonts add 34,224 bytes over three files, recorded in `FONTS.md`.

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
- Labels (nav links, badges, table headers, tabs, pills, the live verifier result and the motion toggle label) are true small caps through `font-variant-caps: all-small-caps`, which the mono supplies from its `smcp` and `c2sc` features. One rule sets the font size at the wanted cap height divided by 0.66: the face's small capitals stand 0.583 of the em. The same rule sets `font-synthesis-small-caps: none`. WebKit synthesised small caps even from this face, which carries `smcp` and `c2sc`, so its labels ran about a quarter narrower than in Chromium and Firefox (the hero badge measured 251 px in WebKit against 338 px in Firefox at 1440 px, 14 October 2026). With synthesis off all three engines draw the face's own small capitals at the same width. The cost is that a fallback face, which has no small capitals, shows a label in its own mixed case. The characters in the HTML are unchanged, so textContent and innerText read the same as before. Text drawn from attributes (section bars, verdict stamps) still uses `text-transform: uppercase`.
- Spacing `--sp-1` to `--sp-9` on a 4px grid: 4, 8, 12, 16, 24, 32, 48, 64, 96 px.
- Radii `--r-1` 6px, `--r-2` 10px, `--r-3` 14px. Pills use 20px.
- Motion `--period-a` 54s, `--period-b` 84s, `--ticker-period` 60s, `--ease` ease-out.
- Hairline shorthand `--hl: 1px solid var(--line)`.
- Orbit geometry per breakpoint: `--ra-rx`, `--ra-ry`, `--rb-rx`, `--rb-ry`, `--card-w`, `--card-h`, `--g` (the glyph box inside a card), `--band` (height of the stacked orbit band on narrow screens), `--ua` and `--ub` (the stroke-width unit that cancels the non-uniform SVG scale). Declared in `:root` at phone size and overridden inside the 640, 1024 and 1280 pixel media queries. At phone size `--rb-rx` and `--rb-ry` are 76 and 38 px, smaller than ring a's 130 and 70 px, because there ring b is drawn as an inner ring. A `.compact` ancestor (the 404 page's stage) pins the 640 geometry at every width above it.

## 3. Fonts

Four roles, three self-hosted files, body on the system stack. The per-file record (source URL and commit, version, OFL first line, SHA-256, size) is `FONTS.md`.

| Role | Token | Kit family | Upstream | Served size |
|---|---|---|---|---|
| Body | `--font-body` | system stack, 0 KB | none | 0 |
| Display | `--font-display` | `Orbit Display`, weight 800 | Archivo at weight 800 and width 100, SIL OFL 1.1 | 10,464 bytes |
| Accent | `--font-serif` | `Orbit Serif`, italic 400 | Instrument Serif Italic, SIL OFL 1.1 | 14,148 bytes |
| Labels | `--font-mono` | `Orbit Mono`, 400 | Fragment Mono Regular, SIL OFL 1.1, with its true small capitals (`smcp`, `c2sc`) | 9,612 bytes |

The kit names are brand-neutral on purpose. A subset is a Modified Version under the OFL, so the served files carry the kit family names in their name tables and keep the upstream copyright and licence strings. Each OFL text sits beside the fonts in `site/fonts/`.

### 3.1 Loading, probed on 14 October 2026

- Three `@font-face` rules at the top of layer 2, each `font-display: optional`: a face is used only when it arrives inside the block period or is cached, so no view ever reflows from a late font. No metric-matched fallback faces are declared, because with `optional` there is no swap to hide.
- `<link rel="preload" as="font" type="font/woff2" crossorigin>` after the stylesheet link: the display face and the mono on every page, the serif only on a page whose markup sets it (an `em` inside `h1`, or `.serif`). Test (d) holds each page to that rule.
- `site/_headers` caches `/fonts/*` for a year as immutable. The first 8 hex of the file's SHA-256 is in its name, so a changed face is a new URL.
- The stacks behind each kit name: `"Arial Black",system-ui,sans-serif`, `Georgia,serif` and `ui-monospace,"Cascadia Mono",Consolas,monospace`. `pre` and `code` keep `font-synthesis: none`.
- `document.fonts.check()` on the index page under `wrangler dev` reported all three faces loaded, with and without JavaScript.

### 3.2 Rebuilding a face

The build is a scratch script, run offline, never committed: pin a variable file with `fontTools.varLib.instancer`, subset with `fontTools.subset --flavor=woff2 --layout-features=kern,liga` (the mono adds `smcp,c2sc`) `--unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2018-201D,U+2022,U+2026,U+20AC,U+2197,U+2713,U+25F7" --no-hinting --desubroutinize`, rewrite name IDs 1, 2, 3, 4, 6, 16 and 17 to the kit family, name the file by its hash, then fill the row in `FONTS.md`. Test (d) refuses a served font whose bytes differ from that row. Ceilings: 30 KB per file, 100 KB in all. The CSP needs no change, since `default-src 'self'` covers same-origin fonts.

## 4. Components

Primitives (layer 3 of sc.css): reset, type roles, nav with logo mark, footer, skip link, buttons (`.btn.primary`, `.btn.ghost`), `.badge`, cards (`.card`, with `data-fam` giving a 3px top rule in the family colour), `details`, tables inside `.tscroll` wrappers, forms, `pre` and `code`, pills and stamps, focus ring.

Instruments (layer 4):

| Component | Markup | Behaviour |
|---|---|---|
| Hero | `<header class="hero"><div class="orbit" aria-hidden="true" data-nosnippet>...</div><div class="hero-copy">...</div></header>` | min-height hero, orbit out of flow, copy block in flow with a radial ground so a card passing behind it fades |
| Orbit ring | `<svg class="ring" data-ring="a">` with `.base` and `.bezel`, then `<span class="ring spin" data-ring="a"><svg class="arcs">` holding 16 bare `<circle r="1" pathLength="100">` | squashed-circle method: viewBox `-1 -1 2 2`, `preserveAspectRatio="none"` for the static `.base` and `.bezel` circles. The arcs sit in their own square svg as wide as the ring, flattened by a static `scale: 1 <ry/rx>` on `.spin` per breakpoint, pinned to the ring tokens by test (g). The `svg.arcs` turns 0 to 360deg clockwise with `will-change: transform`, so the turn runs on the compositor. Dash lengths, offsets and colours come from `:nth-child` rules: per family a 6 unit head, a 14 unit and a 26 unit fading tail and a wide glow, all ending at the same point, so each arc reads as a comet. Every `calc()` in a stroke width, dash array or dash offset multiplies by `1px` (a user unit inside the svg), because Firefox drops a `calc()` that resolves to a bare number there. Both pages use this markup, and the `.spin` rules live in sc.css |
| Tilt | two `<span class="tilt">` wrappers: the first holds the outer ring's svgs and comes before the inner ring, the second holds the outer ring's cards and comes after the inner ring's `.spin`, so no ring line or arc paints over a card. Test (p) pins that order | at 1024px and above each wrapper leans the whole outer orbit by `rotate: -6deg`, and `.oc[data-ring=b]` leans back by 6deg so labels stay level. The two rings cross like a gyroscope. Under 1024px the wrappers lean nothing. From 640 to 1023px ring b is hidden. Under 640px ring b returns as a small inner ring with its arcs and no cards of its own, and the second wrapper still holds the outer ring's phone cards, which ride ring a's path at ring a's period |
| Orbit card | `<span class="oc" data-ring="a" data-fam="wb" data-g="seal" data-tag="..." data-label="..." style="--i:0"><i></i></span>` | a grid of glyph box and two text lines. Text rendered by `::before` and `::after` from attributes, no text node. The empty `<i>` is painted by a mask: `data-g` picks one of nine inline SVG glyphs in sc.css (seal for a publisher, series for an indicator, dial for a rate, pin for an economy, tick for a tool, and check, near, cross and null for the four verdicts), filled with the family colour. `data-mobile` and `--m` mark and order the phone subset. `.oc.stamp` gives a rotated verdict stamp |
| Bloom | `.orbit::before` | a still radial ground behind the copy, blue above right and green below left, scaled from the inner ring's tokens. No animation |
| Motion toggle | `<input type="checkbox" id="motion"><label for="motion">Pause motion</label>` | checked means paused. Works with JavaScript off where `:has()` is supported. Shown at every width, and hidden only under reduced motion, where nothing moves |
| Ticker | `<div class="ticker" aria-hidden="true" data-nosnippet><div class="ticker-row"><span data-t="..."></span>...</div>` | row duplicated once in the HTML so the loop is seamless without JavaScript. Text from `data-t` |
| Section bar | `<div class="sbar" aria-hidden="true" data-nosnippet data-label="..." data-tag="..."><span class="tag" data-tag="..."></span></div>` as the first child of `section[id]` | sticky 40px with the solid `--sbar-fill` (no blur, no transparency at any width), number from a CSS counter, label and tag from attributes |
| Ruler | built by sc.js: `aside.ruler > div.ticks, div.bands, div.needle` | fixed right edge, 44px, 1160px and wider, only on pages at least 1.5 viewport heights tall. Contains nothing focusable. A page opts out with `data-ruler="off"` on `body`, which privacy, terms and the 404 page do |
| Progress hairline | built by sc.js: `div.progress` | 2px accent line scaled by scroll, replaces the ruler below 1160px |
| Stamp | `.stamp`, `.pill`, `.v-ok`, `.v-bad`, `.try-result [class*=v-]` | 1.5px border in the verdict colour, mono, small rotation on the live verifier result |
| Eyebrow | `data-eyebrow="REFERENCE"` on an element | renders above the heading from `::before`, no text node |

Family hooks: `data-fam="wb|imf|ecb|carib|accent|fam-1|fam-2|fam-3|fam-4"` sets `--f`, which the card rule, orbit card tag, section bar tag, ticker dot and ruler band all read.

### 4.1 What made Firefox fill the hero green

Found on the live site on 14 October 2026 in Firefox at 1440 by 900: the hero was a solid green field, the rings and arcs were gone, and the copy sat on a dark ellipse. The cause was the arc strokes. sc.css set `stroke-width: calc(2 * var(--u))` and dash values such as `calc(100 - var(--l))`, which resolve to bare numbers. Chromium and WebKit accept that. Firefox drops it. Measured with Playwright's Firefox and WebKit builds (1495 and 2215): in Firefox the computed `stroke-width` came back as `1px` and the dash array as `none`, and in WebKit as `0.02px` and `6px, 94px`. One user unit in a viewBox of `-1 -1 2 2` is half the ring's width, so each of the 16 arc circles painted a solid band from half the radius to one and a half times it, and the last one drawn was the green family. The dark ellipse was the copy block's own radial ground, which is invisible against the dark page and showed only against the green. The fix multiplies each term by `1px`, which is one user unit inside the svg, so the drawing is unchanged in Chromium and WebKit. Test (r) refuses a unitless `calc()` in any stroke width or dash.

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
5. On a phone (320 to 639px) the orbit turns too: six cards ride ring a clockwise at ring a's period, and the arcs on both rings turn. Ring b is drawn inside ring a there, because a second ring of cards outside it would not fit. At 320px a card on ring a already runs 32px past the screen edge at the ring's widest point, clipped by the hero, and an outer ring would push cards further off the screen and make the hero taller. The pause control shows at every width. Test (q) pins all of this.
6. No entrance animation, no parallax, no flashing, no content change on hover. The ruler needle follows scroll with no transition because it reports a position.

Honesty:

1. No decorative element shows a number. Orbit cards, ticker items and bar labels carry names (indicator keys, source names, ISO3 codes, tool names, verdict words) that cannot go stale. Tests (e) and (f) refuse a digit and refuse a label that resolves to nothing real. Glyphs are shapes, never artwork. No flag and no logo appears in the orbit: a flag drawn at 20px misstates most emblems, and a logo is a trademark that implies endorsement. A publisher is a seal, an economy is a pin, a rate is a dial at rest, an indicator is a series with no trend. Test (p) holds every glyph to an inline SVG of plain shapes with no text, no reference and no script, and refuses any image pulled into the orbit.
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
5. Write orbit content: 6 to 20 short non-numeric strings that cannot go stale, each an `.oc` with label, tag, family and a `data-g` glyph, plus a `data-mobile` subset of six. For a property site that means parish names, listing-status words and property types. For an events site, categories and venues. A personal site probably wants no orbit, and the bars, ruler, type and colour carry the brand alone. New glyphs are added as `.oc[data-g=name]{--glyph:url("data:image/svg+xml,...")}` rules of plain shapes, and test (p) adapts its list.
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
| Site tests | `cd server && npm run typecheck && npm test`, print both exit codes | Third round, 14 October 2026: `npm test` 550 of 550 pass, exit 0. Typecheck exit 0. Fixes to the second round: `npm test` 548 of 548 pass, exit 0. Typecheck exit 0. Second round: `npm test` 546 of 546 pass, exit 0. Typecheck exit 0 |
| Design guards (a) to (r) | `server/test/site-design.test.ts`, each mutation-tested by breaking what it protects in a copy of the tree, restoring byte for byte and checking the hash | 29 of 29 pass. Third round: 15 of 15 mutations killed and 15 restores hash-checked, across the phone animation rules for cards and arcs, the reduced-motion gate, the phone path's direction, the reversed spin, the shared phone period, the inner ring hidden on a phone, the pause control hidden by sc.css or by a page, the unitless stroke calc() in three places, small-caps synthesis, and the inner ring's spin scale and token. Fixes to the second round: 21 of 21 mutations killed and 21 restores hash-checked, across the card paint order, the outer cards' wrapper, the tilt and its counter-turn, the phone order, glyphs or masks set outside sc.css (both of the reviewer's probes among them) and the per-page serif preload. Second round: 46 of 46 mutations killed, 46 restores hash-checked, across the raised size cap, the font record, the preloads, the `/fonts/*` block, the spin scales, the composited 404 markup, the glyph rules and the earlier guards. First round: 15 of 15 |
| Pages, widths and modes | load `/`, `/docs`, `/guide`, `/sources`, `/bench`, `/privacy`, `/terms`, `/missing` at 320, 375, 768, 1024, 1280, 1440 px, each with JavaScript on, JavaScript off, and reduced motion emulated, and screenshot | Third round, index hero at 320, 375, 390 and 639 px portrait and 667 by 375 and 844 by 390 landscape: 15 running animations on a phone (6 cards, 2 arc turns, the scroll fade), 18 in landscape. Every orbit element sampled every 0.5 s over a full 84 s loop crossed no text node (23 to 29 text boxes checked per size). The orbit spans 24 to 201 px of the hero on a phone and the copy starts at 220 px. No horizontal scroll at any of the six sizes. Under reduced motion 0 animations at 375, 667 and 1440. Visible text unchanged on all eight pages against the last commit apart from the one `/guide` figure, and JSON-LD byte-identical on all eight. Second round at 1440 and 375 with JavaScript on, 1440 with JavaScript off, 1440 and 404 under reduced motion, 1024 and 768 with JavaScript on. Zero animations under reduced motion, cards at the static spread (0 to 87.5 per cent in 12.5 steps). Zero running animations with the hero off-screen. One running animation (the ticker) at 375. innerText byte-identical on seven pages against the previous commit served side by side, and on `/sources` the only difference is the ledger the live API filled in, which the static copy of the old page could not fetch. JSON-LD byte-identical on all eight pages. No horizontal scroll at 375, 768, 1024 or 1440. No card touches the copy block's box at 1440 or 768. At 1024 three cards cross the block's lower corners behind its radial ground, which fades them |
| Direction | record two seconds of the index hero at 1440 and watch one card travel bottom, left, top, right | Third round, sampled by angle over 1.5 s: every card advanced 7.6 to 14.2 degrees clockwise on a phone (320 to 639 px), 5.9 to 18.1 in landscape, and the arcs turned 6.5 degrees (ring b) and 10.1 degrees (ring a) clockwise. Firefox and WebKit agreed. Second round, sampled by angle from the orbit centre over 1.5 s: four cards on both rings advanced 4.4 to 7.8 degrees in the positive screen direction, which is clockwise. First round: watched clockwise on both rings over a full loop |
| Pause persistence | toggle Pause motion, reload, confirm it holds | Third round at 375 px: after the click 14 paused and 1 running (the scroll fade), after reload the class and the checkbox held, after a second click 15 running, with the hero scrolled off-screen 0 running. Second round: after the click 43 animations paused and the ticker's 1 running, after reload the class and the checkbox held, after a second click 44 running |
| Layout shift | CLS in DevTools, target 0 | CLS 0.00 in all three rounds |
| Off-screen cost | rAF callbacks with hero off-screen, target 0 | Zero animations running with the hero off-screen in both rounds. A raw rAF callback count is still to be recorded |
| Frame cost | main thread per frame with hero in view, target at most 4 ms. Scroll frames, target p95 at most 8 ms. The bars shipped with the solid fill and no blur | Third round, a DevTools trace at 390 by 844, device pixel ratio 3, mobile emulation, no CPU throttling, hero in view and turning: 2,126 drawn frames, main thread busy 1.87 ms per drawn frame, longest task 3.3 ms. The work is style recalculation for the six cards' `offset-distance`, with no layout or paint. Under 4x CPU throttling the load trace ran 14.65 ms per drawn frame, against 31.93 ms for the static phone orbit on the live site, which drew 63 frames against 458. Second round: a 48 s DevTools trace at 1440 by 900, device pixel ratio 1.5, hero in view and turning, read from the raw trace file: 8,205 drawn frames, main thread busy 2.45 ms per drawn frame, 0 tasks over 16 ms, 6.95 ms mean and 9.88 ms p95 per 16.7 ms slot (about 2.8 frames per slot on this display). First round: mean 3.36, 3.67 and 3.21 ms per frame over three 5 s windows, scroll p95 4.06 ms |
| CSP | `npx wrangler@4.131.1 dev`, read console, target 0 violations | Third round: 0 console errors in Chromium on 5 pages at 375, 390 and 844 px, and 0 in Firefox and WebKit on the index at 1440, 390 and 667 px and in WebKit with mobile emulation. Second round: 0 console messages of any kind on the index page at 1440. First round: 0 violations on 8 pages at 375, 1280 and 1440 px |
| Lighthouse | performance at least 95 on mobile, accessibility 100 | Third round, Lighthouse accessibility through DevTools: `/bench` 98 and `/sources` 92 on mobile before the fixes (no `main` landmark on either, and ledger links told apart by colour alone at 1.72:1 on `/sources`), 100 after them on mobile and desktop for `/bench`, `/guide` and `/sources`. The DevTools tool has no performance category, so no Lighthouse performance score exists for this round. Proxies from a mobile trace of `/` at 4x CPU and Slow 4G against `wrangler dev`: LCP 1,026 ms, CLS 0.00, and a TBT proxy of 521 ms (main-thread tasks over 50 ms after first paint, less 50 ms each), against 1,021 ms, 0.00 and 1,145 ms for the live site under the same settings. Second round, Lighthouse through DevTools on the index page: accessibility 100, best practices 100, SEO 100 on desktop and on mobile, 62 audits passed and 0 failed each. A performance score is still to be recorded |
| Engines | index at 1440 by 900 and 390 by 844 in Chromium, Firefox and WebKit, and WebKit with mobile emulation | Third round: rings and arcs drawn in all three, no solid fill, computed arc stroke 0.0034 px at 1440 in Firefox and WebKit alike, nav label 65 px wide in all three, hero badge 338 px in Firefox and WebKit and 337 px in Chromium, phone orbit turning clockwise in all three |
| Narrow screens | no horizontal scroll at 320px, ruler absent below 1160px and on privacy, terms and 404 | No horizontal scroll from 320 to 1440 px. Ruler absent on privacy, terms and the 404 page. Ruler absence below 1160 px is to be recorded at release |
| Bands recompute | open three FAQ details on index, load `/sources` and wait for its fetch | to be recorded at release |
| Independent review | a reviewer who did not write the kit reads the diff before any deploy | to be recorded at release |
| AI marks and voice | scan every changed surface for AI marks and run a voice check on the new text, self-tests first | to be recorded at release |
| Live audit | `python tools/audit-live.py` against production after deploy | to be recorded at release |

A row counts as verified only when its result column holds a recorded result.

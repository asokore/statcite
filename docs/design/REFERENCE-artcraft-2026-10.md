# Design reference: getartcraft.com (read 14 October 2026)

Read in a browser at 1440 by 900 on 14 October 2026, about 12:00 UTC. Everything below was observed on the page or read from its live DOM. Nothing was copied: the aim is to learn the moves, then build StatCite's own.

## What makes it feel alive

1. An orbit hero puts image and video cards on tilted elliptical rings around the wordmark, like planets on orbits, with the headline, strapline and two buttons in the middle. It is drawn on one full-screen `<canvas>` (2160 by 1278 backing pixels at 1440 by 900), with 7 `<video>` elements and 5 images as textures. No CSS 3D transforms are involved. Thin coloured arcs (violet, electric blue, green, amber) trace parts of the rings. The rotation reads as anticlockwise there, and StatCite's version runs clockwise.
2. A ruler runs down the right edge in a fixed 60px column (`position: fixed; inset-y: 0`) that carries tick marks numbered 0 to 100 in steps of 5, i.e. per cent of the page scrolled, with a moving marker and a crosshair cursor. A separate fixed layer prints the section names (FEATURES, OWNERSHIP, COMMUNITY, GET STARTED) letter by letter as individual spans, and the current section's name turns vertical beside the ruler as you scroll.
3. Scroll choreography plays on the page: the wordmark's letters scatter apart, a ticker band of feature names slides across, and each section opens with a sticky bar (`sticky top-12`, translucent background, `backdrop-blur`, hairline top and bottom borders) reading "01 / CRAFTING FEATURES" in mono caps, with a small tag on the right ("REAL FOOTAGE, CAPTURED IN ARTCRAFT").
4. Type carries a voice through four families: Inter for body, Geist Mono for nav, labels and section numbers (small caps, wide tracking), Archivo for the heavy wordmark, and Instrument Serif in italic for one emphasised word inside a heavy sans headline ("Capable tools *for artists*", "Stop *renting* from websites").
5. Colour starts from a near-black ground `rgb(18, 19, 22)` (#121316), hairline grey rules, white type, and colour used sparingly but saturated: the orbit arcs and the media itself. Buttons are one solid white and one outlined.
6. The media grid lays features out as a two-column grid of large media cards with a bold title and a two-line caption, separated by hairlines.
7. The stack is Next.js with Tailwind (class names such as `sticky top-0 z-50 border-b border-line bg-bg/95 backdrop-blur-sm`).

## What StatCite must keep while borrowing this

StatCite is read mainly by agents. A redesign must leave every machine-facing property intact:

- All content stays in server-sent HTML and reads with JavaScript off. The orbit and ruler are decoration (`aria-hidden`), never the only home of any fact.
- `llms.txt`, `llms-full.txt`, `openapi.json`, `robots.txt`, the sitemap, every JSON-LD block and the semantic heading order are unchanged in substance.
- The site's tests hold: one shared nav ending in Connect, Connect panels and the verifier working without JavaScript, every table in a scroll wrapper, no em dashes, JSON-LD parsing with no person or ministry named, sitemap dates from git, and the security headers.
- The Content Security Policy allows only same-origin scripts, styles, images and fonts (plus Cloudflare's beacon), with inline script and style allowed. So fonts are self-hosted, nothing loads from a CDN, and the orbit is drawn with inline JS on a canvas or with SVG.
- `prefers-reduced-motion: reduce` stops all rotation and scroll choreography, and contrast meets WCAG AA.
- No figure may appear in decoration unless it is real and sourced. Decorative cards should carry indicator names, country codes, source names and verdict words. These cannot go stale, and the cards show no numbers.

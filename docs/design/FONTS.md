# Fonts: the record

Status on 14 October 2026: three faces are self-hosted under `site/fonts/`, served under the kit's brand-neutral family names and declared in `site/assets/sc.css` with `font-display: optional`. Every figure below was read from the shipped file or printed by the build.

## The three faces

| Kit family | Upstream | Style | Role | Served file | Size |
|---|---|---|---|---|---|
| `Orbit Display` | Archivo, static instance at weight 800 and width 100 of the variable file | ExtraBold upright | h1, h2, wordmark, tier prices, stat figures, the 404 numeral | `site/fonts/orbit-display-800.5160b1f2.woff2` | 10,464 bytes |
| `Orbit Serif` | Instrument Serif | Italic 400 | one phrase per page | `site/fonts/orbit-serif-italic.68739bf5.woff2` | 14,148 bytes |
| `Orbit Mono` | Fragment Mono | Regular 400 | nav, labels, badge, bars, ticker, orbit cards, ruler, code and pre | `site/fonts/orbit-mono-400.af8b85d2.woff2` | 9,612 bytes |

Total 34,224 bytes, against a target of 40 KB and a ceiling of 100 KB. Test (d) enforces that ceiling and a per-file ceiling of 30 KB.

Why these three. Archivo ExtraBold was kept after a side-by-side with Bricolage Grotesque 800 and Space Grotesk 700 on the homepage headline: it is the heaviest and most even of the three and costs 7 KB less than Bricolage. Instrument Serif Italic was kept over Newsreader Italic for its higher contrast, which reads as an accent inside a heavy sans headline. Fragment Mono replaced Geist Mono because it is the only candidate among eight monospace families checked (Geist Mono, JetBrains Mono, IBM Plex Mono, Martian Mono, Spline Sans Mono, Red Hat Mono, Fragment Mono and Commit Mono, the last not on google/fonts) that ships true small capitals: its `smcp` feature covers all 26 lowercase letters and `c2sc` covers the capitals, both read from the GSUB table of the shipped subset. Its small capitals stand 0.583 of the em (the bounds of the `a` substitute, measured with fontTools), its capitals 0.699 and its x-height 0.524. The label rule in `sc.css` sizes small-caps text at the wanted cap height divided by 0.66.

## Per-file record

Every upstream file came from the google/fonts repository at commit `e9678a5385322c63730122ba464765baad83cfd8`, read on 14 October 2026. The version is name ID 5 of the upstream file. The hash and size are of the served file.

| Served file | Upstream file and version | First line of its OFL.txt | Source URL | SHA-256 of the served file | Size |
|---|---|---|---|---|---|
| `orbit-display-800.5160b1f2.woff2` | `ofl/archivo/Archivo[wdth,wght].ttf`, Version 2.001 (upstream SHA-256 `0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053`, 658,596 bytes) | Copyright 2020 The Archivo Project Authors (https://github.com/Omnibus-Type/Archivo) | https://github.com/google/fonts/blob/e9678a5385322c63730122ba464765baad83cfd8/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf | `5160b1f26a1fec4ceb52ae6b304c5b9c303c395e90a4d7af19b8b22beb50c035` | 10,464 bytes |
| `orbit-serif-italic.68739bf5.woff2` | `ofl/instrumentserif/InstrumentSerif-Italic.ttf`, Version 1.000; ttfautohint (v1.8.4.7-5d5b);gftools[0.9.27] (upstream SHA-256 `08939b8bdf534afec24ae0ef5e03f948940cd9a8fe08e7fecbad040e62327385`, 71,592 bytes) | Copyright 2022 The Instrument Serif Project Authors (https://github.com/Instrument/instrument-serif) | https://github.com/google/fonts/blob/e9678a5385322c63730122ba464765baad83cfd8/ofl/instrumentserif/InstrumentSerif-Italic.ttf | `68739bf521cd4248f2ca544bf0dc0bfd602cf7049c2355d19ec5186490c086ef` | 14,148 bytes |
| `orbit-mono-400.af8b85d2.woff2` | `ofl/fragmentmono/FragmentMono-Regular.ttf`, Version 1.011; ttfautohint (v1.8.4.7-5d5b) (upstream SHA-256 `0fe011f425873c2e0fc73a189e394e340ad48d2b9a99a576bdeec75cee000460`, 125,368 bytes) | Copyright 2022 The Fragment-Mono Project Authors (https://github.com/weiweihuanghuang/fragment-mono) | https://github.com/google/fonts/blob/e9678a5385322c63730122ba464765baad83cfd8/ofl/fragmentmono/FragmentMono-Regular.ttf | `af8b85d2f84f8be2c3208a1f714d4ad2569207a88d36c0c381ba4f0b830ee004` | 9,612 bytes |

All three are under the SIL Open Font License, Version 1.1, and none of the three OFL files declares a Reserved Font Name. The licence of each sits beside the fonts as `site/fonts/OFL-Archivo.txt`, `site/fonts/OFL-InstrumentSerif.txt` and `site/fonts/OFL-FragmentMono.txt`, copied byte for byte from the same commit. A subset is a Modified Version under the OFL, so the name table of each served file carries the kit family name and keeps the upstream copyright and licence strings.

## How they were built

The build ran once, offline, from a scratch directory outside the repository, with fontTools 4 and brotli:

1. For Archivo, `fontTools.varLib.instancer` pinned the variable file to `wght` 800 and `wdth` 100.
2. `fontTools.subset` wrote each face as woff2 with `--layout-features=kern,liga` (the mono adds `smcp,c2sc`), `--unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2018-201D,U+2022,U+2026,U+20AC,U+2197,U+2713,U+25F7"`, `--no-hinting` and `--desubroutinize`. Dropping the hints took the serif from 19,880 to 13,828 bytes and the mono from 17,680 to 9,548 bytes before the name table was rewritten, at no cost on the high-density screens these faces are set on.
3. Name IDs 1, 2, 3, 4, 6, 16 and 17 were set to the kit family and style. IDs 0, 5, 13 and 14 (copyright, version, licence) were left as upstream wrote them.
4. The file was named `<stem>.<first 8 hex of its SHA-256>.woff2`.

U+2197 (the verifier's source arrow) and U+2713 (tier check marks) are in the mono subset. Neither the display face nor the serif carries them, and U+25F7 (the pricing clock) is in none of the three, so those glyphs fall back to the system face where they appear, as they did before. U+2014 is left out on purpose.

## Loading

- `@font-face` for each face in layer 2 of `sc.css`, `font-display: optional`, so a face is used only when it arrives inside the browser's block period or is already cached, and nothing on screen ever reflows from a late font.
- `<link rel="preload" as="font" type="font/woff2" crossorigin>` directly after the stylesheet link. Every page preloads the display face and the mono. The serif is preloaded only on the pages that set it (index, bench, guide and sources), and test (d) derives that list from each page's markup. Same-origin fonts still need `crossorigin`.
- `site/_headers` caches `/fonts/*` for a year as immutable. The hash in the file name makes a changed face a new URL.
- No metric-matched fallback faces are declared. With `optional` there is no swap to hide, and the fallbacks remain the system stacks behind each kit name.
- The CSP needs no change: `default-src 'self'` covers same-origin fonts.
- Live font checks in `tools/audit-live.py` (each face served from `/fonts/` with its cache header after deploy) are a follow-up and do not exist yet.

## Line endings and hashes

`.gitattributes` carries `site/**/*.woff2 binary` and `site/**/*.woff binary` below the `site/** text eol=lf` rule. `git check-attr text` on each woff2 reports `unset`. After any branch switch, confirm each file with `git hash-object <path>` against `git rev-parse HEAD:<path>`. Test (d) in `server/test/site-design.test.ts` reads this file and refuses a served font whose SHA-256 or size differs from the row above.

# Fonts: plan and record

Status on 14 October 2026: **planned, nothing downloaded.** No font file exists in this repository yet. The three upstream families have not been downloaded. Until then the site builds on system fonts behind the kit's named tokens, declares no `@font-face` and sends no font preload, so nothing can 404.

This file becomes the per-file record in the same commit that adds the fonts. Every "pending" cell below is filled from the real files at that point, never from this plan.

## The three families

All three are expected to be under the SIL Open Font License 1.1. That is from memory until each upstream `OFL.txt` is opened at download time. The same applies to Reserved Font Names: Archivo and Instrument Serif are expected to declare them, which is why the subsets are served under brand-neutral kit names and never the upstream names. A subset is a Modified Version under the OFL.

| Kit family | Upstream family | Style and weight | Role | Served file | Target size |
|---|---|---|---|---|---|
| `Orbit Display` | Archivo (Omnibus-Type) | ExtraBold 800, upright | hero h1, h2, wordmark, tier prices, stat figures, the 404 numeral | `site/fonts/orbit-display-800.<hash>.woff2` | 28 KB |
| `Orbit Serif` | Instrument Serif | Italic 400 | one phrase per page | `site/fonts/orbit-serif-italic.<hash>.woff2` | 22 KB |
| `Orbit Mono` | Geist Mono (Vercel) | Regular 400 only | nav, labels, badge, bars, ticker, ruler, code and pre | `site/fonts/orbit-mono-400.<hash>.woff2` | 28 KB |

Targets total 78 KB and are estimates until the build prints real sizes. The ceiling is 30 KB per file and 100 KB in all. Geist Mono 500 is dropped to save a file, and `font-synthesis: none` stops the browser faking a bold.

Each served file sits beside its licence: `site/fonts/OFL-Archivo.txt`, `site/fonts/OFL-InstrumentSerif.txt`, `site/fonts/OFL-GeistMono.txt`.

## Subsetting

`tools/build-fonts.py` runs once, offline, on the developer machine. It downloads nothing. It reads the upstream TTFs from `tools/fonts-src/`, which is gitignored and filled by hand from each family's upstream release, one fresh empty directory per download, with every Python step that reads them run as `python -I`. For each file it runs:

```
pyftsubset <upstream.ttf> --flavor=woff2 --layout-features='kern,liga' --unicodes="U+0020-007E,U+00A0-00FF,U+2013,U+2018-201D,U+2022,U+2026,U+20AC,U+2197,U+2713,U+25F7"
```

It then names the output with the first 8 hex characters of its SHA-256, prints the size and the full hash, and exits non-zero if any file is over 30 KB. U+2197, U+2713 and U+25F7 are the three non-Latin glyphs the pages use today. U+2014 is left out on purpose.

If a subset lands over 30 KB, re-subset with fewer layout features before dropping a face.

## Loading, once the files ship

- `@font-face` with `font-display: optional` for all three.
- Three `<link rel="preload" as="font" type="font/woff2" crossorigin>` per page.
- Metric-matched fallback faces (`Orbit Display Fallback`, `Orbit Serif Fallback`, `Orbit Mono Fallback`) with overrides measured against the real files.
- `site/_headers` caches `/fonts/*` for a year as immutable. No CSP change is needed, since `default-src 'self'` covers same-origin fonts.
- `tools/audit-live.py` gains a 200 and content-type check for each preloaded font in the same change. Its sc.css and sc.js checks exist already.

Until then the tokens resolve to system stacks:

- `--font-display`: "Orbit Display","Arial Black",system-ui,sans-serif, at 800
- `--font-serif`: "Orbit Serif",Georgia,serif, italic 400
- `--font-mono`: "Orbit Mono",ui-monospace,"Cascadia Mono",Consolas,monospace, at 400

## Line endings

`.gitattributes` already carries `site/**/*.woff2 binary` and `site/**/*.woff binary`, added before any font exists so the `site/** text eol=lf` rule can never rewrite one. After the font commit and a branch switch, confirm each file with `git hash-object <path>` against `git rev-parse HEAD:<path>`.

## Per-file record (fill at download)

| File | Upstream family and release tag | Version from the name table | First line of its OFL.txt | Source URL | SHA-256 | Measured size |
|---|---|---|---|---|---|---|
| `orbit-display-800.<hash>.woff2` | pending | pending | pending | pending | pending | pending |
| `orbit-serif-italic.<hash>.woff2` | pending | pending | pending | pending | pending | pending |
| `orbit-mono-400.<hash>.woff2` | pending | pending | pending | pending | pending | pending |

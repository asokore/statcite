# Cline MCP Marketplace submission: ready to file

Form: https://github.com/cline/mcp-marketplace/issues/new?template=mcp-server-submission.yml

The template asks for exactly four things. Three are ready below; the fourth is
yours to verify, honestly.

## 1. GitHub Repository URL (required)

```
https://github.com/asokore/statcite
```

## 2. Logo (required, 400x400 PNG)

`distribution/assets/logo-400.png` in this repo, rendered at exactly 400x400
and verified. Drag it into the issue's upload field.

## 3. Checkboxes (both required)

- [ ] **"I have tested that Cline can successfully set up this server using
  only the README.md and/or llms-install.md file"**

  **Do not tick this until you have actually done it.** To test: install Cline,
  give it the repo URL or `llms-install.md`, and confirm it connects to
  `https://statcite.com/mcp` and can call a tool. The README's Install table
  and `llms-install.md` both carry the one-line remote config, so this should
  pass. But the checkbox is an assertion of testing, and neither of us should
  make it on a guess.

- [ ] "The server is stable and ready for public use", true: live since
  2026-07-25, versioned releases, CI smoke-tests production twice daily,
  203 tests.

## 4. Additional information (optional): suggested text

> StatCite is a free remote MCP server (Streamable HTTP, no auth, no signup)
> serving official economic statistics, World Bank WDI, IMF WEO/Fiscal
> Monitor, BIS central bank policy rates, ECB, where every value carries a
> full citation object: source, dataset, series id, licence, the
> source-mandated attribution string, retrieval date, and BibTeX/APA exports.
>
> The differentiator is verification rather than lookup: `verify_stat` checks a
> *claimed* figure against the official series and returns
> match/close/mismatch/cannot_verify with diagnostics for the classic errors
> (wrong year, percent-vs-decimal, unit scaling, sign flips). On a mismatch it
> re-checks against the previous IMF vintage, so a figure that was correct when
> written and has since been revised is reported as a revision, not an error.
> When the source cannot support a verdict it says so rather than guessing.
>
> Setup is a single URL, nothing to install, no key to obtain.
>
> Docs: https://statcite.com/docs.html · Licence ledger (including sources we
> evaluated and refused): https://statcite.com/sources.html

## Note on `llms-install.md`

Cline's FAQ states it is **optional** ("a well-written README is usually
sufficient"). This repo ships one anyway at `llms-install.md`.

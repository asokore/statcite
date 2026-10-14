# World Bank Data360 MCP and Data Commons against StatCite (October 2026)

The question was how far two newer MCP services overlap StatCite's World Bank series for five Caribbean economies, and whether they agree with it. They were compared on the same 25 figures.

All reads were taken on 14 October 2026 between 02:17 and 02:24 UTC. The World Bank API reported its data as last updated on 8 October 2026.

## The services

| | StatCite | World Bank Data360 MCP | Data Commons MCP |
|---|---|---|---|
| Maintainer | This repo | World Bank (`worldbank/data360-mcp`) | Google Data Commons (`datacommonsorg/agent-toolkit`) |
| Hosted endpoint | `https://statcite.com/mcp` | `https://maimcpext.worldbank.org/ext/data360/mcp` | `https://api.datacommons.org/mcp` |
| Key needed | No | No (initialize, tools/list and tools/call all answered without one) | Yes. The hosted endpoint and the v2 REST API both returned HTTP 401 without an `X-API-Key` |
| Tools | 12 | 16 live from tools/list (the README lists 6) | 6, counted from the repo's `server.py` (a live tools/list needs a key) |
| Citation on each figure | A citation object with source URL, API call, licence, attribution, retrieval time and a ready citation sentence | The dataset name and indicator id in a metadata block. No URL, licence, retrieval time or citation text | A provenance id and provenance URL once per data source. No per-figure citation text or licence |

No key was obtained, so the Data Commons MCP itself was never called. The Data Commons figures below come from the keyless datacommons.org website endpoint (`/api/observations/point`), which serves the same knowledge graph. Read that column as the data behind the MCP, and the MCP's own output as untested.

## The 25 figures

Five economies: Barbados, Jamaica, Trinidad and Tobago, Guyana and Saint Lucia. Five World Development Indicators series: real GDP growth (NY.GDP.MKTP.KD.ZG), CPI inflation (FP.CPI.TOTL.ZG), unemployment (SL.UEM.TOTL.ZS), population (SP.POP.TOTL) and the current account balance (BN.CAB.XOKA.GD.ZS). StatCite served all 25 from the World Bank. Each cell is the latest period and value.

| Country | Indicator | StatCite | Data360 | Data Commons |
|---|---|---|---|---|
| BRB | GDP growth | 2025: 2.700 | 2025: 2.7 | 2024: 2.482 |
| BRB | Inflation | 2025: 0.847 | 2025: 0.847 | 2024: -0.440 |
| BRB | Unemployment | 2025: 6.524 | 2025: 6.524 | 2025: 6.524 |
| BRB | Population | 2025: 282,623 | 2025: 282,623 | 2025: 282,623 |
| BRB | Current account | 2017: -5.069 | 2017: -5.069 | 2017: -5.215 |
| JAM | GDP growth | 2025: 0.082 | 2025: 0.082 | 2024: -0.535 |
| JAM | Inflation | 2025: 4.005 | 2025: 4.005 | 2024: 5.412 |
| JAM | Unemployment | 2025: 3.286 | 2025: 3.286 | 2025: 3.286 |
| JAM | Population | 2025: 2,837,077 | 2025: 2,837,077 | 2025: 2,837,077 |
| JAM | Current account | 2025: 1.476 | 2024: 3.083 | 2024: 3.083 |
| TTO | GDP growth | 2025: -0.788 | 2025: -0.788 | 2024: 2.509 |
| TTO | Inflation | 2025: 0.994 | 2025: 0.994 | 2024: 0.527 |
| TTO | Unemployment | 2025: 3.329 | 2025: 3.329 | 2025: 3.329 |
| TTO | Population | 2025: 1,367,764 | 2025: 1,367,764 | 2025: 1,367,764 |
| TTO | Current account | 2025: 4.954 | 2025: 4.812 | 2024: 2.518 |
| GUY | GDP growth | 2025: 19.336 | 2025: 19.336 | 2024: 43.819 |
| GUY | Inflation | 2025: 3.330 | 2025: 3.330 | 2024: 2.904 |
| GUY | Unemployment | 2025: 11.962 | 2025: 11.962 | 2025: 11.962 |
| GUY | Population | 2025: 835,986 | 2025: 835,986 | 2025: 835,986 |
| GUY | Current account | 2023: 13.902 | 2023: 13.902 | 2023: 13.902 |
| LCA | GDP growth | 2025: -0.574 | 2025: -0.574 | 2024: 3.892 |
| LCA | Inflation | 2025: 2.027 | 2025: 2.027 | 2024: -0.110 |
| LCA | Unemployment | 2025: 9.452 | 2025: 9.452 | 2025: 9.452 |
| LCA | Population | 2025: 180,149 | 2025: 180,149 | 2025: 180,149 |
| LCA | Current account | 2025: -6.256 | 2025: -6.256 | 2024: -2.515 |

Values are shown to three decimals for reading. Full precision is in the services' responses.

## What the comparison shows

Data360 agreed with StatCite on 23 of the 25 figures. The two exceptions are both current account balances, Jamaica and Trinidad and Tobago. On both, StatCite matches the live World Bank API exactly (Jamaica 2025: 1.47613395587505, Trinidad and Tobago 2025: 4.95440327260816, read from `api.worldbank.org` the same morning). So Data360 was serving an older copy of those two series.

Data Commons agreed on 11 of the 25: all five unemployment figures, all five population figures through `Count_Person`, and Guyana's current account. Its `worldBank/*` variables come from a World Bank snapshot (`dc/base/WorldBankDatasets`) that stops at 2024 for GDP growth and inflation in all five economies. On Barbados's current account it has the same year as StatCite, 2017, with a different value (-5.215 against -5.069).

Both services overlap StatCite's World Bank coverage almost completely for these economies. Neither attaches a citation a reader can paste. A search of each for the two Caribbean central banks found no dataset from either: Data360's dataset search for "ECCB" and for "Eastern Caribbean Central Bank" returned only the FAO food price index, whose method note names the ECCB as one source used to fill gaps in history, and its search for "Central Bank of Barbados" returned nothing. Data Commons's variable search for both names returned exchange rates and World Bank debt series, with no variable sourced from either bank.

## Method and limits

- StatCite was read through `GET /v1/indicator/{key}?country={ISO3}&latest_only=true`, and again through `/v1/series?id=worldbank/{code}`, with identical values.
- Data360 was read through its hosted MCP with `data360_get_data` (`database_id=WB_WDI`, `indicator_id=WB_WDI_<code with underscores>`, years 2015 to 2026), taking the latest non-null year.
- Data Commons stat-var names that returned data use a lowercase `worldBank/` prefix. The spelling `WorldBank/` returned nothing.
- The Data360 figures for Jamaica and Trinidad and Tobago, the World Bank API figures for all three disputed current accounts, and Data Commons's Barbados GDP growth were re-read independently after the first pass, with the same results.
- One read on one morning. Data360 may refresh to the October World Bank update at any time, so the two disagreements may close.

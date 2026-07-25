// Records real upstream API responses as test fixtures.
// Run: node scripts/record-fixtures.mjs
import { writeFile, mkdir } from 'node:fs/promises';

const targets = {
  'wb-bb-inflation': 'https://api.worldbank.org/v2/country/BRB/indicator/FP.CPI.TOTL.ZG?format=json&per_page=100',
  'wb-usa-multi-mrv': 'https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.KD.ZG;SL.UEM.TOTL.ZS;FP.CPI.TOTL.ZG?source=2&format=json&mrv=3',
  'wb-usa-cpi-index': 'https://api.worldbank.org/v2/country/USA/indicator/FP.CPI.TOTL?format=json&per_page=100',
  'wb-bad-indicator': 'https://api.worldbank.org/v2/country/USA/indicator/NOT.A.CODE?format=json',
  'wb-fx-brb': 'https://api.worldbank.org/v2/country/BRB/indicator/PA.NUS.FCRF?format=json&mrv=3',
  'frankfurter-latest': 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY',
  'frankfurter-hist': 'https://api.frankfurter.dev/v1/2020-06-15?base=USD&symbols=EUR',
  'frankfurter-currencies': 'https://api.frankfurter.dev/v1/currencies',
  'dbnomics-search': 'https://api.db.nomics.world/v22/search?q=barbados%20gdp&limit=5',
  'dbnomics-series': 'https://api.db.nomics.world/v22/series/IMF/WEO:latest/BRB.NGDP_RPCH?observations=1',
};

await mkdir(new URL('../test/fixtures/', import.meta.url), { recursive: true });
const summary = [];
for (const [name, url] of Object.entries(targets)) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'StatCite-fixture-recorder/1.0' }, redirect: 'follow' });
    const text = await res.text();
    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 1); } catch {}
    await writeFile(new URL(`../test/fixtures/${name}.json`, import.meta.url), pretty);
    summary.push(`${name}: HTTP ${res.status} ${res.headers.get('content-type')} ${text.length}b`);
  } catch (e) {
    summary.push(`${name}: FAILED ${e.message} ${e.cause?.code ?? ''}`);
  }
}
console.log(summary.join('\n'));

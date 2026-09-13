// Print the local licence ledger as the JSON /v1/sources serves, for
// tools/gen-sources-prerender.py --from-json. Run from server/:
//
//   node --import tsx tools/export-sources.mts > sources.json
import { SOURCES } from "../src/core/sources.ts";

process.stdout.write(JSON.stringify({ sources: SOURCES }, null, 2) + "\n");

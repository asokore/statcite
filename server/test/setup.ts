// Loaded before every test file by `npm test` (see package.json).
//
// Outage tests have to walk the whole retry ladder, and the ladder's waits are
// real sleeps: 300ms then 900ms per failing host. On 2026-09-24 the slowest test
// in the suite spent 15.6s of its 15.9s asleep, and the 54 tests over a second
// were 94% of summed test time. 26 files install their own fetch stub, so this
// is set once here rather than in each of them.
//
// Only the WAIT is removed. Every attempt still happens, so retry counts and the
// per-request host breaker behave exactly as in production. One test opts back
// in to real delays to prove production still pauses: see
// "a failing host is retried after a real pause" in upstream-resilience.test.ts.
import { _setRetryDelayScale } from "../src/core/upstream.ts";

_setRetryDelayScale(0);

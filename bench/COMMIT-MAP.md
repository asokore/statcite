# Commit hashes before and after 15 September 2026

On 15 September 2026 this repository's history was rewritten once. Two unused
archive bundles were removed from every commit, an early draft of the internal
brief was generalised, a personal email address was replaced with the project
role address, and commit metadata was normalised. Every other file, at every
commit, is byte-identical to what it was, and the current tree is unchanged.

Rewriting changes commit hashes. Nothing about the benchmark changed, so this
table lets anyone re-check a pre-registration or result freeze against an
archived snapshot. The `bench/` tree hash is the SHA-1 of the whole `bench/`
directory at that commit. It is the same before and after, which is the
machine-checkable statement that no benchmark artefact moved.

Verify any row yourself:

```bash
git rev-parse <new commit>^{tree}:bench
```

| Tag | Commit before | Commit now | `bench/` tree hash (unchanged) |
|---|---|---|---|
| `bank-frozen-P0` | `889b22093fe8` | `56b69e98239a` | `dcf5b0527032` |
| `bench-P0` | `00651d0f4a38` | `fd14b7dd2e4f` | `03ca8b283a3e` |
| `prereg-P0` | `fe0169e71c9e` | `1919cc64e59c` | `9cbf94ce2ec0` |
| `prereg-R1` | `322e64ea3f6f` | `2692f005e567` | `93765614d6a9` |
| `prereg-R2` | `7abd1873e4ed` | `80d1283661c9` | `72c58f72226b` |
| `result-R1` | `f6c7ee866ca5` | `328653f0373b` | `6a2567d277ae` |
| `v1.10.0` | `56a735258cb5` | `71f1ffeec223` | `7fa5cccc7247` |
| `v1.10.1` | `c08773eafe9c` | `1b3b4132b250` | `7fa5cccc7247` |
| `v1.11.0` | `9ce8b08e487c` | `9d0b244cc2eb` | `7fa5cccc7247` |
| `v1.11.2` | `6f2eae1a4618` | `7695d4a3e9c1` | `7fa5cccc7247` |
| `v1.11.3` | `8fa68c429b8e` | `5d79d822269a` | `7fa5cccc7247` |
| `v1.12.0` | `18da9f1d068a` | `d7b39e3f1896` | `7fa5cccc7247` |
| `v1.12.1` | `02fcee8e99f5` | `c0b113c419b9` | `7fa5cccc7247` |
| `v1.12.2` | `ca5d9e6c4150` | `9126df804428` | `7fa5cccc7247` |
| `v1.12.3` | `fbcade7c8c44` | `7fdd3932dd77` | `f03b2b56d05c` |
| `v1.5.0` | `389cf1bf5f14` | `25ffdfb08a87` | `7fa5cccc7247` |
| `v1.6.0` | `9f6421d0b152` | `845d1abee884` | `7fa5cccc7247` |
| `v1.7.0` | `27f387e28cee` | `32f00cce57b3` | `7fa5cccc7247` |
| `v1.8.0` | `73bf69b63117` | `5571ea85df0c` | `7fa5cccc7247` |
| `v1.8.1` | `4d5a70c43bd3` | `134d1a817fc4` | `7fa5cccc7247` |
| `v1.9.1` | `45cc6a20fa02` | `49e47f98f2b6` | `7fa5cccc7247` |

Other hashes quoted in this directory:

| Quoted as | Now |
|---|---|
| `322e64ea3f6f` (the R1 pre-registration freeze, cited in DEVIATIONS.md) | `2692f005e567` |

Commit messages that quoted a hash were updated to the new hash when the history
was rewritten, so references inside the log still resolve. References inside
files were not, which is what this table is for.

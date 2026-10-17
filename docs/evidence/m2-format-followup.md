# Match formatter follow-up

Observed 2026-10-17 in `/Users/sterling/Documents/dev/workspaces/personal/zchess`, branch `codex/faber-rebuild`. Follow-up to INTEGRATION-02 receipt `d8bb655`: **the concrete `src/match.fab` formatting debt is removed**. This is a scoped hygiene repair, not a new full integration verdict.

Read the pinned formatter's live help, then held the Faber source lease while running:

```sh
.tools/faber/1.12.0/bin/faber format --write src/match.fab
.tools/faber/1.12.0/bin/faber format --check src/match.fab
.tools/faber/1.12.0/bin/faber test --locale en . --include match
```

All exited **0**. Write result: `formatted src/match.fab` / `formatted 1 of 1 files`. Check result: `1 files already formatted`. Filtered test result: **10 passed; 0 failed; 0 blocked; 0 skipped**. This executes the match codec, exact initial layout, independent copy, malformed input, kings/flags/castling/en-passant integrity, revision and last-move JSON tests.

Only the formatter changed the source; no manual semantic edits. Its diff is **197 insertions, 111 deletions** in `src/match.fab`: comma/argument spacing, expanded blocks and accessor bodies, canonical comparison spelling (`≢` to `≠`, `<`/`>` to `≺`/`≻`), `then return` formatting, and canonical quoted-string spelling in `lastMoveJson`. The existing last-move JSON assertions still pass after the quote normalization.

The formatter reports existing advisory diagnostics both before writing and on the clean check: `WARN018:prefer_string_template` for JSON concatenation, `WARN003:unused_function` for 14 public helpers analyzed in isolation, and `WARN027:complexity_budget_exceeded` for `structure` and `integrity`. The clean check's locations are line 409 for WARN018; 29, 42, 246, 266, 272, 278, 284, 290, 306, 311, 318, 386, 395 and 407 for WARN003; 146 and 323 for WARN027. None are errors. The final filtered test command emitted no warnings.

The earlier integrated package/Node/HTTP evidence remains the semantic interface. No full suite, standalone imported-type SEM002 repair, arena SEM010 repair, dependency/toolchain change, viewer restart or remote mutation was performed. Those unrelated compiler residuals remain separate from this file's now-passing format check.

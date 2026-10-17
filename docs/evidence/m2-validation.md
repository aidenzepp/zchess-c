# Milestone 2 integrated package and HTTP witness

Source: `9d71ac5421cabdab27021c6c4a1cb6c525f8b1f1`, branch `codex/faber-rebuild`, 2026-10-17 UTC. Tracked tree was clean before the gate. Faber 1.12.0 fixed local installation; commands run serially under `.tools/faber-source-lock`. No product changes, dependency/toolchain upgrades, operator viewer restart, remote mutation or browser witness.

## Package commands

| Command | Observed result |
| --- | --- |
| `.tools/faber/1.12.0/bin/faber check --locale en .` | Exit 0, package `ok`. Warnings WARN003 unused_function, WARN013 unnecessary_varia, WARN018 prefer_string_template, WARN027 complexity_budget_exceeded. |
| `.tools/faber/1.12.0/bin/faber test --locale en .` | Exit 0: **88 passed**, 0 failed/blocked/skipped. Includes arena, geometry, match codec/integrity, attacks, ordinary moves, castling, en passant, promotion, terminal results and CLI protocol. |
| `node --test scripts/serve.test.mjs web/controller.test.mjs web/space.test.mjs web/slices.test.mjs` | Exit 0: **51 passed**, 0 failed/cancelled/skipped/todo. Includes real pinned startup/geometry children and separately declared mocked match transport/controller cases. |
| `.tools/faber/1.12.0/bin/faber format --check src` | Exit **1**, nothing written. See hygiene residual below. |
| `git diff --check` | Exit 0. |

The formatter is not a pass. It reports the known `SEM010:expression_type_mismatch` and `SEM010:assignment_type_mismatch` at `src/arena.fab:118`, and now also `SEM002:unknown_qualified_type` for imported `game.Match`/`rules.Move`/`rules.Outcome` in attacks/protocol/rules. These standalone-format type refusals coexist with the passing package check/test/runtime. Separately, it says `would reformat src/match.fab`; final summary: `1 of 7 files would be reformatted; rerun with --write to apply, 4 refused (nothing written)`. The match formatting difference is a concrete outstanding hygiene item, distinct from compiler refusals. No verifier fix was made; Mind owns disposition.

## Actual HTTP lifecycle

`node .tools/probes/m2-http-witness.mjs` exited 0, using **actual current-source Faber** through `startServer({port:0})`, including compiler check and Faber init before readiness. Owned URL was `http://127.0.0.1:63073`; the owned server was stopped at completion. Ignored runner/output: `.tools/probes/m2-http-witness.mjs` and `.tools/probes/m2-http-witness.json`. No production fixture-loading or JavaScript rules. Every move below was checked against its immediately preceding Faber-supplied descriptor before submission.

| Side | From → to | Supplied kind | Revision after success | Move HTTP ms |
| --- | --- | --- | --- | --- |
| White | 0 → 56 | move | 1 | 262.7 |
| Black | 440 → 312 | move | 2 | 266.0 |
| White | 56 → 312 | capture | 3 | 253.1 |
| Black | 504 → 312 | capture | 4 | 274.6 |

Initial read had revision 0 and 48 occupied cells. A stale revision-0 New game at revision 4 returned HTTP409 `STALE_REVISION`; a fresh read exactly equaled the prior successful snapshot. Wrong process session returned HTTP409 `STALE_SESSION`. Deliberate valid New game returned revision 5, 48 occupied cells and null lastMove. A fresh selection then supplied the legal 0→56 descriptor.

Two **declared injected transport failures** replaced only the pending mutation child's callback: malformed JSON yielded HTTP502 `INVALID_FABER_JSON`; a synthetic killed-child error yielded HTTP504 `FABER_TIMEOUT`. Each was followed by a **real Faber read**, exactly equal to the pre-failure revision-5 snapshot. A subsequent actual Faber move 0→56 succeeded at revision 6. This proves host failure retention and recovery at the callback boundary; the injected timeout is not a claim that an actual Faber process exceeded ten seconds. Actual child timeout/kill behavior is separately covered by the Node transport tests.

Real geometry request `queen-center`, selected219 returned schema1 with 60 destinations. `/assets/white_king.png` returned image/png, 2,279 bytes, byte-for-byte equal to the existing file. Host responses stripped the private capsule.

Successful actual match HTTP calls took **239.9–289.0ms** in this run (reads/selections/New game/moves), all below the existing 10,000ms child budget; ordinary legal mutations took 253.1–274.6ms. Geometry took 265.5ms. These are local single-run observations, not a worst-case search or concurrency performance claim. Browser play, camera interaction, promotion UI and visual acceptance belong to VIEW-02 and are not inferred from these HTTP assertions.

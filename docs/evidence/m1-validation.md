# M1 integrated validation

Verdict: **residual** — combined compiler and tests pass; formatter gate fails.

Assigned verifier task: `af21b19d` (M1-INTEGRATION). Executed 2026-10-17 UTC in `/Users/sterling/Documents/dev/workspaces/personal/zchess` on `codex/faber-rebuild`. Source tip at start: `1971392eafffb6a900f9b6f68d0ff0a1fd676b7b`; final tested tip: `745d2305c12dc2d441ccc86b5cf0b80255f41474`. The intervening LOCAL commit changed local delivery material, not Faber/web/server sources. Product source was not edited by this verifier.

## Commands and observed results

| Exact command | Exit | Observation |
| --- | --- | --- |
| `npm ci` | 1, then 0 | Sandbox attempt failed `ENOTFOUND registry.npmjs.org` fetching `three-0.180.0.tgz`; escalation succeeded: added 1 package, audited 2, 0 vulnerabilities. |
| `.tools/faber/1.12.0/bin/faber format --check src` | 1 | `would reformat src/main.fab`; `1 of 3 files would be reformatted; rerun with --write to apply, 1 refused (nothing written)`. Refused module diagnostics below. |
| `.tools/faber/1.12.0/bin/faber check --locale en .` | 0 | `ok` for current project. Warnings WARN003 unused functions, WARN018 prefer string template, WARN027 complexity budget. |
| `.tools/faber/1.12.0/bin/faber test --locale en .` | 0 | **17 passed, 0 failed, 0 blocked, 0 skipped**: 7 arena and 10 geometry cases. |
| `node --test scripts/serve.test.mjs web/slices.test.mjs web/space.test.mjs web/controller.test.mjs` | 1, 1, then 0 | Final prerequisite-complete run with loopback escalation: **33 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**. Initial attempts detailed below. |

The formatter prints these red diagnostics at `src/arena.fab:118`:

```text
error[SEM010:expression_type_mismatch]: src/arena.fab:118
  | destinations ← geometry.previews(board, moved, selected)
error[SEM010:assignment_type_mismatch]: src/arena.fab:118
  | destinations ← geometry.previews(board, moved, selected)
```

This is an observed formatter refusal, despite the project check and executed tests succeeding. No formatter write, expectation adjustment, or product fix was attempted. The formatter also emitted the WARN003/WARN018/WARN027 warnings described above. Formatting is not accepted as passing.

## Host test environment and coverage

The first host run executed 33 cases: 23 passed and 10 failed with `listen EPERM: operation not permitted 127.0.0.1`. These failures were sandbox listener restrictions, not accepted product failures. A loopback-escalated retry executed 33 cases: 32 passed; the local vendor asset check failed with `404 !== 200` for `/vendor/three/build/three.module.js` while the first `npm ci` was still pending and `node_modules/three` was absent. Running host tests before that dependency operation had completed was a sequencing mistake; this intermediate result does not establish a product defect.

After `npm ci` failed DNS and its approved escalation installed the pinned dependency, the same host command was rerun with loopback escalation and all **33 cases passed**: 11 server, 7 controller, 10 slices, 5 space. This rerun resolved the named dependency/listener environment gaps; no source changes were made between host runs.

The combined host proof includes actual pinned Faber current-source HTTP snapshots and semantic errors; malformed/duplicate/remote Host/Origin rejection; timeout, child failure, overflow, invalid JSON and invalid schema errors; bounded concurrency and child cleanup; static containment and local three.js assets; startup compiler/source checks and busy-port rejection; controller identity, pending/error/stale-response behavior; all slice planes at fixed-axis extremes; and 3D identity, keyboard intent and drag suppression logic. Importing these plain JS modules in the tests also checks their syntax.

## Coordination and limits

Faber proof and host tests held an atomic `.tools/faber-source-lease` directory, released after checks. Mind reserved the exclusive proof window in Vivi mail `d381c8f1` and identified the canonical project lease as `.tools/faber-source-lock` (rule `b4b5cc58`) after execution had begun; it explicitly directed no restart solely for the naming difference. No concurrent Faber writers/checkers ran in this window. Evidence commit uses the separate `.tools/git-write-lock` discipline from rule `b4154da9`.

No ENV probes or individual unit sanity commands were rerun. Tests created ephemeral loopback listeners and cleaned them up; no preview server was started or left running. No browser was used, and this document makes no pixel, WebGL, or browser acceptance claim. VIEW-01 remains a separate witness. No push, release, deployment, or remote mutation was performed.

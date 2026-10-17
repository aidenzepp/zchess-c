# M1 formatter follow-up

Verdict: **residual**. The main entry is formatted and its current-source JSON query is unchanged. Faber 1.12.0 still refuses to format the working arena module. The integrated formatter gate is not accepted as passing. This follows task `ea61d8cf` and preserves the historical results in `m1-validation.md`.

Executed 2026-10-17 UTC in `/Users/sterling/Documents/dev/workspaces/personal/zchess`, on `codex/faber-rebuild`. The only retained source change is the pinned formatter's rewrite of `src/main.fab` CLI annotations to their braced spelling. `src/arena.fab` is byte-identical to its committed pre-task source.

## Final narrow checks

| Command | Exit | Result |
| --- | --- | --- |
| `.tools/faber/1.12.0/bin/faber format --write src/main.fab` | 0 | Formatted the CLI annotation spelling. |
| `.tools/faber/1.12.0/bin/faber format --check src/main.fab` | 0 | `1 files already formatted`. |
| `.tools/faber/1.12.0/bin/faber format --check src/arena.fab` | 1 | Refused the imported preview assignment at line 118; nothing written. |
| `.tools/faber/1.12.0/bin/faber check --locale en .` | 0 | Current package passes. Existing WARN003, WARN018 and WARN027 diagnostics remain warnings. |
| Node `execFileSync` of the absolute pinned binary with `['run','--locale','en',ROOT,'--','rook-center','219']`, followed by `JSON.parse` and `assert.deepEqual` | 0 | Exactly one stdout object matches the complete expected schema, fixture catalog, selected ID 219, 512 cells containing only a white rook at 219, 512 zero moved entries, and the exact 21 sorted rook destinations. |

The final JSON assertion expects destinations `[27,91,155,195,203,211,216,217,218,220,221,222,223,227,235,243,251,283,347,411,475]`. It compares the complete envelope, including keys and every array element, rather than only checking that JSON parses.

The unresolved formatter diagnostics are:

```text
error[SEM010:expression_type_mismatch]: src/arena.fab:118
  | destinations ← geometry.previews(board, moved, selected)
error[SEM010:assignment_type_mismatch]: src/arena.fab:118
  | destinations ← geometry.previews(board, moved, selected)
1 refused (nothing written)
```

## Supported boundary and rejected workaround

Pinned `format --help` exposes paths, `--check`, `--write`, `--stdout` and `--stdin`; it exposes no package-analysis mode or import-context flag. The supported package semantic check above resolves this same imported signature successfully, and the actual package invocation executes it successfully. This isolates the observed failure to the formatter path; its internal cause was not inspected or proved.

A temporary explicit `∷ list<i32>` annotation on the imported result allowed `format --write src/arena.fab` and `format --check src` to exit 0. The package semantic check also exited 0, warning that the annotation was unnecessary. Actual CLI execution then failed with:

```text
error: unsupported MIR lowering: array construction from non-array source before aggregate MIR lowering
```

That workaround and all arena formatting it produced were reverted before the final narrow checks. No runtime-breaking cast, JSON rewrite, geometry change, compiler patch or language upgrade remains. A passing formatter check is not a substitute for executable behavior.

A read-only attempt at `format --check .` recursively traversed the ignored `.tools/` compiler reference corpus rather than restricting itself to the manifest's source directory. It was interrupted (exit 130) once that behavior was observed; it is not a product gate result, and no files were written. Use explicit source paths or `src` for formatting. The following package check in that interrupted shell was not executed until the later explicit check recorded above.

## Coordination and remaining gate

The canonical `.tools/faber-source-lock` was acquired before source edits and held across these checks and the scoped commit; git mutations use the separate `.tools/git-write-lock`. No rule or host suites were rerun. No historical evidence, tests, geometry, host code or UI was changed. No browser, push, merge, release or deployment claim is made.

The remaining limitation is explicit: the required `format --check src` gate cannot pass for the unchanged working arena module under the observed pinned formatter behavior. Main hygiene is resolved; acceptance or upstream repair of the arena formatter limitation belongs to the milestone owner. Package semantics and the current CLI schema proof pass, but they do not erase this residual.

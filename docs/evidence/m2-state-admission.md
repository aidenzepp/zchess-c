# STATE-ADMIT-01 — Faber state round-trip admission

Observed 2026-10-17 in `/Users/sterling/Documents/dev/workspaces/personal/zchess`, branch `codex/faber-rebuild`. Verdict: **PASS for the bounded state/CLI mechanism**. This is synthetic transport evidence, not playable rules, a production codec, or chess move execution. Product files and the running viewer were untouched.

## Concrete mechanism

Pinned `.tools/faber/1.12.0/bin/faber` interprets a public `class Match` with `var ti8[8,8,8] board`, `var list<i8> moved`, and `var list<i32> meta`. Explicit typed `state.Match` bindings work across the test-module import. Reconstruction creates a fresh tensor with `.create(0,[8,8,8])`, appends 512 fresh flags, and copies every tensor element, flag, and scalar in loops. No tensor clone or aggregate assignment is relied on for independence.

Only Faber creates, decodes, validates, mutates, and encodes success capsules. Node invokes `execFile` with the absolute pinned binary/root, `shell:false`, 10,000 ms timeout, `SIGKILL` on timeout, and 1 MiB maximum output; children run serially. Node parses evidence envelopes and forwards each success capsule unchanged. Its only capsule edits produce negative inputs. No network or listener is used.

## Canonical capsule grammar and bounds

ASCII, no whitespace, exactly four `|`-separated fields, no trailing delimiter:

```text
ZC1|piece0,...,piece511|moved0,...,moved511|side,revision,c0,c1,c2,c3,epTarget,epCaptured,epAxis,result,lastFrom,lastTo,lastPromotion
```

- Decimal tokens are canonical: `0` or optional `-` followed by a nonzero first digit and remaining ASCII digits; no `+`, leading zero, `-0`, decimal point or exponent. At most seven characters per token; complete capsule at most 16,384 characters, and every accepted token is canonical ASCII, so accepted bytes equal characters.
- Board index is `file + 8*rank + 64*tier`. Exactly 512 signed piece codes −6…6 and 512 flags `0|1`.
- Thirteen metadata scalars: side `-1|1`, revision `0…1000000`, four binary castling entitlements; optional en passant is all `-1` when absent, otherwise two distinct cell IDs `0…511` and axis `1|2`; result `0…3`; absent last move is `-1,-1,0`, otherwise distinct source/destination IDs `0…511` and promotion `0|2|3|4|5`.
- These are representation bounds, not semantic legality validation. Castling entitlement ownership/order and result enum meaning must be fixed during product protocol lowering. Synthetic dense positions are deliberately not legal chess matches.
- The final decoder uses bounded decimal arithmetic and a fixed signed-`i8` lookup, **no fallible string-to-integer conversion**. It checks lexical form, canonical decimal re-encoding, ranges, lengths, and optional sentinels before constructing decoded state. Decode is exported only for isolated probe tests; a production boundary must expose validated operations rather than unchecked decode.

## Commands and observations

Final versions were exercised serially with the source lease held:

```sh
.tools/faber/1.12.0/bin/faber check --locale en .tools/probes/m2-state-admission
.tools/faber/1.12.0/bin/faber test --locale en .tools/probes/m2-state-admission --include state
node .tools/probes/m2-state-admission/run.mjs
```

All three exited **0**. Filtered Faber result: `test result: ok. 5 passed; 0 failed; 0 blocked; 0 skipped`.

1. Actual 48-piece initial layout: every board cell, flag, and metadata scalar round-trips with zero differences; occupied count 48, all moved flags zero, absent optional metadata retained.
2. Fully populated 512-cell sentinel: magnitudes cycle 1…6, signs alternate on every cell, flags alternate 0/1, and all 13 metadata values vary. Every cell/flag and every scalar compared against the decoded state, zero mismatches. Initial layout separately exercises empty code 0.
3. Candidate reconstruction: mutate cells 0 and 511, both corresponding flags, and all 13 scalars. Assertions verify the intended site values and exactly 17 differing fields. Every original field remains equal to the pre-mutation encoded/decoded baseline, and the original capsule remains identical.
4. Separate process chain: **seed → roundtrip → candidate → advance → roundtrip**, followed by a rejected synthetic transition. The first roundtrip and candidate return the exact incoming capsule. The advance changes exactly 10 metadata fields; Faber also compares all untouched cells, flags and metadata indices 3…5. Zero untouched/codec mismatches. Metadata changes from `[-1,42,1,0,0,1,219,283,2,2,17,81,5]` to `[1,43,0,0,0,1,-1,-1,-1,0,81,89,0]`; the next child observes that exact evidence and identical advanced capsule. Rejected transition returns `TRANSITION_REJECTED`, no success capsule, and `retained:true` for the original value.
5. **35 malformed inputs** reject with `ok:false`, stable code, no capsule, and process exit 0: wrong version; missing/extra field; short cells; extra flag; short metadata; piece high/low; invalid flag/side/revision/castling/result; inconsistent, out-of-range, same-cell or invalid-axis en passant; inconsistent, out-of-range, same-cell or invalid-promotion last move; nonnumeric, oversized numeric, fullwidth Unicode, leading-zero, negative-zero, plus-sign, decimal, whitespace, empty and truncated tokens; oversized capsule. Fullwidth `１２` is observed rejected as `PIECE`; ASCII malformed numeric tokens return `INTEGER`. The runner asserts the observed codes, without claiming all Unicode behavior was characterized.

Runner summary: **41 separate CLI children**, 35 malformed-input cases plus the six-call success/rejected-transition chain; **41 exit codes all 0**. Maximum measured success capsule **2,341 UTF-8 bytes**, below 16,384. Runner itself exits nonzero if any child fails or assertion fails. No hash-only state comparisons were used.

## Diagnostics and limitations

Final package check prints these diagnostics (locations in the ignored final `src/state.fab`):

```text
warning[WARN018:prefer_string_template]: .../src/state.fab:212
warning[WARN018:prefer_string_template]: .../src/state.fab:223
warning[WARN018:prefer_string_template]: .../src/state.fab:259
warning[WARN003:unused_function]: .../src/state.fab:216
warning[WARN027:complexity_budget_exceeded]: .../src/state.fab:130
warning[WARN027:complexity_budget_exceeded]: .../src/state.fab:216
```

The corresponding sources are JSON-envelope concatenation at lines 212/223/259, exported CLI dispatch `invoke` at 216, and validation at 130. No diagnostics were hidden or promoted to pass criteria. The filtered test command emitted no diagnostic warnings in the final successful run.

During probe development, unchecked `↦` conversions produced `SEM011:failable_conversio_requires_handler`; typed `i32` text-slice indices produced `invalid MIR: slice index is not numerus`; using `int` indices resolved it. Inferred imported nominal values caused type errors until the public class and explicit `state.Match` annotations were used. Boolean template interpolation prints canonical `verum`, so envelopes explicitly emit JSON `true`/`false`. Initial runner expectations classified fullwidth digits as `INTEGER`; the observed safe rejection was `PIECE`, and the receipt/runner now records that classification. Final state source avoids fallible integer parsing entirely. These are resolved probe diagnostics, not failures of the admitted final mechanism.

Only this isolated probe was checked/tested. No root suites, product rules, schema/runtime implementation, compiler upgrade, dependencies, network operations, or remote mutation were performed. Advance is synthetic and exercised at revision 42, not a production transition implementation with revision exhaustion handling. The probe sources remain ignored and locally reproducible; only this evidence file is committed.

## Final probe SHA-256

```text
b6ea31bbda3b827472f85bfc5f8972e60ffcd6f8d6be7c3add05903c31ddcb97  faber.toml
8f47300a423fd6138f9148534e5d82b5336339b9f5d8fb53780ae99c27691787  src/main.fab
a3ba0ec36828bfc4ebfc74743b4dbe4b1640053702560610bce9c013c7018364  src/state.fab
e520703aff1ecad5e97d84a7e1a413e5759451c7dddde332b732a5dde545d34d  src/state.proba
f72ab7da5d2bdea4066435af4238e34caae010e7a44606d030def3d59d820e40  run.mjs
```

Paths above are relative to `.tools/probes/m2-state-admission/`.

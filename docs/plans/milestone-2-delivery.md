# Milestone 2 delivery: admission first

Status: approved goal; A mechanism admitted. Downstream exact contract and logical units below are READY for delivery review, not a claim of playable integration.
Goal: `docs/plans/milestone-2-playable.md`. Repository: `/Users/sterling/Documents/dev/workspaces/personal/zchess`; branch: `codex/faber-rebuild`.

## Approved boundary

Build the shared-screen local legal game described in the goal. The operator approved same-axis en passant, deferring other draw rules, and one memory-only local match. Faber owns complete state/rules; Node retains only an opaque Faber-created capsule between CLI calls. The existing geometry viewer must remain usable. No browser changes, Faber product modules or new dependencies are part of A.

Existing receipts already establish the pinned installation, basic CLI operands/imports, tensor indexing and current geometry. Do not repeat installation, emission/runtime, or original argv probes. The new question is whether the pinned language can round-trip complete match metadata and safely simulate an independent candidate through repeated CLI invocations.

## A — STATE-ADMIT-01: state capsule and candidate isolation

- **outcome:** Observe, or precisely reject, the proposed per-action CLI state mechanism before product implementation depends on it.
- **write_scope:** ignored `.tools/probes/m2-state-admission/faber.toml`, `.tools/probes/m2-state-admission/src/main.fab`, `.tools/probes/m2-state-admission/src/state.fab`, `.tools/probes/m2-state-admission/src/state.proba`, `.tools/probes/m2-state-admission/run.mjs`; tracked receipt only `docs/evidence/m2-state-admission.md`.
- **depends_on:** approved goal and admission delivery review; no other unit.
- **read_scope:** goal, current `src/arena.fab`/`geometry.fab`, accepted evidence, installed Faber explain/reference material. Product files are read-only.
- **non_goals:** legal moves, attack maps, HTTP/server/browser edits, production state protocol implementation, package/dependency/toolchain changes, broad package suites.
- **risk:** medium: string decoding, compound match representation and tensor/metadata aliasing are not yet observed with 1.12.0.
- **integrable:** yes for the evidence document only; ignored probe code cannot be staged as product implementation.

### Probe contract

Use the existing manifest and English CLI pattern. Keep all probe algorithms in Faber; `run.mjs` is a bounded `execFile` witness that forwards opaque capsules and asserts returned evidence, never reconstructs a next state. Use the fixed binary `.tools/faber/1.12.0/bin/faber`, fixed probe root, `shell:false`, timeout 10 seconds per child, stdout ≤1 MiB, serial calls and no network/listener. The runner must stop its children and exit nonzero on failed assertions.

The probe's match value includes a `ti8[8,8,8]` board, 512 moved flags, side, revision, four castling entitlements, optional en-passant skipped target/captured cell/axis, result, and last-move from/to/promotion metadata. Use explicit loops to rebuild a candidate board and moved metadata; mutate that candidate and verify all original fields remain unchanged. A supported concrete representation is the probe's output, not an assumed record syntax.

Use one canonical, versioned ASCII capsule ≤16,384 UTF-8 bytes. Faber alone encodes and decodes it. Require exact field/array lengths, signed piece range −6…6, binary moved values, scalar ranges and consistent absent sentinels. Validate text before any fallible integer conversion; malformed input must return a structured rejection rather than a crash, partial state or fake empty board. This is a transport/representation probe: synthetic dense positions prove capacity, not legal chess positions. Record the exact grammar and bounds chosen in the receipt for later protocol lowering.

CLI operands: `operation`, `capsule` (use `-` for no input). Operations: `seed` emits deterministic state, `roundtrip` decodes/re-encodes it, `candidate` constructs/mutates an independent candidate and reports original-preserved evidence, `advance` makes a **synthetic metadata transition**, and `reject` exercises malformed cases. These are probe operations, not product moves or permission to implement incomplete rules.

Every invocation prints one JSON object with `ok`, an opaque `capsule` on success, and an `observed` evidence object. Faber compares source and decoded fields and reports mismatch counts; a hash alone is insufficient. Errors carry `ok:false` and a stable code. The Node runner parses this envelope, checks the assertions and forwards the returned capsule unchanged to the next process. It may create malformed copies for negative transport tests; it must not calculate a success capsule or next move.

### Required observations / done when

1. **Lossless full state:** seed a deterministic position and varied metadata, encode/decode all 512 cells and flags and every scalar; assert zero mismatches. Separately cover the actual 48-piece initial layout and a dense alternating signed-code sentinel arena to expose indexing/sign/truncation errors. Sentinel values remain representable and deliberately are not treated as legal matches.
2. **Independent mutation:** mutate candidate cells, moved flags and metadata after reconstruction. Show candidate changed at the intended sites and every original field stayed byte-for-byte/value-for-value unchanged. Also show rejected transition retains the original capsule.
3. **Across process boundaries:** Node invokes `seed → roundtrip → candidate → advance → roundtrip` as separate pinned CLI children and forwards each successful capsule verbatim. The synthetic advance changes side/revision and selected metadata in Faber; the next child must observe those exact values and unchanged remaining fields. It is not chess move execution.
4. **Rejected inputs:** include wrong version, missing/extra field, wrong array length, invalid piece/flag/scalar, inconsistent optional metadata, nonnumeric token and capsule exceeding the bound. Exercise noncanonical or truncated input; return rejection without success state. No unchecked conversion may abort these expected negative cases.
5. **Bounds and reproducibility:** record maximum measured capsule bytes, child exit codes, test case count, and the actual independent-child sequence. Place a short command/result receipt plus probe file SHA-256 hashes in `docs/evidence/m2-state-admission.md`; do not commit generated tools or source. Distinguish pass, named-mechanism failure, other diagnostics, and inconclusive tooling limits.

### Narrow commands and proof owner

The admission Hand owns these checks once; they are future commands, **not yet executed planning evidence**. Run serially from the repository root:

```sh
.tools/faber/1.12.0/bin/faber check --locale en .tools/probes/m2-state-admission
.tools/faber/1.12.0/bin/faber test --locale en .tools/probes/m2-state-admission --include state
node .tools/probes/m2-state-admission/run.mjs
```

The check must exit 0. The filtered tests must execute nonzero cases and cover decoding/independence, not merely module loading. The runner must exit 0 only after all required process and rejection assertions; its final summary records cases, maximum capsule bytes and the child sequence. Report diagnostics verbatim, including existing unrelated compiler warnings; never infer a pass from exit 0 with zero cases. Do not run the root Faber or Node suites for this isolated probe.

On a named mechanism failure, stop at A and report the smallest unsupported operation, command and diagnostic. Leave the viewer untouched. On unrelated errors record residuals without repairing other files. On an unavailable observable report `INCONCLUSIVE` and why. No fallback implementation or compiler upgrade is authorized. Mind admits the receipt and routes either downstream lowering or a bounded architecture revision.


## Accepted admission and production representation

STATE-ADMIT-01 passed in `docs/evidence/m2-state-admission.md` (commit `d1fc374`, accepted handle `5ee24a4d`): public `Match` class, explicit fresh tensor/list reconstruction, bounded decimal decoder, lossless four-field capsule and separate CLI calls. Reuse that mechanism; do not copy its synthetic transition or treat synthetic positions as legal. Explicit imported bindings use `match.Match`; text slicing uses `int` indices; JSON booleans require literal `true`/`false`, not localized interpolation.

Production capsule retains the admitted grammar and 16,384-byte limit:

```text
ZC1|512 canonical signed piece tokens|512 binary moved tokens|side,revision,c0,c1,c2,c3,epTarget,epCaptured,epAxis,result,lastFrom,lastTo,lastPromotion
```

Metadata meanings are now fixed:

| Index | Meaning and bounds |
| --- | --- |
| 0, 1 | side `1` white / `-1` black; revision `0…1000000`. Successful move or New game increments revision; reads/rejections do not. At ceiling reject mutation as `REVISION_EXHAUSTED`; never wrap/reset the counter. |
| 2…5 | Four irreversible binary castling rights, ordered white queenside A1S, white kingside H1S, black queenside A8Z, black kingside H8Z. All start 1. |
| 6…8 | Absent en passant: `-1,-1,-1`; present: skipped target ID, captured pawn's destination ID, axis `1` rank / `2` tier. Entitlement belongs to the current side, for the preceding enemy double only. |
| 9 | result `0` active, `1` white wins by checkmate, `2` black wins by checkmate, `3` stalemate. Side remains the side with no reply after a terminal move. |
| 10…12 | Last move `from,to,promotion`; absent `-1,-1,0`; otherwise distinct IDs and promotion `0` none or positive kind `2` Q / `3` R / `4` B / `5` N. New game clears it. |

Use `Match.board`, `Match.moved`, `Match.meta` from admission, with named accessor/helper functions to avoid scattered magic indices. Decode must be total and bounded; expose checked opening/operations at the CLI boundary, never unchecked decode to a host action. Structural validation covers canonical tokens, exact lengths/ranges and optional sentinels. Production state integrity also requires one king each, empty cells' moved flags zero, plausible castling entitlements (eligible unmoved king/rook on original cells), and en-passant target empty/captured cell the preceding enemy moved pawn with the recorded skipped-axis relationship. Test fixtures can construct focused legal positions in Faber; no public fixture-loading command exists for matches.

An independent candidate reconstructs all 512 cells/flags and metadata. A move transfers piece/moved state to destination, clears source flag, removes captures and captured flags, applies any rook movement/promotion, and checks mover king safety before committing. Moving a king clears both own rights; moving an eligible corner rook or capturing it clears its right permanently. Replacements/promoted rooks cannot regain rights. Every completed move expires old en passant, then a new pawn double may set a fresh entitlement; rejected actions never expire it. Candidate checking remains in **one CLI invocation**. Reply existence short-circuits on the first legal reply and includes special moves/promotions.

## Exact production CLI and HTTP contract

This contract is fixed for disjoint host/browser work now. It is not evidence that product exports already exist. Keep the old two-operand CLI deliberately: every existing fixture name and numeric selected operand retain their geometry semantics/envelope. Reserve first operand `match` (not a fixture), and use a second text operand with `~` separators; canonical capsules contain no `~`.

| Second operand when first is `match` | Behavior |
| --- | --- |
| `init` | Create the approved initial position at revision 0 and selected −1. Host invokes once at startup. |
| `read~selected~capsule` | Checked decode, read status and legal moves for selected −1…511; no mutation. Enemy/empty selections are echoed with no moves. |
| `move~revision~from~to~promotion~capsule` | Compare expected revision, enforce turn/full legality, apply atomically, return updated state selected −1. IDs 0…511; promotion `0,2,3,4,5`. |
| `new~revision~capsule` | Compare revision and replace with initial layout at old revision+1, cleared selection/last move/result/en passant, restored initial rights. |

Parse all text tokens with the admitted total bounded decoder. Unknown/extra/missing operands and invalid scalars reject. Never build shell commands or accept a client capsule. Faber prints exactly one JSON envelope, diagnostics on stderr.

Faber success (real arrays have 512 values; illustrative abbreviated arrays below are not valid responses):

```json
{"ok":true,"capsule":"ZC1|…","snapshot":{"schemaVersion":2,"mode":"match","revision":0,"sideToMove":1,"inCheck":false,"result":"active","selected":-1,"cells":[],"moved":[],"destinations":[],"moves":[],"lastMove":null}}
```

- `cells`, `moved` preserve existing piece codes, ID order and lengths. `result` is exactly `active|white-wins|black-wins|stalemate`; numeric capsule results map in the order above. `inCheck` means the current side's king is attacked, including terminal checkmate.
- `destinations`: sorted unique IDs for legal moves from selected; empty for −1, enemy, empty or terminal selection. `moves`: one entry per destination, same sorted order, exactly `{to,kind,promotions}`. `kind` is `move|capture|en-passant|castle`; `promotions` is empty except a promotable pawn move, when it is exactly `[2,3,4,5]`. Source is the echoed selected ID. Faber supplies descriptors; JS must not infer capture/promotion/castling geometry.
- `lastMove`: `null` or exactly `{from,to,promotion}` from persisted metadata; the readout need not reconstruct capture history. No phantom extra history fields are inferred from the board.
- Init/new/move return selected −1 and empty move lists; subsequent selection is a read. Read returns the incoming capsule unchanged. Mutation success changes revision exactly once and returns its complete canonical state; semantic failure has **no capsule or snapshot**.

Faber errors: `{"ok":false,"error":{"code":"ILLEGAL_MOVE","message":"Move is not legal"}}`. Codes/messages are fixed literals, never injected capsule text. Codes: `INVALID_REQUEST`, `INVALID_STATE`, `INVALID_SELECTION`, `STALE_REVISION`, `NOT_YOUR_TURN`, `ILLEGAL_MOVE`, `PROMOTION_REQUIRED`, `INVALID_PROMOTION`, `GAME_OVER`, `REVISION_EXHAUSTED`. Missing required promotion yields `PROMOTION_REQUIRED`, invalid/extraneous promotion yields `INVALID_PROMOTION`; neither partially commits. A legal destination descriptor gives the choices before submission. State corruption is `INVALID_STATE`, never a fresh game. Evaluate terminal-state mutation before piece intent; New game is allowed after a result unless revision is exhausted.

HTTP uses the existing origin and loopback listener, preserving `GET /api/snapshot` and static mappings. New endpoints:

| Request | Exact shape |
| --- | --- |
| `GET /api/match?selected=-1` | Require exactly one selected key in −1…511; fetch current shared match. No client capsule or revision needed for a fresh read. |
| `POST /api/match/move` | JSON object, exactly `session,revision,from,to,promotion`; string session, integer scalar bounds above. |
| `POST /api/match/new` | JSON object, exactly `session,revision`. No implicit restart on page refresh or mode switch. |

Host success strips the private capsule and returns exactly `{ok:true,session,snapshot}`. `session` is a new `randomUUID()` per server process, transport identity only. Host errors return `{ok:false,error:{code,message}}`. Stale session is `STALE_SESSION`; stale revision is `STALE_REVISION`, both HTTP 409. Valid Faber rejection mapping: `INVALID_REQUEST|INVALID_SELECTION`→400; `NOT_YOUR_TURN|ILLEGAL_MOVE|PROMOTION_REQUIRED|INVALID_PROMOTION`→422; `GAME_OVER|REVISION_EXHAUSTED`→409; `INVALID_STATE`→502. Preserve existing 502/504 subprocess/JSON failure codes; `BUSY`→503; body too large→413 `INVALID_REQUEST`; unsupported method→405. No error is an empty success snapshot.

Recheck session/revision when a queued mutation reaches execution, not only at HTTP intake. Host starts the match only after the existing compiler/version check; bad init means startup fails rather than false readiness. It stores only the latest validated capsule and its Faber-supplied revision, not a second piece array/rights table. Match work is FIFO with one active invocation and at most four accepted items including active; queued items expire at ten seconds with `BUSY`. Retain the existing global two-child ceiling: if no child slot is available at dispatch, reject with `BUSY` rather than spawn beyond it. Geometry work shares that ceiling and retains its existing disconnect cleanup. Cap mutation body at 1,024 UTF-8 bytes, require `application/json`, no unknown keys, and reuse local Host/Origin protections for all match routes. Per-child timeout 10 seconds, output 1 MiB, no shell; capsule limit 16,384 ASCII bytes.

Commit capsule/revision only after success envelope validation, expected selected/revision checks and complete child exit. Host validates envelope types, enums, lengths, ordering and descriptor consistency; it **does not decode capsule fields or calculate chess results**. Read success must return unchanged capsule/revision; move/new must return old revision+1. A disconnected caller cannot cancel a dispatched match action; finish and retain the result, then serve it on a fresh read. Server shutdown may kill children because its memory-only match ends. No automatic mutation retry. Stale actions trigger read refresh and require a new human action; UI generation guards discard stale reads after a newer mutation/mode change.

## Downstream executable units

All paths below are in this repository. Product Faber writers run serially under the source lease; git mutations use the shared lock. A Hand runs only its listed narrow sanity, once after its edits; every filter must execute nonzero cases. New commands are future checks, not planner-run evidence. No source stub may claim legal play; intermediate commits remain non-integrable until the final gate. No Hand changes another unit's scope to repair a dependency.

### MATCH-STATE-01 — production match data and codec

- **outcome:** Promote the admitted representation into checked product state, initial layout and independent copy helpers.
- **write_scope:** `src/match.fab`, `src/match.proba`.
- **depends_on:** accepted STATE-ADMIT-01 and this delivery contract review.
- **done_when:** Fix metadata meanings above; bounded canonical codec and structural/state-integrity checks; exact initial 48 positions, moved flags/rights, explicit copies, last-move/null and revision bounds. No synthetic probe transitions or unchecked external state construction. Public checked functions support later rule/protocol modules; unsupported nominal typing reports the exact seam.
- **sanity:** `.tools/faber/1.12.0/bin/faber test --locale en . --include match`.
- **non_goals:** Legal moves, CLI exports, host/UI changes.
- **risk:** medium, because metadata meaning is now stronger than the admitted structural probe.
- **integrable:** no.

### ATTACKS-01 — occupancy and geometric king threats

- **outcome:** Pure attacked-cell query independent from legal move generation.
- **write_scope:** `src/attacks.fab`, `src/attacks.proba`.
- **depends_on:** MATCH-STATE-01.
- **done_when:** Export `attacks.attacked(match.Match value, i32 cell, i32 bySide) → bool`. Include both-color pawn capture offsets even if empty, no pawn pushes, all knight/king attacks, axis/plane sliders through the first occupied endpoint; pinned enemies still attack. No mutation or recursive legality. Focused witnesses include friendly defended cells, blockers and cross-tier lines.
- **sanity:** `.tools/faber/1.12.0/bin/faber test --locale en . --include attacks`.
- **non_goals:** Move application, special rules, terminal status.
- **risk:** high: confusing previews with threats permits illegal king moves.
- **integrable:** no.

### ORDINARY-01 — legal candidates and atomic normal turns

- **outcome:** One rule authority for normal moves, captures, turn/moved/right updates and own-king safety.
- **write_scope:** `src/rules.fab`, `src/rules.proba`.
- **depends_on:** MATCH-STATE-01, ATTACKS-01.
- **done_when:** Use existing geometry as normal candidates, explicitly reject king capture and wrong side, independently copy before any effect and filter exposed checks/pins/adjacent kings. Update rights irreversibly including corner-rook capture; clear old en passant only on a committed move, create it on either-axis pawn double; update last move, flip side and increment revision once. Leave terminal adjudication and special execution unexposed until successors; do not silently allow an unpromoted boundary pawn. Provide shared candidate/safety path for specials, with tests proving rejection leaves every input field unchanged. Rule helpers are used within one invocation, not one CLI process per candidate.
- **sanity:** `.tools/faber/1.12.0/bin/faber test --locale en . --include rules`.
- **non_goals:** Special execution, final protocol exports or a claim of complete playable chess.
- **risk:** high: tensor aliasing or a partial commit corrupts later moves.
- **integrable:** no.

### EP-01 — same-axis en passant

- **outcome:** Add the approved ephemeral capture to the shared candidate/safety path.
- **write_scope:** `src/rules.fab`, `src/en-passant.proba`.
- **depends_on:** ORDINARY-01.
- **done_when:** Both colors and axes, exact skipped/captured cell, correct capture plane/file offset and recorded axis, no perpendicular interception. Remove the actual pawn before own-king safety; preserve source on failure. Exercise expiry after a different valid move, replacement by another double, no expiry on invalid/read, and a capture exposing a cross-tier check.
- **sanity:** `.tools/faber/1.12.0/bin/faber test --locale en . --include en-passant`.
- **non_goals:** Other specials, host/UI.
- **risk:** high: destination and captured cell differ.
- **integrable:** no.

### CASTLE-01 — file-axis castling

- **outcome:** Add both sides' two castle paths without weakening safety or entitlement.
- **write_scope:** `src/rules.fab`, `src/castle.proba`.
- **depends_on:** EP-01 (shared source serialization).
- **done_when:** E→G/H→F or E→C/A→D on original rank/tier only; full intervening clearance including queenside B, eligible unmoved original king/rook, intact right. Check king start/transit before final rook movement, then final candidate safety. Include upper/lower-tier attacks, moved-back king/rook, captured/replaced/promoted rook and path blockers; test both colors/sides.
- **sanity:** `.tools/faber/1.12.0/bin/faber test --locale en . --include castle`.
- **non_goals:** New 3D castle paths, promotion/results.
- **risk:** high: rook placement can mask transit check.
- **integrable:** no.

### PROMOTION-01 — boundary choice as one move

- **outcome:** Promote only at both opponent boundaries with explicit Q/R/B/N choice.
- **write_scope:** `src/rules.fab`, `src/promotion.proba`.
- **depends_on:** CASTLE-01 (shared source serialization).
- **done_when:** Both colors, quiet/capture promotions, either approach axis, all four kinds; one boundary alone does not promote. Missing/invalid/extraneous choice rejects without state/turn/revision change. Legal descriptors supply choices; simulation uses promoted candidate, never an intermediate committed pawn.
- **sanity:** `.tools/faber/1.12.0/bin/faber test --locale en . --include promotion`.
- **non_goals:** Browser chooser, draw rules.
- **risk:** high: partial turns and wrong-tier promotion.
- **integrable:** no.

### RESULTS-01 — complete legal replies and end state

- **outcome:** Determine check, checkmate and stalemate from the complete legal move set.
- **write_scope:** `src/rules.fab`, `src/results.proba`.
- **depends_on:** PROMOTION-01.
- **done_when:** Read legal destinations/descriptors through one source of truth; after each completed move inspect next side's check and short-circuit legal-reply search including en passant, castling and each promotion. Encode exact result semantics; terminal moves reject, reads remain possible. Use legal two-king fixtures for active check, mate, stalemate and special escapes; no repetition/material/move-count inference.
- **sanity:** `.tools/faber/1.12.0/bin/faber test --locale en . --include results`.
- **non_goals:** Search/evaluation AI, other draws, protocol/UI.
- **risk:** high: incomplete reply search can falsely end a game.
- **integrable:** no.

### MATCH-CLI-01 — checked match exports and geometry compatibility

- **outcome:** Expose the exact CLI envelopes above from complete Faber rules.
- **write_scope:** `src/main.fab`, `src/protocol.fab`, `src/protocol.proba`, ignored `.tools/probes/m2-cli-witness.mjs`.
- **depends_on:** RESULTS-01.
- **done_when:** Preserve existing two-operand geometry path; dispatch reserved match operation, safely validate input/capsule and emit canonical JSON with all exact read-model/error fields. Init/read/move/new revision/selection semantics, no partial envelopes or localized booleans, correct promotion/status descriptors and unchanged read capsule. Include a deterministic real-CLI chain and legacy fixture query in the receipt.
- **sanity:** `.tools/faber/1.12.0/bin/faber test --locale en . --include protocol`, then `node .tools/probes/m2-cli-witness.mjs`. The ignored runner uses shell-free pinned children for init→read(selected 72)→move(72→80, promotion 0, expected revision 0)→read(selected −1)→new(expected revision 1), plus `initial -1` legacy snapshot. Assert revisions 0→1→2, Faber-produced state forwarded verbatim, exact schema and unchanged read capsule. Record children/cases; no HTTP tests yet.
- **non_goals:** Host persistence/UI, new test fixture endpoint.
- **risk:** medium: schema/sentinel errors cross process boundaries.
- **integrable:** no.

### HOST-MATCH-01 — serialized opaque local state transport

- **outcome:** Implement the HTTP/state lifecycle contract while chess remains in Faber.
- **write_scope:** `scripts/serve.mjs`, `scripts/serve.test.mjs`.
- **depends_on:** this exact contract review; may run alongside Faber units using injected child responses. Its real-CLI gate waits for MATCH-CLI-01.
- **done_when:** Startup init; exact routes/body/session validation, bounded queue/global child count, expected revision, private capsule retention/stripping, full read-model validation, origin protections, unchanged geometry/static service. Preserve successful dispatched mutation across client disconnect; never commit failures, parse capsule fields or auto-retry mutations. Tests include stale session/revision, two competing actions, New game revision, malformed JSON/envelope/capsule, startup failure, timeout, queue/size bounds, shutdown and failure-then-recovery. Unit mocks are declared mocks, not real compiler proof.
- **sanity:** `node --test --test-name-pattern="^match:" scripts/serve.test.mjs`. Name all new match tests with that prefix, use injected child/version-check responses and isolated ephemeral ports, execute nonzero cases and no Faber children while Faber writers run. Existing real geometry tests wait for integration. Stop owned servers/children; do not restart the operator viewer.
- **non_goals:** Rules calculation, browser code, persistence files, dependency changes.
- **risk:** high: races or disconnect cancellation can lose committed user actions.
- **integrable:** no.

### BROWSER-MATCH-01 — shared-screen game flow

- **outcome:** Complete intent/pending/read-model UI against the fixed match contract.
- **write_scope:** `web/controller.mjs`, `web/controller.test.mjs`, `web/main.mjs`, `web/index.html`, `web/style.css`.
- **depends_on:** this exact contract review; can use explicit contract fixtures before host/CLI completion. Runtime acceptance waits for both.
- **done_when:** Default Play mode reads shared match; separate Geometry sandbox preserves existing fixtures. Pick own piece, then supplied destination; enemy/empty inspection may show no moves. Promotion choices come from descriptor and are submitted atomically, with cancel preserving game. Display side, check/result, last move, short errors and deferred-draw limit; terminal position has no moves but permits New game. Explicit New game control; refresh reads existing match, mode switch never resets it. No optimistic cells/turn; disable duplicate mutation while pending, discard old reads and recover from stale actions by a fresh read without replay. Switching slices/view/sprites/text preserves camera/presentation and never submits a match mutation. Pass the common cells/selected/destinations fields to existing renderers; distinguish match and fixture identity in controller/status, never fabricate a fixture name as match identity. Pure controller contract tests cover all transitions.
- **sanity:** `node --test web/controller.test.mjs web/space.test.mjs web/slices.test.mjs`.
- **non_goals:** Renderer redesign, PNG changes, browser rules, undo/history/save, agent API.
- **risk:** medium: stale read responses can replace a completed move.
- **integrable:** no.

### RULES-DOCS-01 — local playable instructions

- **outcome:** Document the actual legal local game and its explicit limits.
- **write_scope:** `README.md`, `docs/rules.md`.
- **depends_on:** MATCH-CLI-01, HOST-MATCH-01, BROWSER-MATCH-01.
- **done_when:** Explain start/play/New game, geometry sandbox, memory loss on server stop, shared tabs, coordinates and approved piece/special/end rules. State other draws/AI/online absent, retain sprite provenance/license caveats and pinned toolchain/formatter evidence. No speculative hosting or false public-release claim.
- **sanity:** `git diff --check`; reconcile prose with implemented controls/protocol and receipts.
- **non_goals:** CI, publishing, license/provenance invention.
- **risk:** low.
- **integrable:** no until integration gate.

## Gate-owned integration and witness

**INTEGRATION-02** owns `docs/evidence/m2-validation.md`, depends on all product units above, runs from a clean tracked tree and records the actual tip/current sources. This gate, not Hands, runs the package-wide commands once:

```sh
.tools/faber/1.12.0/bin/faber check --locale en .
.tools/faber/1.12.0/bin/faber test --locale en .
node --test scripts/serve.test.mjs web/controller.test.mjs web/space.test.mjs web/slices.test.mjs
```

Run `.tools/faber/1.12.0/bin/faber format --check src` (never repository root, which traverses ignored tools), recording the existing isolated SEM010 limitation separately rather than upgrading. Record measured valid-action latency against the existing ten-second budget, test totals and warnings; no empty filtered test proof. Exercise the **real** startup→HTTP init/read→white move→black move/capture→stale rejection→read→New game chain on an owned ephemeral loopback server, plus geometry query and current PNG serving. Also prove one malformed/timeout injected failure retains the prior capsule and can recover; label injection. Use no production fixture-loading endpoint. The CLI/HTTP sequences can use a documented deterministic legal opening; calculate legal intent from Faber descriptors and record exact IDs/revisions, never generate moves in JS. Stop only gate-owned processes. A failing boundary routes a scoped repair and recheck, not a re-run of unrelated suites.

**VIEW-02** owns `docs/evidence/m2-playable-browser.md`, depends on a passing integration receipt and owns the single real-browser witness. Start/open current local build; record URL, process, browser, commit and observed action sequence. Verify two-color play/capture and rejection, view/slice/piece-style/camera preservation, promotion picker cancel/choice, check/result display, Geometry mode separation, refresh and deliberate New game. Rare end-state/promotion browser witnesses may use **test-only view harness fixtures** matching Faber-produced read models, explicitly labeled UI fixtures; they do not prove a real match reached those states. Prefer actual interaction where practical; unavailable controls/interception remain unverified. Leave a live playable URL for operator review. No backend fixtures/rules may be changed to manufacture a browser pass.

Aggregate audit after integrated product/docs and bounded browser evidence reviews the full milestone range. Admission receipts and unit sanity are interfaces, not invitations for every reviewer to rerun suites. Mind accepts/repairs named findings, then marks the milestone viewable; no push, deploy or milestone 3 work.

## Next frontier and handoff

After this contract's delivery review, start MATCH-STATE-01 plus HOST-MATCH-01 and BROWSER-MATCH-01 on disjoint paths. Faber continues serially through ATTACKS→ORDINARY→EP→CASTLE→PROMOTION→RESULTS→CLI. Host/browser use contract mocks while Faber is incomplete; real integration and public-facing readiness wait for the complete chain. No new product decision remains; unsupported mechanisms or a necessary contract change return to Mind before dependent rewrites.

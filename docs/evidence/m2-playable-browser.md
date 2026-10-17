# Milestone 2 playable browser witness

Observed 2026-10-17 UTC on source **c0e98b25487a473fc0a376fba35c23fba98de5f7**, branch `codex/faber-rebuild`, clean tracked tree. Assignment `514d581d`, VIEW-02. Browser: Chrome extension session, existing tab **283239013**, `http://127.0.0.1:8787/`; current Chrome version was not independently queried. Actual pixels and accessibility state were inspected through CUA, using native canvas clicks/keyboard input and select controls.

## Current live viewer

The old preview PTY `79786` was unavailable (`Unknown process id`). `lsof -nP -iTCP:8787 -sTCP:LISTEN` showed no listener, and no process was killed. Started **`npm run dev`** with authorized sandbox escalation; output was **`Ready: http://127.0.0.1:8787`**. Current long-lived PTY: **96710**. Reloaded the existing Chrome tab to load current source. The server and tab are intentionally left available to the operator, in **Play / 3D space / Sprites**, after a deliberate New game and Clear selection.

Default Play, Sprites, White to move and No moves yet were visible. Both colors' existing PNGs rendered. Local shared-screen, memory-only lifecycle and deferred draw rules appeared above the controls.

## Real browser play on the product server

Every destination below was first observed in the UI's Faber-supplied target list/highlight. No JavaScript move generation or programmatic move submission was used.

| Step | Actual interaction | Observed result |
| --- | --- | --- |
| White | Select A1S / ID 0 in a file-rank slice; switch to 3D; click the far highlighted target | **A1S → A8S (0→56)**. White rook changes position; **Black to move**, selection cleared. Applying-action state disables Mode, New game and Clear selection. |
| Black | Select pawn A8Y / 440 in tier Y; switch to file-tier slice at rank 8 | Supplied targets **A8W (312), A8X (376)**. Click A8W: **440→312**, Black pawn visibly moves; **White to move**. |
| Off target | Select white rook A8S / 56, then click empty B8V / 249 outside its target set | Inspection becomes ID 249 with zero targets. Rook and pawn remain in place; **White to move** and last move **A8Y → A8W** remain unchanged. This is UI non-submission, not a direct HTTP illegal-move rejection test. |
| White capture | Reselect rook 56; target list includes 312; click the black pawn there | **A8S → A8W (56→312)**; white rook replaces black pawn; **Black to move**. |
| Black capture | Select A8Z / 504; target list includes 312; click white rook there | **A8Z → A8W (504→312)**; black rook replaces white rook; **White to move**. |
| Refresh | Reload page | Same played board, White to move and **A8Z → A8W** last move return. Presentation defaults reset on reload; the match does not. |
| Geometry | Switch to Geometry sandbox, choose queen-center, inspect isolated queen; return to Play | Geometry has fixture controls and no match status/New game. Returning restores the played board and **A8Z → A8W**, without restarting the match. |
| New game | Deliberately click New game | Initial board returns, **White to move**, **No moves yet**. This is distinct from refresh/mode switching. |

After New game, selected rook **A1S / 0**, with the same seven destinations **8,16,24,32,40,48,56**. Switched through file-rank, file-tier and rank-tier planes, changed Sprites→Text→Sprites, and inspected both PNGs and text. Selected ID/list, side and last move stayed fixed; visible target counts correctly changed with the plane. Returned to 3D, focused the canvas, pressed Right to rotate, then switched Text and Sprites: rotated axes/piece positions, selected rook and seven green targets stayed fixed. Cleared selection for the final operator view.

## Explicit test-only promotion and result UI fixtures

Rare states below were **not reached by playing the product match**. An isolated loopback harness at `http://127.0.0.1:8788/` displayed a prominent **TEST-ONLY UI FIXTURE** banner and served the unchanged product UI modules/assets. It retained its own opaque capsule, entirely separate from port 8787. Its Node code only forwards intent and capsule to the pinned Faber CLI; it computes no moves, promotion or result.

Ignored harness files: `.tools/probes/m2-view-fixtures/`, `m2-view-generate.mjs`, `m2-view-fixtures.json`, and `m2-view-server.mjs`. The probe copied current `.fab` modules and replaced only its own `main.fab` with focused positions from `src/promotion.proba` and `src/results.proba`. It calls public `protocol.dispatch("match", "read~-1~" + game.encode(value))`; Faber produces the full checked envelopes. An initial probe attempt called private `protocol.success` and failed **SEM006.import_module_private**. Only the ignored probe was corrected to use the public dispatcher.

`node .tools/probes/m2-view-generate.mjs` ran serially under `.tools/faber-source-lock`, exited 0 and generated **five** Faber fixture envelopes:

```text
promotion active false
check active true
mate white-wins true
black-mate black-wins true
stalemate stalemate false
```

`node .tools/probes/m2-view-server.mjs` started the separate loopback harness (PTY **81449**). Browser tab **283239020** performed these actual UI checks:

- Promotion: selected white pawn **496 / A7Z**; supplied target **504 / A8Z** opened **Queen, Rook, Bishop, Knight, Cancel** controls. Cancel dismissed the chooser and preserved the pawn at 496, selected ID, target and White turn. Reopened and clicked Knight: Faber committed the move, PNG changed to a white knight at 504, **Black to move**, **A7Z → A8Z = Knight**, selection cleared.
- Active-check fixture visibly displayed **Black to move · Check**.
- White mate fixture displayed **White wins by checkmate**; black mate displayed **Black wins by checkmate**.
- Stalemate fixture displayed **Draw by stalemate**. Terminal screens had zero displayed destinations and enabled New game. Clicking New game on stalemate returned **White to move** and the initial board. Terminal piece-selection rejection was not separately exercised in the browser.

The fixture tab was closed. Ctrl-C stopped only harness PTY 81449; no fixture listener is intentionally retained. Product preview PTY 96710 remains running.

Harness SHA-256:

```text
1440bac02382d3565a31fe54a1f66c1b87e85105ed26899d4866c656fdcd7073  m2-view-fixtures/src/main.fab
0918ba4951231fc853599c66831108913d38fc3cb070a581100ea6acc9609f3d  m2-view-fixtures.json
15faecf66605a452bd12aadfbe21b7c77ce0fd8072e16cbc0e242fbf9c6a143f  m2-view-generate.mjs
f00338233303847e683793fb824c525054fc771fa758e3016697c99b6989ab0b  m2-view-server.mjs
```

## Evidence and limits

Screenshots inspected throughout; saved local JPEGs:

- `/private/tmp/zchess-m2-playable.jpg` — final real product preview.
- `/private/tmp/zchess-m2-promotion.jpg` — isolated promoted-knight UI.
- `/private/tmp/zchess-m2-stalemate.jpg` — explicitly labeled isolated terminal UI.

Final captured Chrome console warning/error queries returned **`[]`** for both product and fixture tabs. No network interception/request-count proof is claimed. UI reads briefly show pending/Match unavailable, then resolve to the actual match; no persistent load error was seen. Presentation preservation is based on visible board/readouts, not private camera-object inspection. Browser version, direct stale/error UI recovery, all four executed promotion choices and every terminal selection path were not exhaustively tested. Promotion cancel/one explicit choice and all status strings were witnessed as specified above.

No full suite or broad Faber rerun. Integrated **88 Faber / 51 Node** cases and real HTTP chain remain the accepted interface in `m2-validation.md`; the scoped formatting follow-up is `m2-format-followup.md`. This witness adds actual canvas play and UI fixtures rather than redoing those gates. Only this evidence document is tracked; no product, dependency, asset, backend fixture endpoint or remote changes.

Verdict: **bounded VIEW-02 browser witness passed**, with explicit separation between real shared-match play and isolated rare-state UI fixtures, and the narrow unverified items above.

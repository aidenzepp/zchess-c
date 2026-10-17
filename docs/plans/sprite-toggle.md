# Existing PNG sprites with a text toggle

Status: Implemented and verified; ready for operator comparison. Browser proof and tooling limits are recorded in `docs/evidence/sprite-toggle.md`.
Planner assignment: `bc60eaf9`; base `65edc2c`, branch `codex/faber-rebuild`.
Repository: `/Users/sterling/Documents/dev/workspaces/personal/zchess`.

## Goal and boundaries

Use the existing piece PNGs by default in both 3D and 2D, retaining the current text presentation as an explicit option. The user authorized this presentation change; no further problem lock is needed. Changing style must preserve fixture, selected cell, destinations, slice, camera and current snapshot without a Faber request. This is local preview use only; existing asset exclusions in `LICENSE` remain unchanged.

No rules, Faber, snapshot/API schema, dependency, asset-byte, license, launch or layout redesign changes. Image failures are visible, with Text available as an explicit recovery choice; never silently change modes or claim missing images loaded.

## Inspected baseline

- `web/controller.mjs`: presentation is `{view, plane, fixedIndex}`; `setPresentation` publishes without transport and preserves the snapshot object.
- `web/main.mjs`: `update` sends the same `(snapshot,presentation)` to both existing view instances. `web/index.html` owns the toolbar and text legend.
- `web/space.mjs`: `render(next,_presentation)` currently ignores presentation; generated canvas labels become camera-facing three.js Sprites. Every redraw replaces piece materials/textures through `cleanObject`; `dispose` owns remaining resources. OrbitControls/camera are created once per view.
- `web/slices.mjs`: `render` retains only plane/fixedIndex; `draw` renders current circle/letter pieces, then selection outlines, and already redraws on resize.
- `scripts/serve.mjs`: decoded path/traversal checks, realpath containment and MIME mapping exist; `.png` MIME exists, but only `web/` and local three.js roots are exposed. Existing `assets/` is not served.
- Existing tests cover static-route containment, presentation identity preservation, slice projection/picking, and 3D identity/input helpers. All twelve PNGs report 60×60 RGBA via read-only file inspection; actual transparency/readability remains a browser observation.

## Asset inventory

Read-only inventory command, executed at this base:

```sh
git ls-files 'assets/*.png'
```

Complete output:

```text
assets/black_bishop.png
assets/black_king.png
assets/black_knight.png
assets/black_pawn.png
assets/black_queen.png
assets/black_rook.png
assets/white_bishop.png
assets/white_king.png
assets/white_knight.png
assets/white_pawn.png
assets/white_queen.png
assets/white_rook.png
```

These assets are read-only inputs. HTTP permits exactly these twelve `/assets/<filename>.png` paths; no directory/prefix wildcard or arbitrary repo path is admitted.

## Presentation contract

- Extend shared presentation with `pieceStyle: 'sprites' | 'text'`, default `'sprites'`. Validate it in `setPresentation`; invalid style is rejected before publish. Existing render API stays `render(snapshot,presentation)`.
- Add labeled toolbar select `id="piece-style"`, options Sprites/Text, and wire it only to `setPresentation({pieceStyle})`. Synchronize its displayed value in `update`; adjust the text-only legend/help to explain both modes.
- Add one small pure `web/piece-images.mjs` mapping: `pieceImageUrl(code)` returns `/assets/{white|black}_{piece}.png`, null for 0, rejects invalid codes; `PIECE_IMAGE_URLS` is the complete frozen twelve-URL allowlist used by the server. Signed snapshot codes retain the existing K/Q/R/B/N/P mapping. This is display mapping, not game logic.
- Server recognizes an exact allowlist member before selecting the existing `assets/` root; retain decoded-path validation and realpath containment, and return `image/png`. Unknown asset names and nonmembers remain denied; existing web/vendor behavior remains intact.
- 3D sprite mode uses transparent camera-facing PNG SpriteMaterials at a readable square scale, with existing cellId/world positions/picking and highlights. Text mode retains existing labels. Store/forward the latest presentation even before async three.js initialization completes. Style redraw must not reset/create a camera or recreate the view.
- Cache each loaded PNG texture per 3D view; transient piece-material cleanup must not dispose cached maps. Dispose cached textures once at view disposal; retain existing ownership of canvas-label textures and other resources. Load completion must not rebuild a stale snapshot/style or act after disposal.
- 2D caches image objects per view and uses `drawImage` centered/aspect-preserved inside the existing cell. Preserve targets beneath and selection outlines above pieces; text mode retains existing circles/letters. Load completion redraws the current snapshot/presentation only; dispose clears listeners/callback ownership.
- Pending image loads and specific failed URLs appear in the view status/alert without overwriting the coordinate/selection readout. No console-only error or silent text substitution; switching to Text remains usable. Repeated style/view changes reuse loaded resources.

## Unit SPRITES-01 — display existing pieces in either style

- **outcome:** One shared sprites/text preference drives both renderers, PNG default, with bounded local asset serving and visible load failures.
- **write_scope:** `web/piece-images.mjs`, `web/controller.mjs`, `web/main.mjs`, `web/index.html`, `web/space.mjs`, `web/slices.mjs`, `scripts/serve.mjs`; existing tests `web/controller.test.mjs`, `web/space.test.mjs`, `web/slices.test.mjs`, `scripts/serve.test.mjs`. No other files, assets, dependencies or Faber sources.
- **depends_on:** audited M1 viewer at `65edc2c`; no other unit.
- **done_when:** Presentation contract above holds in both styles/views, all twelve paths map to the existing bytes/MIME, denied routes remain denied, cache ownership is correct, and switching style preserves snapshot/request identity and camera.
- **sanity:** Reuse the existing narrow checks: `node --test web/controller.test.mjs web/space.test.mjs web/slices.test.mjs`; extend only mapping/style cases and the existing presentation-preservation test to assert default/valid/invalid style, zero additional transport, same snapshot/identity/targets. Extend existing static-route test for all twelve PNG bytes/MIME plus unknown PNG/traversal denial; run only that case with `node --test --test-name-pattern='only contained browser files' scripts/serve.test.mjs`. Report nonzero executed cases. These are future unexecuted checks; Planner runs no product commands.
- **non_goals:** Rule/state/schema changes, broad test expansion, asset modification/conversion, license claims, new dependencies, renderer architecture or UI redesign, public hosting.
- **risk:** low for state; medium at asynchronous texture/cache ownership. Existing redraw cleanup currently disposes maps, so explicitly distinguish shared cached PNG ownership from per-object materials.
- **integrable:** yes after its narrow checks and the bounded browser witness below; no remote mutation authorized.

## Bounded viewer witness and goal check

Use the existing local viewer in a real browser after implementation. Confirm PNG default, then Sprites/Text in 3D and 2D (all three slice planes); inspect both colors and all six piece shapes, billboard transparency/orientation, readable highlights and picking. Select a piece with targets, change style repeatedly and switch views; fixture/selection/targets remain identical and 3D camera remains at its prior pose. Confirm no additional snapshot request is caused by style changes. Block one image request, then reload to bypass the populated per-view cache; observe the visible URL/error and switch to Text. Remove the block/reload and confirm recovery. Stop only processes started for this witness. No exhaustive automation or Faber/rules rerun is needed.

Goal-check verdict: **READY** for one logical presentation change. Exact existing consumers, static-route seam, source scopes and preservation invariant are grounded. The implementation receipt must report commit, narrow check results and real-browser observations; browser failure/unavailability stays explicit. No Hand task is created by Planner.

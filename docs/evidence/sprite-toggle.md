# Sprite toggle browser witness

Date: 2026-10-17. Assignment: `bcadb606` / SPRITES-VIEW.
Source: `31f637db664ea904b0594e5924c51ede9993b1f8`, clean checkout at witness start.
Browser: existing Chrome tab `283239013`, controlled through CUA; URL
`http://127.0.0.1:8787/`. Browser version was not independently re-read.

## Preview restart

- `write_stdin` Ctrl-C for the supplied old PTY `89364` returned `Unknown process id`; no foreign process was stopped.
- `lsof -nP -iTCP:8787 -sTCP:LISTEN` printed no listener. A supplemental `ps` inspection was denied by the sandbox.
- First `npm run dev` returned `listen EPERM ... 127.0.0.1:8787`.
- Retried the same authorized loopback command with sandbox escalation; it printed `Ready: http://127.0.0.1:8787`.
- New long-lived PTY: **79786**, intentionally left running for the operator. The existing browser tab was reloaded to load the new server route and UI.

## Observed browser checks

1. Reload defaults to **Pieces: Sprites**. The initial 3D scene visibly renders PNG pieces of both colors. Camera-facing square sprites remain upright after keyboard camera rotation; silhouettes are transparent around the existing circular background treatment. Dense initial rows overlap at the default angle, but individual shapes are discernible, and the isolated queen is readable.
2. Changed fixture to `queen-center`, clicked the rendered queen. Readout became **D4V · ID 219**, **60** destinations, with visible gold selection and green target markers. The complete 60-cell destination list remained unchanged in subsequent presentation checks.
3. Focused the 3D canvas and pressed Right to rotate. Switched Text → Sprites → Text → Sprites. The image/letter visibly changed, while the selected cell, target list and rotated axis/target geometry stayed fixed.
4. Opened 2D slice. Selected fixed index 3 and inspected actual pixels in **File / rank · fixed tier V**, **File / tier · fixed rank 4**, and **Rank / tier · fixed file D**. Each showed the queen PNG in Sprites and the Q label in Text, the orange selection outline, and green destination cells. Each reported **27 visible targets of 60** and retained selection 219.
5. Returned to 3D Sprites: the rotated camera arrangement, selected queen and highlights matched the pre-slice scene.
6. Restored `initial`. In file/rank slices, tier S visibly showed white rook, knight, bishop, queen and king; tier Z showed their black equivalents. Tier T showed white pawns and tier Y black pawns. This independently exposed all **12 color/shape combinations** at readable scale.
7. Returned to initial 3D Sprites and left it available to the operator. Final console warning/error query `tab.dev.logs({levels:["error","warn"],limit:50})` returned `[]`; an earlier query was also empty. No visible load failure/pending status remained.

Browser APIs used: `tab.reload`, native screenshot-coordinate picking and canvas keyboard input, `tab.playwright.locator(...).selectOption`, `tab.getAXState`, `tab.getScreenshot`, and `tab.dev.logs`. Screenshots were inspected at the relevant transitions. Final saved screenshot:
`/private/tmp/zchess-sprite-toggle-initial.jpg`.

## Limits

- This Chrome binding advertises only the `pageAssets` tab capability and has no documented request interception/blocking API. The conditional asset-failure / explicit Text recovery / unblock-reload experiment was **not performed**; assets and product files were not changed to simulate it.
- Direct network request counting was **not verified**. The read-only browser evaluation environment does not expose `performance.getEntriesByType` (attempt returned an undefined-property error). Selection, targets, fixture and camera preservation are observed; zero extra Faber requests remains supported by the predecessor's scoped controller checks rather than a fresh network witness.
- Console log inspection found no captured errors or warnings; this is not a complete network trace.
- No full suite or Faber toolchain rerun. The accepted predecessor receipt reports 24 renderer/controller cases plus one static-route case; this witness does not claim to have rerun them.

Verdict: **browser presentation checks passed, with the two explicit tooling limits above**. No product edits, new dependencies, asset edits, public hosting or remote mutations.

# M1 real-browser witness

Verdict: **viewable with explicit witness limits**. A useful local viewer is running; observed fixture/selection/target rendering works. This is technical viewability evidence, not settlement of provisional rules or exhaustive browser acceptance.

Task `cc3310e0`, 2026-10-17 UTC. Browser: installed Google Chrome **155.0.8059.84**, real Chrome extension tab `283239013`, screenshots inspected through CUA. Initial source: `e1c020343c5bc15a53dbf2a6491aa57218dd71a8`; final source after separately owned slice-label repair: `fa2239a285171597532b28d3d387f3828e06f866`. Reloaded after that repair. Faber reports **1.12.0**; there is no generated browser build. No product edits or broad suites were performed by this witness.

## Launch and final live preview

- Followed README launch boundary: pinned compiler version check, dependencies already installed by integration task, then `npm run dev` in a long-lived PTY with loopback escalation.
- Actual ready URL: **http://127.0.0.1:8787**. Binds `127.0.0.1` only.
- First preview PTY session `94814` was stopped with Ctrl-C for failure/restart observation; it exited. Final preview PTY session **`89364` remains running** and printed `Ready: http://127.0.0.1:8787`. Its tool session output is the launch log; no separate file log was created.
- A simultaneous second `npm run dev` exited 1 with `Server failed: listen EADDRINUSE: address already in use 127.0.0.1:8787`; final owned server was not disturbed.
- Final browser reload returned the current initial scene. Tab marked as a deliverable. Temporary viewport override reset. No temporary listener remains.

## Observed pixels and behavior

| Area | Observation |
| --- | --- |
| Initial setup | Real API reports 48 occupied cells. 3D displays white/black piece billboards, sparse dots and labeled X file/Y tier/Z rank axes. Slice pixels show white R/N/B/Q/K/B/N/R on S, white pawns on T ranks 1/2, black pawns on Y ranks 7/8, and black back row on Z. Clicking identified A1S ID0, E1S ID4, A8Z ID504 and E8Z ID508. |
| 3D picking | Clicking visible center rook billboard selects D4V ID219 and 21 targets; clicking an empty dot selected F5W ID293 and zero targets. A pointer drag visibly orbits and keeps ID219/21 unchanged rather than selecting. |
| Camera | Focused canvas Right, W, +, − and R were exercised; pixels change camera while selection/targets remain unchanged. Wheel zoom visibly enlarges the scene. Toolbar reset restores the starting camera. |
| Loading/errors | Fixture loading visibly clears the preceding snapshot/highlights. After stopping the owned server, a fixture request displays `Snapshot failed: Failed to fetch`, `Selected Unavailable`, count `—` and an empty arena/`No current snapshot`. Restart/reload recovers. |
| Fixture reset/races | Fixture changes clear selection. Rapid bishop → queen → rook changes finish on rook. Selecting empty D1S ID3 then shows zero destinations and no old green highlights. This observes a rapid sequence, not a deliberately delayed-response network experiment. |
| Slices | One rook ID219/21 preview carried through file/rank, file/tier and rank/tier planes at fixed indices 0, 7 and 3. Every extreme reports off-slice selection with 1 visible target; every center plane shows the rook, gold selection and 14 green targets. Global identity/count/target list remains unchanged. |
| Resize | At 900×800 pixels the slice and controls reflow; the selected rook and 14 visible targets remain coherent. Override then reset to normal browser size. |
| Copy/console | Visible geometry-only, provisional setup/bishop, excluded combined pawn movement and missing legality/special-move text is present. Captured Chrome warning/error log reads returned empty arrays during normal scene and final reload. |

## Actual API comparison

Used Node fetch against the live `/api/snapshot?fixture=...&selected=...` endpoint, which invokes current pinned Faber; no host movement algorithm was constructed. Compared the displayed complete target-ID lists to those responses:

| Fixture | Selected | API and browser destination count |
| --- | --- | --- |
| rook-center | 219 | 21 |
| bishop-center | 219 | 39 |
| queen-center | 219 | 60 |
| knight-center | 219 | 24 |
| king-center | 219 | 26 |
| pawn-white | 219 | 6 |
| pawn-black | 292 | 6 |
| pawn-moved | 219 | 4 |
| blockers | 219 | 9 |

Black pawn ID292 exact targets are `[164,228,229,276,283,284]`; white pawn ID219 `[226,227,235,283,284,347]`; moved pawn `[226,227,283,284]`; blockers `[91,155,203,211,217,218,220,227,283]`. All centered fixture scenes were selected using actual canvas picking, with readouts inspected. Initial API occupied inventory agrees with the rows witnessed in slices.

Live malformed/semantic requests returned HTTP400 with explicit error envelopes: unknown fixture → `UNKNOWN_FIXTURE`/`Unknown fixture`; missing selected and nondecimal selected → `INVALID_REQUEST`/`Expected one fixture and selected value`. These API checks are not claimed as browser UI error injection.

## Repair and limits

The first slice observation showed toolbar `0 · S` while canvas status said `tier 1`, and tier axes used numbers. Routed to Mind; separate task `2a7bb27c` committed repair `fa2239a`. After browser reload, witnessed `tier S`, `tier T`, `tier Y`, `tier Z` and rank/tier canvas labels S–Z. No remaining tier-label defect observed.

Directly unexercised browser gestures: right-drag/Shift-drag pointer pan, every individual keyboard direction, and freeform typing while a form has focus. Keyboard W pan and the specific keys above were observed, but these are not substitutes for those omitted gestures. No forced failed-Faber child was injected into the production viewer; the stopped-server browser failure is observed, and actual child-failure transport coverage belongs to the earlier host integration receipt. No deliberately delayed network responses were injected. These limits keep this a bounded real-viewer witness, not exhaustive acceptance. Existing pinned formatter refusal is separately documented in `m1-format-followup.md` and not rechecked here.

Canonical `.tools/faber-source-lock` held for stable-source witness requests, after FORMAT reported and released it. Mind reserved final stable product source in mail `c7a753be`. Source lease released on completion; final loopback preview intentionally continues. Evidence committed under `.tools/git-write-lock`.

## Screenshots

- Final initial 3D scene: `/private/tmp/zchess-final-viewer.jpg`.
- Corrected rank/tier slice, selected rook and ID readout: `/private/tmp/zchess-final-slice.jpg`.
- Intentional stopped-server error: `/private/tmp/zchess-fetch-failure.jpg`.
- Earlier pre-repair rook slice: `/private/tmp/zchess-rook-slice.jpg` (historical defect context; not final label proof).

Screenshots are local temporary evidence, not published assets. No push, deployment, public listener, or remote mutation.

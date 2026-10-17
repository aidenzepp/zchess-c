# Current experimental rules

These are the implemented milestone 2 rules, retained for iteration. They extrapolate the existing chess pieces into an 8×8×8 arena; no additional piece types are introduced. Runtime and browser acceptance are recorded separately in the milestone evidence.

## Coordinates and setup

Files are A–H, ranks 1–8 and tiers S–Z. A cell such as E1S names one file, rank and tier. Internal indices are zero-based, with cell ID `file + 8*rank + 64*tier`. The current renderer maps files to X, tiers to Y and ranks to Z; that display convention does not change rule coordinates.

There are 48 pieces: each side has eight back-row pieces and sixteen pawns. Back rows are rook, knight, bishop, queen, king, bishop, knight, rook from A to H.

| Side | Back row | Pawn rows | Forward directions |
| --- | --- | --- | --- |
| White | A1S–H1S | A1T–H1T and A2T–H2T | Increasing rank or tier |
| Black | A8Z–H8Z | A7Y–H7Y and A8Y–H8Y | Decreasing rank or tier |

White moves first; players alternate one legal move. Occupied friendly cells cannot be destinations. Captures remove the enemy piece. Kings are never captured: a move may not leave its own king attacked.

## Piece movement

| Piece | Movement |
| --- | --- |
| Rook | Any distance along exactly one coordinate axis: six directions. |
| Bishop | Any distance along a plane diagonal: exactly two coordinates change equally while the third stays fixed. Twelve directions; no three-axis body diagonal. |
| Queen | Rook and bishop movement combined. |
| Knight | Two cells along one axis and one along another, with the third unchanged; either sign and any axis pairing. It jumps over intervening pieces. |
| King | One cell in any direction, including a three-axis diagonal, provided the destination is safe. |
| Pawn | One cell forward along rank **or** tier into an empty cell. An unmoved pawn may instead advance two along either axis if both intermediate and destination cells are empty. Its first move consumes this entitlement for both axes. |

Sliding pieces stop at the first occupied cell; they may capture an enemy there but cannot pass through it. Pawns capture one file left or right plus one forward step along either rank or tier. They cannot capture straight ahead, combine rank and tier in one advance, or capture with a rank-plus-tier offset. Black reverses both forward directions.

## Special moves

**Castling:** only along files on the original back row/tier. Kingside moves king E→G and rook H→F; queenside moves king E→C and rook A→D. The king and relevant original rook must retain their unmoved entitlement. Every intervening cell must be empty, including B on the queenside. The king cannot start in check, cross an attacked cell or finish in check. Moving the king, moving the eligible rook or capturing that rook permanently removes the corresponding right; a replacement or promoted rook does not restore it. There is no rank-axis or tier-axis castling.

**En passant:** immediately after an enemy pawn's two-cell advance, a pawn may capture onto its skipped cell using its normal file-offset capture along that **same axis**. A rank double permits rank-axis interception; a tier double permits tier-axis interception. The advanced pawn is removed from its actual destination. The capture must still preserve king safety. The entitlement expires after any other completed move; reads and rejected moves do not consume it.

**Promotion:** a white pawn promotes only on rank 8 **and** tier Z; a black pawn only on rank 1 **and** tier S. Any file qualifies. Reaching just one boundary does not promote. Promotion, including a capturing promotion, requires an explicit queen, rook, bishop or knight choice as part of the same move. In the browser, Cancel leaves the entire position unchanged.

## Check and ending

Check means the current side's king is attacked. Legal replies include safe ordinary moves, captures and eligible special moves. A player in check with no legal reply loses by checkmate. A player with no legal reply while not in check draws by stalemate. A terminal position accepts inspection and New game, but no further moves.

Repetition, move-count and insufficient-material draws are not implemented. AI, evaluation/search, bit arenas, online play, undo and saved games are outside this milestone.

## Local match lifecycle

Play mode uses one shared match held in server memory. Refresh or Geometry sandbox does not reset it; **New game** does. All tabs share the same match and may need a fresh selection/read after another tab moves. Stale actions are rejected and refreshed without automatic replay. Restarting the local server creates a new match and loses the previous one. Geometry sandbox uses independent fixtures and occupancy previews, not legal match moves.

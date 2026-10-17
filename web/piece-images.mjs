// Snapshot codes are display identities; this table contains no movement rules.
const PIECE_NAMES = Object.freeze(['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']);
export const PIECE_IMAGE_URLS = Object.freeze(['white', 'black'].flatMap(color =>
  PIECE_NAMES.map(piece => `/assets/${color}_${piece}.png`)));

export function pieceImageUrl(code) {
  if (!Number.isInteger(code) || Math.abs(code) > 6) throw new RangeError('Invalid piece code');
  if (code === 0) return null;
  return PIECE_IMAGE_URLS[(code > 0 ? 0 : 6) + Math.abs(code) - 1];
}

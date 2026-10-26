// Common display IDs: NONE, SOLID, DOT, DASH, DASH_DOT, DASH_DOT_DOT.
// Native raw-format decoding and unsupported compound strokes stay separate.
const patterns = Object.freeze([
  null,
  ...[[], [2, 2], [6, 3], [6, 3, 2, 3], [6, 3, 2, 3, 2, 3]].map(Object.freeze),
]);

export function strokeDashPattern(style) {
  return Number.isInteger(style) && style >= 1 && style < patterns.length ? patterns[style] : null;
}

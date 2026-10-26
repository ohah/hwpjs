/** HWP5 table35 kinds; measured preview strokes, not original font rasterization. */
import { canvasFontSize } from './canvas-font-size.mjs';
import { HWP5_CHARACTER_OUTLINE_KINDS } from '../../js/character-outline-args.mjs';
export function characterOutlineStyle(row, font) {
  if (!row) return null;
  const raw = row.rawKind;
  if (row.state === 'solid' && (raw === 1 || raw === null))
    return { kind: 'solid', width: 1, dash: [] };
  if (row.state !== 'other' || !Number.isInteger(raw) || raw < 2 || raw > 6) return null;
  const size = canvasFontSize(font);
  if (!size) return null;
  const unit = Math.max(1, size.pixels / 20);
  const patterns = [[1, 2], [], [4, 2], [4, 2, 1, 2], [4, 2, 1, 2, 1, 2]];
  return {
    kind: HWP5_CHARACTER_OUTLINE_KINDS[raw],
    width: raw === 3 ? 2 * unit : unit,
    dash: patterns[raw - 2].map((value) => value * unit),
  };
}

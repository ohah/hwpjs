import { characterPropertyArgs } from "../../js/character-property-args.mjs";
import { isSourceCharacterSize } from "./character-size-selection.mjs";

/** One-point step from current native size, never from an uncommitted draft. */
export function steppedCharacterSize(current, direction) {
  if (!isSourceCharacterSize(current) || ![-1, 1].includes(direction)) return null;
  const size = current + direction * 100;
  try { characterPropertyArgs({ size }); } catch { return null; }
  return size;
}

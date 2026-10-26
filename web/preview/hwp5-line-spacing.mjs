// Integer HWP5 spacing arithmetic. No font measurement, hit testing or source writes.
import { roundedMulDiv, isInt32 as int32 } from './integer-mul-div.mjs';
export { roundedMulDiv } from './integer-mul-div.mjs';
export function hwp5LineSpacing(kind, value, height, { basisHeight = height, relativeBase } = {}) {
  if (
    ![kind, value, height, basisHeight].every(int32) ||
    kind < 0 ||
    kind > 3 ||
    value < 0 ||
    height < 0 ||
    basisHeight < 0
  )
    return null;
  let extra;
  if (kind === 0) {
    const rounded = roundedMulDiv(Math.trunc(basisHeight / 4), value - 100, 100);
    if (rounded === null) return null;
    extra = rounded * 4;
  } else {
    let distance = Math.trunc(value / 2);
    if (value % 2) {
      if (!int32(relativeBase) || relativeBase <= 0) return null;
      distance = roundedMulDiv(distance, relativeBase, 100);
      if (distance === null) return null;
    }
    extra = kind === 1 ? distance - height : kind === 2 ? distance : Math.max(0, distance - height);
  }
  const advance = height + extra;
  return int32(extra) && int32(advance) ? { extra, advance } : null;
}

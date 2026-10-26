/** Integer advance-based spacing delta only; no run-end or wrapping policy. */
import { roundedMulDiv } from "./integer-mul-div.mjs";
export function characterSpacingDelta(advance, percent) {
  if (
    !Number.isInteger(advance) ||
    advance < 0 ||
    !Number.isInteger(percent) ||
    percent < -128 ||
    percent > 127
  )
    return null;
  return roundedMulDiv(advance, percent, 100);
}

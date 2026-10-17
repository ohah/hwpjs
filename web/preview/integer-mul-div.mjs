/** Signed int32 multiply/divide with nearest rounding; ties away from zero. */
export const isInt32 = value => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
export function roundedMulDiv(a, b, divisor) {
  if (!isInt32(a) || !isInt32(b) || !isInt32(divisor) || divisor <= 0) return null;
  const product = BigInt(a) * BigInt(b), half = BigInt(divisor) / 2n;
  const result = Number((product + (product < 0n ? -half : half)) / BigInt(divisor));
  return isInt32(result) ? result : null;
}

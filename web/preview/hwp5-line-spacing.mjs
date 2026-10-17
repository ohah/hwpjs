// Integer HWP5 spacing arithmetic. No font measurement, hit testing or source writes.
const int32 = value => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
export function roundedMulDiv(a, b, divisor) {
  if (!int32(a) || !int32(b) || !int32(divisor) || divisor <= 0) return null;
  const product = BigInt(a) * BigInt(b), half = BigInt(divisor) / 2n;
  const result = Number((product + (product < 0n ? -half : half)) / BigInt(divisor));
  return int32(result) ? result : null;
}
export function hwp5LineSpacing(kind, value, height, { basisHeight = height, relativeBase } = {}) {
  if (![kind, value, height, basisHeight].every(int32) || kind < 0 || kind > 3 || value < 0 || height < 0 || basisHeight < 0) return null;
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

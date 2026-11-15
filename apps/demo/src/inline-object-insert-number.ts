import { parseChartDecimal, compareChartDecimals } from '../../../js/chart-create-decimal.mjs';

/** Typed UI inputs must retain their decimal value through the public number DTO.
 * Compare its canonical decimal spelling, not its binary floating-point expansion.
 * Direct Native wire strings have a wider domain; legacy grid admission is separate. */
export function checkedChartInputNumber(raw: string, nonnegative = false): number {
  const parsed = parseChartDecimal(raw);
  if (nonnegative && parsed.negative) throw Error('InvalidChartNumber');
  const value = Number(raw);
  if (!Number.isFinite(value)) throw Error('InvalidChartNumber');
  if (compareChartDecimals(raw, String(value)) !== 0) throw Error('ChartInputPrecisionLoss');
  return value;
}

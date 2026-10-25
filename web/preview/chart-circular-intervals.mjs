import { createChartAbsoluteTotal } from "./chart-absolute-total.mjs";

/** Shared normalized fractions and angle endpoints, not source layout policy. */
export function chartCircularIntervals(values, origin) {
  if (!Number.isFinite(origin)) return { state: "unavailable", reason: "InvalidCircularOrigin" };
  const total = createChartAbsoluteTotal(values);
  if (!total || values.some(value => value < 0)) return { state: "unavailable", reason: "InvalidCircularValues" };
  const add = total.accumulator(), intervals = []; let previous = 0;
  for (const value of values) {
    const start = previous, end = add(value); previous = end;
    const first = origin + start * 2 * Math.PI, last = origin + end * 2 * Math.PI;
    if (value > 0 && (total.share(value) === 0 || end <= start || last <= first)) return { state: "unavailable", reason: "UnrepresentableCircularShare" };
    intervals.push({ start_fraction: start, end_fraction: end, start_angle: first, end_angle: last });
  }
  return { state: "ready", empty: total.isZero, intervals };
}

import { createChartAbsoluteTotal } from "./chart-absolute-total.mjs";
/** Group ownership only; common absolute-total arithmetic owns scaling. */
export function chartPercentNormalization(series) {
  const totals = new Map();
  let positive = false,
    negative = false;
  for (const row of series)
    for (const point of row.points)
      if (point.value) {
        if (point.value.number?.kind !== "finite")
          return { state: "unavailable", reason: "NonNumericChartValue" };
        const value = point.value.number.value;
        positive ||= value > 0;
        negative ||= value < 0;
        const values = totals.get(point.index) ?? [];
        values.push(value);
        totals.set(point.index, values);
      }
  for (const [index, values] of totals) {
    const total = createChartAbsoluteTotal(values);
    if (!total) return { state: "unavailable", reason: "NonNumericChartValue" };
    totals.set(index, total);
  }
  return {
    state: "ready",
    domain: [negative ? -1 : 0, positive || !negative ? 1 : 0],
    share(index, value) {
      return totals.get(index).share(value);
    },
    accumulator() {
      const accumulators = new Map();
      return (index, value) => {
        let add = accumulators.get(index);
        if (!add) {
          add = totals.get(index).accumulator();
          accumulators.set(index, add);
        }
        return add(value);
      };
    },
  };
}

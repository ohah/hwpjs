import { chartPercentNormalization } from "./chart-percent-normalization.mjs";
/** Line preview uses algebraic cumulative values, not separate bar sign stacks. */
export function chartLineValues(series, grouping) {
  if (!["standard", "stacked", "percentStacked"].includes(grouping)) return { state: "unavailable", reason: "UnsupportedLineGrouping" };
  const normalization = grouping === "percentStacked" ? chartPercentNormalization(series) : null;
  if (normalization?.state === "unavailable") return normalization;
  const accumulate = normalization?.accumulator();
  const cumulative = new Map(), rows = [], domain = [];
  for (const source of series) {
    const points = [];
    for (const point of source.points) {
      if (!point.value) continue;
      if (point.value.number?.kind !== "finite" || !Number.isFinite(point.value.number.value)) return { state: "unavailable", reason: "NonNumericChartValue" };
      const value = point.value.number.value;
      const normalized = normalization ? normalization.share(point.index, value) : value;
      const start = grouping === "standard" ? 0 : cumulative.get(point.index) ?? 0;
      const end = accumulate ? accumulate(point.index, value) : start + normalized;
      if (!Number.isFinite(end)) return { state: "unavailable", reason: "ChartLineStackOverflow" };
      if (grouping !== "standard") cumulative.set(point.index, end);
      points.push({ index: point.index, ordinal: point.value.ordinal, value, normalized_value: normalized, start_value: start, end_value: end,
        ...(point.value.generated === true ? { generated: true } : {}) });
      domain.push(end);
    }
    rows.push({ series_node: source.node, points });
  }
  return domain.length ? { state: "ready", rows, domain: normalization?.domain ?? domain } : { state: "unavailable", reason: "EmptyAxisScaleData" };
}

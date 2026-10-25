import { chartPercentNormalization } from "./chart-percent-normalization.mjs";
/** Source-indexed stacks. Negative and positive baselines never cancel. */
export function chartBarSegments(series, grouping) {
  if (!["clustered", "stacked", "percentStacked"].includes(grouping)) return { state: "unavailable", reason: "UnsupportedBarGrouping" };
  const normalization = grouping === "percentStacked" ? chartPercentNormalization(series) : null;
  if (normalization?.state === "unavailable") return normalization;
  const positive = new Map(), negative = new Map(), segments = [], domain = [];
  for (const [seriesOrdinal, row] of series.entries()) for (const point of row.points) {
    if (!point.value) continue;
    if (point.value.number?.kind !== "finite") return { state: "unavailable", reason: "NonNumericChartValue" };
    const value = point.value.number.value, normalizedValue = normalization ? normalization.share(point.index, value) : value;
    const stack = value < 0 ? negative : positive;
    const start = grouping !== "clustered" ? stack.get(point.index) ?? 0 : 0;
    const end = start + normalizedValue;
    if (!Number.isFinite(end)) return { state: "unavailable", reason: "ChartStackOverflow" };
    if (grouping !== "clustered") stack.set(point.index, end);
    domain.push(start, end);
    segments.push({ series_node: row.node, seriesOrdinal, index: point.index, ordinal: point.value.ordinal, value, normalized_value: normalizedValue, start, end });
  }
  if (!segments.length) return { state: "unavailable", reason: "EmptyAxisScaleData" };
  return { state: "ready", segments, domain: normalization?.domain ?? domain };
}

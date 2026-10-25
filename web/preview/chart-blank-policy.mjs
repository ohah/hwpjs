/** Renderer policy only; never rewrites native points or fills saved caches. */
export function chartBlankPolicy(display) {
  const field = display.blank_policy;
  if (field === undefined || field === null) return { state: "selected", value: "gap", explicit: false,
    warnings: ["PreviewDefaultBlankPolicy", "PreviewGapBlanks"] };
  if (field.value === null) return { state: "unavailable", reason: "MissingChartBlankPolicyValue" };
  if (!["gap", "zero", "span"].includes(field.value)) return { state: "unavailable", reason: "InvalidChartBlankPolicyValue" };
  return { state: "selected", value: field.value, explicit: true, warnings: [] };
}

export function chartLineBlankSeries(series, indices, policy) {
  if (policy !== "zero") return { state: "ready", series };
  const rows = [];
  for (const source of series) {
    // Entire missing value sources are not evidence of numeric zeroes.
    if (!source.points.some(point => point.value)) return { state: "unavailable", reason: "MissingLineValueSource" };
    const byIndex = new Map(source.points.map(point => [point.index, point]));
    rows.push({ ...source, points: indices.map(index => {
      const point = byIndex.get(index);
      return point?.value ? point : { ...point, index, value: { ordinal: null, generated: true, number: { kind: "finite", value: 0 } } };
    }) });
  }
  return { state: "ready", series: rows };
}

import { chartPlotInput, chartAxisHidden } from "./chart-plot-input.mjs";
const unavailable = (reason) => ({ state: "unavailable", reason });

/** Shared category/value ownership and labels, independent of chart geometry. */
export function chartCartesianData(display, plotNode) {
  const input = chartPlotInput(display, plotNode);
  if (input.state !== "ready") return input;
  const { index, axes, series } = input;
  const values = axes.filter((axis) => axis?.kind === "valAx"),
    categories = axes.filter((axis) => axis?.kind === "catAx");
  if (values.length !== 1 || categories.length !== 1) return unavailable("AmbiguousChartAxes");
  const indices = [
    ...new Set(series.flatMap((row) => row.points.map((point) => point.index))),
  ].sort((a, b) => a - b);
  if (!indices.length) return unavailable("EmptyChartSeries");
  const orientation = categories[0].scaling?.orientation;
  if (orientation && !["minMax", "maxMin"].includes(orientation.value))
    return unavailable("InvalidCategoryOrientation");
  const texts = new Map();
  for (const row of series)
    for (const point of row.points)
      if (point.category) {
        const entries = texts.get(point.index) ?? new Set();
        entries.add(point.category.value);
        texts.set(point.index, entries);
      }
  const labels = indices.map((index) => {
    const entries = texts.get(index);
    return {
      index,
      text: entries?.size === 1 ? entries.values().next().value : null,
      ambiguous: (entries?.size ?? 0) > 1,
    };
  });
  return {
    state: "ready",
    index,
    series,
    indices,
    categories: labels,
    valueAxis: values[0],
    categoryAxis: categories[0],
    categoryReversed: orientation?.value === "maxMin",
    axesHidden: { value: chartAxisHidden(values[0]), category: chartAxisHidden(categories[0]) },
    legend: input.legend,
  };
}

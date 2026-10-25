import { chartCartesianData } from "./chart-cartesian-data.mjs";
import { chartSeriesOrder } from "./chart-series-order.mjs";
import { chartBlankPolicy } from "./chart-blank-policy.mjs";
const unavailable = reason => ({ state: "unavailable", reason });

/** Stock source rows only. Document series order does not infer price roles. */
export function chartStockData(display, plotNode, { maxCells = 100_000 } = {}) {
  const plot = display.plots.find(row => row.node === plotNode);
  if (!plot) return unavailable("MissingChartPlot");
  if (plot.kind !== "stockChart") return unavailable("UnsupportedStockPlotKind");
  const data = chartCartesianData(display, plotNode);
  if (data.state !== "ready") return data;
  if (data.series.length < 3) return unavailable("UnsupportedStockSeriesCount");
  if (!Number.isSafeInteger(maxCells) || maxCells < 1) return unavailable("InvalidStockCellBudget");
  if (data.indices.length > Math.floor(maxCells / data.series.length)) return unavailable("StockCellBudgetExceeded");
  const policy = chartBlankPolicy(display);
  if (policy.state !== "selected") return policy;
  const maps = data.series.map(series => new Map(series.points.map(point => [point.index, point])));
  const rows = [];
  for (const [ordinal, index] of data.indices.entries()) {
    const category = data.categories[ordinal];
    if (category.ambiguous) return unavailable("AmbiguousStockCategory");
    const values = [], missing = [];
    for (const [seriesIndex, series] of data.series.entries()) {
      const point = maps[seriesIndex].get(index);
      if (point?.x || point?.y || point?.bubble_size) return unavailable("IncompleteStockValueRow");
      if (!point?.value) {
        if (policy.value !== "gap") return unavailable("UnsupportedStockBlankPolicy");
        missing.push(series.node); continue;
      }
      if (point.value.number?.kind !== "finite") return unavailable("InvalidStockValue");
      values.push({ series_node: series.node, value_ordinal: point.value.ordinal,
        raw_value: point.value.value, value: point.value.number.value });
    }
    rows.push({ index, category: category.text, values, missing_series_nodes: missing });
  }
  return { state: "source-rows", exact: false, ordering: chartSeriesOrder(display, plotNode), settings: structuredClone(display.plot_settings[data.index].stock),
    value_scaling: structuredClone(data.valueAxis.scaling), category_reversed: data.categoryReversed,
    axes_hidden: { ...data.axesHidden }, categories: data.categories.map(row => ({ ...row })),
    series: data.series.map(series => ({ node: series.node, name: series.name?.text ?? null })), rows,
    empty_value_series_nodes: data.series.filter(series => !series.points.some(point => point.value)).map(series => series.node),
    blank_warnings: [...policy.warnings, ...(rows.some(row => row.missing_series_nodes.length) ? ["PreviewStockGapBlanks"] : [])],
    warnings: ["StockPriceRolesNotResolved", "StockPlotStylesNotProjected"] };
}

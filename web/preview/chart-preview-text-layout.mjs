import { createChartValueScale } from './chart-value-scale.mjs';
import { chartPreviewTicks } from './chart-preview-ticks.mjs';
import { shortChartLabel, chartPreviewLegendLayout } from './chart-preview-legend-layout.mjs';
import { chartPieTextLayout } from './chart-pie-text-layout.mjs';
const fontHeight = 12;
/** Preview text layout only; source font/number format/legend settings are pending. */
export function chartPreviewTextLayout(item, measure) {
  const title = item.primitives.title;
  if (title == null) return chartPreviewBodyTextLayout(item, measure);
  if (
    !Array.isArray(title.lines) ||
    title.lines.length < 1 ||
    title.lines.length > 3 ||
    title.lines.some(
      (line) =>
        typeof line !== 'string' ||
        line.length > 258 ||
        !line.isWellFormed() ||
        /[\r\n]/.test(line) ||
        [...line].length > 129,
    )
  )
    return { state: 'unavailable', reason: 'InvalidChartPreviewTitle' };
  for (const line of title.lines) {
    const width = measure(line);
    if (typeof width !== 'number' || !Number.isFinite(width) || width < 0)
      return { state: 'unavailable', reason: 'ChartPreviewTextSpaceUnavailable' };
  }
  const height = title.lines.length * 16 + 8;
  if (item.width < 40 || item.height - height < 24)
    return { state: 'unavailable', reason: 'ChartPreviewTextSpaceUnavailable' };
  const layout = chartPreviewBodyTextLayout({ ...item, height: item.height - height }, measure);
  if (layout.state !== 'ready') return layout;
  return {
    ...layout,
    plot: { ...layout.plot, y: layout.plot.y + height },
    legend: layout.legend.map((row) => ({ ...row, y: row.y + height })),
    summary: {
      categoryOmitted: 0,
      legendOmitted: 0,
      shortened: 0,
      ...layout.summary,
      titlePainted: 1,
      titleShortened: title.shortened ? 1 : 0,
    },
    title: { ...title, x: item.width / 2, y: 8, lineHeight: 16, maxWidth: item.width - 16 },
  };
}
function chartPreviewBodyTextLayout(item, measure) {
  const p = item.primitives;
  if (p.pie || p.pie_3d || p.of_pie) return chartPieTextLayout(item, measure);
  const axesHidden = p.axes_hidden ?? { value: false, category: false };
  if (!Array.isArray(p.categories) || !Array.isArray(p.legend))
    return {
      state: 'ready',
      plot: { x: 0, y: 0, width: item.width, height: item.height },
      ticks: [],
      categories: [],
      legend: [],
    };
  if (![p.minimum, p.maximum].every(Number.isFinite) || p.minimum >= p.maximum)
    return { state: 'unavailable', reason: 'InvalidChartPreviewTextRange' };
  const width = (text) => {
    const value = measure(text);
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : NaN;
  };
  const sourceTicks =
    p.value_ticks === undefined
      ? (createChartValueScale(
          [p.minimum, p.maximum],
          { orientation: { value: p.value_reversed ? 'maxMin' : 'minMax' } },
          { includeZero: false },
        ).ticks?.() ?? null)
      : p.value_ticks;
  const valueTicks = chartPreviewTicks(sourceTicks, p.grouping === 'percentStacked');
  const numericCategories =
    p.category_ticks === undefined ? undefined : chartPreviewTicks(p.category_ticks);
  if (!valueTicks || numericCategories === null)
    return { state: 'unavailable', reason: 'InvalidChartPreviewTicks' };
  const ticks = axesHidden.value ? [] : valueTicks;
  let shortened = 0;
  const categories = axesHidden.category
    ? []
    : (numericCategories ??
      p.categories.slice(0, 200).map((row, i) => {
        const text = row.text === null ? null : shortChartLabel(row.text);
        if (text !== row.text) shortened++;
        return {
          ...row,
          text,
          fraction: p.category_reversed
            ? 1 - (i + 0.5) / p.categories.length
            : (i + 0.5) / p.categories.length,
        };
      }));
  let widestTick = 0,
    widestCategory = 0;
  for (const tick of ticks) widestTick = Math.max(widestTick, width(tick.text));
  for (const category of categories)
    if (category.text !== null) widestCategory = Math.max(widestCategory, width(category.text));
  const left = 8 + Math.min(item.width * 0.35, p.direction === 'bar' ? widestCategory : widestTick);
  const right = p.direction === 'bar' ? Math.min(widestTick / 2 + 4, item.width * 0.15) : 8;
  const available = item.width - left - right;
  const legendLayout = chartPreviewLegendLayout(p.legend, available, left, width);
  if (legendLayout.state !== 'ready') return legendLayout;
  const legend = legendLayout.legend,
    legendHeight = legendLayout.height;
  shortened += legendLayout.shortened;
  const plot = { x: left, y: 10, width: available, height: item.height - 10 - 24 - legendHeight };
  if (
    ![plot.x, plot.width, plot.height, widestTick, widestCategory].every(Number.isFinite) ||
    plot.width < 24 ||
    plot.height < 24
  )
    return { state: 'unavailable', reason: 'ChartPreviewTextSpaceUnavailable' };
  for (const entry of legend) entry.y = plot.y + plot.height + 24 + entry.line * 18;
  const categoryOmitted =
    axesHidden.category || numericCategories
      ? 0
      : Math.max(0, p.categories.length - categories.length);
  const legendOmitted = legendLayout.omitted;
  return {
    state: 'ready',
    plot,
    ticks,
    categories,
    legend,
    category_count: numericCategories?.length ?? p.categories.length,
    axes_hidden: axesHidden,
    fontHeight,
    direction: p.direction,
    summary: { categoryOmitted, legendOmitted, shortened },
  };
}

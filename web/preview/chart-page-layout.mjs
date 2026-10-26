import { selectChartPageSources } from './chart-page-sources.mjs';
import { layoutDrawingWrapBody } from './drawing-wrap-body-flow.mjs';
import { resolveComponentWrapReservations } from './component-wrap-reservations.mjs';
import { projectFloatingOlePage } from './ole-page-projection.mjs';
import { drawingCollisionInventory } from './drawing-collision-inventory.mjs';
import { pictureTextMeasure } from './picture-text-measurement.mjs';
import { picturePositionKey } from './picture-inline.mjs';
import { reserveInlineChartPages } from './chart-inline-page-reservations.mjs';

// The selected chart uses its paired source rectangle exactly once. No fake picture/model.
export function layoutChartPageContent(content, measure, maxRows, read, layoutBody) {
  const fail = (error) => ({ state: 'unavailable', error });
  const selected = selectChartPageSources(content, read);
  if (selected.state !== 'selected') return selected;
  const inline = selected.charts.filter((chart) => chart.inlineItem),
    charts = selected.charts.filter((chart) => !chart.inlineItem);
  if (charts.some((chart) => ![0, 1].includes(chart.source.flow?.text_wrap)))
    return fail('UnsupportedChartPageWrap');
  const anchors = charts.map((chart) => ({
    section: chart.section,
    drawingNode: chart.node,
    hostParagraph: chart.paragraph,
    anchorUnit: chart.anchorUnit,
    source: chart.source,
  }));
  const bodyContent = { ...content, oles: [] };
  const bodyMeasure = pictureTextMeasure(
    new Map(
      inline.map((chart) => [
        picturePositionKey(chart.section, chart.paragraph, chart.anchorUnit),
        chart.inlineItem,
      ]),
    ),
    charts,
    measure,
  );
  const layout = (options) => {
    const body = layoutBody(bodyContent, bodyMeasure, maxRows, options);
    return charts.length &&
      (body?.drawingWrapReservations?.length || body?.chartWrapReservations?.length)
      ? fail('UnsupportedNestedChartWrapFlow')
      : body;
  };
  const result = charts.length
    ? layoutDrawingWrapBody(anchors, content.paragraphs, layout, {
        measure: bodyMeasure,
        resolveReservations(body) {
          const result = resolveComponentWrapReservations(
            charts,
            content.paragraphs,
            body,
            drawingCollisionInventory(bodyContent, body),
            projectFloatingOlePage,
            'chart',
          );
          return result.state === 'reserved'
            ? {
                ...result,
                reservations: result.reservations.map(({ node, ...row }) => ({
                  ...row,
                  drawingNode: node,
                })),
              }
            : result;
        },
      })
    : layout({});
  if (result.state !== 'paginated' || result.limited) return result;
  if (charts.length && (result.drawingWrapReservations?.length ?? 0) !== charts.length)
    return fail('IncompleteChartPageReservations');
  const inlinePages = reserveInlineChartPages(inline, content, result);
  if (inlinePages.state !== 'reserved') return inlinePages;
  const { drawingWrapReservations, drawingWrapIterations, ...withoutDrawingWrap } = result;
  const body = charts.length ? withoutDrawingWrap : result;
  return {
    ...body,
    pageLayoutMode: 'measured-chart-body',
    chartWrapIterations: charts.length ? drawingWrapIterations : 0,
    chartWrapReservations: [
      ...(charts.length ? (drawingWrapReservations ?? []) : []).map(({ drawingNode, ...row }) => {
        const chart = charts.find((c) => c.section === row.section && c.node === drawingNode);
        return {
          ...row,
          oleNode: drawingNode,
          wrapper: chart.wrapper,
          paragraph: chart.paragraph,
          anchorUnit: chart.anchorUnit,
          paintable: true,
        };
      }),
      ...inlinePages.reservations,
    ],
  };
}

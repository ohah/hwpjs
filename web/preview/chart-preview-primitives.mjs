import { chartAreaPrimitives } from './chart-area-primitives.mjs';
import { chartArea3DPrimitives } from './chart-area-3d-primitives.mjs';
import { chartLine3DPrimitives } from './chart-line-3d-primitives.mjs';
import { chartDoughnutPrimitives } from './chart-doughnut-primitives.mjs';
import { chartRadarPrimitives } from './chart-radar-primitives.mjs';
import { chartBubblePrimitives } from './chart-bubble-primitives.mjs';
import { chartSurfacePrimitives } from './chart-surface-primitives.mjs';
import { chartBarPrimitives } from './chart-bar-primitives.mjs';
import { chartBar3DPrimitives } from './chart-bar-3d-primitives.mjs';
import { chartLinePrimitives } from './chart-line-primitives.mjs';
import { chartScatterPrimitives } from './chart-scatter-primitives.mjs';
import { chartPiePrimitives } from './chart-pie-primitives.mjs';
import { chartPie3DPrimitives } from './chart-pie-3d-primitives.mjs';
import { chartOfPiePrimitives } from './chart-of-pie-primitives.mjs';
import { chartStockPrimitives } from './chart-stock-primitives.mjs';
import { chartPreviewTitle } from './chart-preview-title.mjs';
import { emptyCircularPreview } from './chart-empty-circular.mjs';

const projectors = new Map([
  ['areaChart', chartAreaPrimitives],
  ['area3DChart', chartArea3DPrimitives],
  ['line3DChart', chartLine3DPrimitives],
  ['doughnutChart', chartDoughnutPrimitives],
  ['radarChart', chartRadarPrimitives],
  ['bubbleChart', chartBubblePrimitives],
  ['surfaceChart', chartSurfacePrimitives],
  ['surface3DChart', chartSurfacePrimitives],
  ['barChart', chartBarPrimitives],
  ['bar3DChart', chartBar3DPrimitives],
  ['lineChart', chartLinePrimitives],
  ['scatterChart', chartScatterPrimitives],
  ['pieChart', chartPiePrimitives],
  ['ofPieChart', chartOfPiePrimitives],
  ['stockChart', chartStockPrimitives],
  ['pie3DChart', chartPie3DPrimitives],
]);

export const chartPreviewKinds = Object.freeze([...projectors.keys()]);

/** The display path and coverage checks use the same explicit kind dispatch. */
export function chartPreviewPrimitives(display) {
  if (!display || !Array.isArray(display.plots))
    return { state: 'unavailable', reason: 'MissingChartPlots' };
  if (display.plots.length !== 1)
    return { state: 'unavailable', reason: 'UnsupportedComboChartPaint' };
  const plot = display.plots[0],
    project = projectors.get(plot.kind);
  const projected = project
    ? project(display, plot.node)
    : { state: 'unavailable', reason: 'UnsupportedChartPreviewKind' };
  const result =
    projected.state === 'ready' ? projected : emptyCircularPreview(display, plot.node, projected);
  if (result.state !== 'ready')
    return result.reason === 'MissingNativeChartFamilySettings'
      ? {
          ...result,
          kind: plot.kind,
          message: `${plot.kind}: Native 표시 계약에 ${result.required_fields.join(', ')} 필드가 필요합니다.`,
          diagnostics: [
            { code: result.reason, kind: plot.kind, required_fields: [...result.required_fields] },
          ],
        }
      : result;
  const title = chartPreviewTitle(display);
  if (title.title === null && title.warnings.length === 0) return result;
  return {
    ...result,
    title: title.title,
    warnings: [...(result.warnings ?? []), ...title.warnings],
  };
}

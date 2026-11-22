import { inlineHwp5ChartIndex } from './hwp5-chart-layers.mjs';
import { projectedHwp5ChartRootKeys } from './hwp5-chart-roots.mjs';

// Display-flow inputs only. Existing Native root/frame and inline-anchor proof
// establish each chart; never hide an unknown control or issue edit authority.
export function hwp5InlineChartFlow(content) {
  const empty = () => ({ state: 'selected', index: new Map(), objects: new Map(), anchors: [] });
  if (content.format !== 'hwp5' || content.hwp5ChartTargets === undefined) return empty();
  const fail = () => ({ state: 'unavailable', error: 'UnsupportedHwp5InlineChartFlow' });
  if (!Array.isArray(content.hwp5ChartTargets) || content.hwp5ChartTargets.some(t => !t || typeof t !== 'object')) return fail();
  if (!content.hwp5ChartTargets.length) return empty();
  const index = inlineHwp5ChartIndex(content), roots = projectedHwp5ChartRootKeys(content);
  if (index.size !== content.hwp5ChartTargets.length || roots.size !== content.hwp5ChartTargets.length)
    return fail();
  const objects = new Map(), anchors = [];
  for (const item of index.values()) {
    const chart = item?.picture;
    if (!chart || !roots.has(`${chart.section}:${chart.controlNode}`)) return fail();
    const key = `${chart.section}:${chart.paragraph}`, entries = objects.get(key) ?? [];
    entries.push({objectNode: chart.controlNode, unit: chart.anchorUnit, width: item.width, height: item.height});
    objects.set(key, entries);
    anchors.push({section: chart.section, paragraph: chart.paragraph, anchorUnit: chart.anchorUnit, node: chart.controlNode});
  }
  return {state: 'selected', index, objects, anchors};
}

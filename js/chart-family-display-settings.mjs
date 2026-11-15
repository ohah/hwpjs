import { field, oneOf, uint } from './chart-display-fields.mjs';
export const chartFamilyFieldNames = [
  'hole_size',
  'radar_style',
  'bubble_scale',
  'size_represents',
  'show_negative_bubbles',
  'bubble_3d',
  'wireframe',
  'family_unparsed_children',
];
const definitions = {
  hole_size: { kinds: ['doughnutChart'], accepts: (v) => uint(v) && v >= 10 && v <= 90 },
  radar_style: { kinds: ['radarChart'], accepts: oneOf(['standard', 'marker', 'filled']) },
  bubble_scale: { kinds: ['bubbleChart'], accepts: (v) => uint(v) && v <= 300 },
  size_represents: { kinds: ['bubbleChart'], accepts: oneOf(['area', 'w']) },
  show_negative_bubbles: { kinds: ['bubbleChart'], accepts: (v) => typeof v === 'boolean' },
  bubble_3d: { kinds: ['bubbleChart'], accepts: (v) => typeof v === 'boolean' },
  wireframe: { kinds: ['surfaceChart', 'surface3DChart'], accepts: (v) => typeof v === 'boolean' },
};
export const hasChartFamilyFields = (settings) =>
  settings && chartFamilyFieldNames.some((key) => Object.hasOwn(settings, key));
/** Undefined group = old DTO; null Field = source absence, never a value. */
export function chartFamilyDisplayNodes(settings, kind, owner, leaves) {
  if (!hasChartFamilyFields(settings)) return [];
  if (!chartFamilyFieldNames.every((key) => Object.hasOwn(settings, key))) return null;
  const audited = Object.values(definitions).some((item) => item.kinds.includes(kind));
  if (
    audited
      ? typeof settings.family_unparsed_children !== 'boolean'
      : settings.family_unparsed_children !== null
  )
    return null;
  const nodes = [];
  for (const [key, definition] of Object.entries(definitions)) {
    const value = settings[key];
    if (!field(value, definition.accepts, owner)) return null;
    if (value !== null) {
      if (!definition.kinds.includes(kind) || leaves.has(value.node)) return null;
      leaves.add(value.node);
      nodes.push(value.node);
    }
  }
  return nodes;
}

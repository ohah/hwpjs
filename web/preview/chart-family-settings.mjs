import { field } from '../../js/chart-display-fields.mjs';
import { unavailable, requireFamilyFields } from './chart-family-geometry.mjs';
// Proposed additive Native read contract. Undefined is an old DTO, never XML absence.
export function chartFamilySettings(display, node, spec) {
  const index = display.plots.findIndex((p) => p.node === node);
  if (index < 0) return unavailable('MissingChartPlot');
  const settings = display.plot_settings[index],
    names = Object.keys(spec);
  const missing = requireFamilyFields(settings, [...names, 'family_unparsed_children']);
  if (missing) return missing;
  if (settings.family_unparsed_children !== false)
    return unavailable('UnsupportedChartFamilyChildren');
  const result = { state: 'ready' },
    seen = new Set();
  for (const [name, accepts] of Object.entries(spec)) {
    const f = settings[name];
    if (!field(f, accepts, node)) return unavailable('InvalidNativeChartFamilySetting');
    if (f === null || f.value === null)
      return {
        state: 'unavailable',
        reason: 'MissingChartFamilySettingValue',
        required_fields: [name],
      };
    if (seen.has(f.node)) return unavailable('InvalidNativeChartFamilySetting');
    seen.add(f.node);
    result[name] = f.value;
  }
  return result;
}

import { tableHostProfile } from './table-host-profile.mjs';
import { textMeasurement } from './text-measurement.mjs';
import { inlineObjectLineAdvance } from './inline-object-line-advance.mjs';
// The table-only fast path still owns a font-based paragraph line advance.
export function inlineTableHostLeading(table, host, inkHeight, measure) {
  if (
    host?.paragraphShape?.spacingFormat !== 'hwp5' ||
    table?.sourceGeometry?.geometry?.treat_as_character !== true
  )
    return 0;
  const profile = tableHostProfile(host, table);
  if (!profile?.tableOnly) return 0;
  const glyphHeight = Math.max(
    textMeasurement(measure('', host, profile.unit, 'text')).height,
    textMeasurement(measure('', host, host.text.length, 'text')).height,
  );
  return Math.max(
    0,
    inlineObjectLineAdvance(host.paragraphShape, inkHeight, glyphHeight, inkHeight) - inkHeight,
  );
}

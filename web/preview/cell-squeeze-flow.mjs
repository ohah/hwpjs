import { layoutContent } from './layout.mjs';
import { squeezeCaptionRow } from './caption-squeeze-row.mjs';

/** Plain source cells share the existing glyph-preserving spacing projection. */
export function measureCellSqueezeFlow(paragraphs, width, measure, maxRows, compactLines) {
  if (paragraphs.some((p) => /[\t\ufffc]/u.test(p.text))) return null;
  const flow = layoutContent({ paragraphs, limited: false }, width, measure, maxRows, {
    documentBody: true,
    compactLines,
    includeTerminalAfter: false,
    noWrap: true,
  });
  const rows = flow.rows.map(squeezeCaptionRow);
  if (rows.some((row) => row === null))
    return { state: 'unavailable', error: 'UnsupportedTableCellSqueezeWidth' };
  return { ...flow, rows };
}

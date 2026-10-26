import { measureColumnContent } from './column-content-layout.mjs';
import { nextTextRow } from './next-text-row.mjs';

/** Existing column measurement owns text width; table bands retain their dimensions. */
export function measureTableColumnParagraph(paragraph, flow, reference, measure, maxRows) {
  return measureColumnContent(
    { paragraphs: [paragraph], limited: false },
    reference,
    [flow],
    measure,
    maxRows,
  );
}

export function remeasureTableColumnRow(source, width, measure) {
  if (source.kind !== 'text' || !source.paragraphSource) return source;
  return nextTextRow(source.paragraphSource, source.startUnit, width, measure, {
    endUnit: source.endUnit,
  });
}

import { layoutContent } from './layout.mjs';
import { columnReferenceBoxes } from './column-reference-boxes.mjs';
import { nextTextRow } from './next-text-row.mjs';
import { paragraphSpacePixels } from './paragraph-geometry.mjs';
import { columnTextSpans } from './column-text-spans.mjs';

/** Measure source paragraphs at their effective column width; pagination owns y. */
export function measureColumnContent(content, body, flows, measure, maxRows) {
  if (!Number.isInteger(maxRows) || maxRows < 1) throw new RangeError('InvalidLayoutBounds');
  const byParagraph = new Map(flows.map((flow) => [flow.paragraph, flow]));
  const rows = [];
  const deferred = flows.some(
    (flow) =>
      flow.column_declaration?.same_size === false ||
      flow.column_changes?.some((change) => change.unit > 0),
  );
  let limited = content.limited;
  for (const paragraph of content.paragraphs) {
    if (!deferred && rows.length >= maxRows) {
      limited = true;
      break;
    }
    const flow = byParagraph.get(paragraph.paragraph);
    if (!flow || flow.section !== paragraph.section || flow.top_level !== true)
      return { state: 'unavailable', error: 'UnsupportedPageFlow' };
    let spans;
    try {
      spans = columnTextSpans(paragraph, flow);
    } catch (error) {
      return {
        state: 'unavailable',
        error:
          error.message === 'UnsupportedColumnSpans' ? 'UnsupportedPageColumns' : error.message,
      };
    }
    const columns = columnReferenceBoxes(body, spans[0]?.declaration);
    if (columns.state !== 'placed')
      return { state: 'unavailable', error: 'UnsupportedPageColumns' };
    if (deferred) {
      const gap = (height, declaration) => ({
        kind: 'gap',
        section: paragraph.section,
        paragraph: paragraph.paragraph,
        height,
        columnDeclaration: declaration,
      });
      const before = paragraphSpacePixels(paragraph.paragraphShape?.before),
        after = paragraphSpacePixels(paragraph.paragraphShape?.after);
      if (before) rows.push(gap(before, spans[0].declaration));
      for (const span of spans)
        rows.push({
          kind: 'text',
          section: paragraph.section,
          paragraph: paragraph.paragraph,
          startUnit: span.startUnit,
          endUnit: span.endUnit,
          columnDeclaration: span.declaration,
          paragraphSource: paragraph,
        });
      if (after) rows.push(gap(after, spans.at(-1).declaration));
      continue;
    }
    const measured = layoutContent(
      { ...content, paragraphs: [paragraph] },
      columns.boxes[0].width,
      measure,
      maxRows - rows.length,
      { documentBody: true },
    );
    rows.push(...measured.rows);
    limited ||= measured.limited;
    if (measured.limited) break;
  }
  return {
    state: 'measured',
    rows,
    limited,
    ...(deferred
      ? {
          measureRow: (source, width) =>
            source.kind === 'gap'
              ? source
              : nextTextRow(source.paragraphSource, source.startUnit, width, measure, {
                  endUnit: source.endUnit,
                }),
        }
      : {}),
  };
}

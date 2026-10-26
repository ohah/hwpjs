import { columnTextSpans } from './column-text-spans.mjs';
import { columnReferenceBoxes } from './column-reference-boxes.mjs';

/** Shared fixed-width profile; callers retain their own object-specific error names. */
export function fixedColumnParagraphContext(paragraph, flow, body) {
  const fail = (reason) => ({ state: 'unavailable', reason });
  if (
    !paragraph ||
    typeof paragraph.text !== 'string' ||
    !flow ||
    ![paragraph.section, paragraph.paragraph].every((v) => Number.isSafeInteger(v) && v >= 0) ||
    flow.section !== paragraph.section ||
    flow.paragraph !== paragraph.paragraph
  )
    return fail('owner');
  let spans;
  try {
    spans = columnTextSpans(paragraph, flow);
  } catch {
    return fail('declaration');
  }
  if (spans.length !== 1) return fail('changes');
  const columns = columnReferenceBoxes(body, spans[0].declaration);
  if (columns.state !== 'placed') return fail('declaration');
  const width = columns.boxes[0].width;
  if (columns.boxes.some((box) => Math.abs(box.width - width) > 1e-8)) return fail('unequal');
  return { state: 'resolved', width, declaration: spans[0].declaration };
}

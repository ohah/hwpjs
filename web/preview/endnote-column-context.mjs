import { columnReferenceBoxes } from './column-reference-boxes.mjs';

// Resolve the section-end declaration only. Measurement and physical placement
// must consume the same result; never infer a declaration from rendered rows.
export function resolveEndnoteColumnContext(content, section, reference) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    !Number.isSafeInteger(section) ||
    section < 0 ||
    !Array.isArray(content?.paragraphFlows) ||
    content.paragraphFlows.some((f) => !f || typeof f !== 'object')
  )
    return fail('InvalidEndnoteColumnContext');
  const body = content.paragraphFlows.filter(
    (f) => f.section === section && f.host === 'body' && f.top_level === true,
  );
  const notes = content.paragraphFlows.filter((f) => f.section === section && f.host === 'endnote');
  const last = body.at(-1);
  if (!last || !notes.length || !Number.isSafeInteger(last.paragraph) || last.paragraph < 0)
    return fail('MissingEndnoteColumnContext');
  if (last.column_changes?.length) return fail('UnsupportedEndnoteColumnChanges');
  const declaration = last.column_declaration;
  if (declaration == null && last.single_column !== true)
    return fail('MissingEndnoteColumnDeclaration');
  if (
    notes.some(
      (f) =>
        f.column_changes?.length ||
        (f.column_declaration != null &&
          JSON.stringify(f.column_declaration) !== JSON.stringify(declaration)),
    )
  )
    return fail('ConflictingEndnoteColumnDeclaration');
  const placed = columnReferenceBoxes(
    reference,
    declaration ?? {
      count: 1,
      same_size: true,
      gap: 0,
      direction: 'left',
      kind: 'newspaper',
      ambiguous: false,
    },
  );
  if (placed.state !== 'placed') return fail('InvalidEndnoteColumnDeclaration');
  if (placed.boxes.some((box) => box.width !== placed.boxes[0].width))
    return fail('UnsupportedUnequalEndnoteColumns');
  return {
    state: 'resolved',
    section,
    sourceParagraph: last.paragraph,
    declaration: declaration ?? null,
    columns: placed.boxes,
    width: placed.boxes[0].width,
  };
}

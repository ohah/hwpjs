import { retainedTextView, sourceDisplayPosition } from './text-offsets.mjs';

// Reuse the normal retained-control display projection. The Core then compares
// its current paragraph against this display witness before exposing a target.
export function projectHwp5NamedFields(source, preview) {
  const projectionViews = [];
  const bySection = new Map(preview.sections.map((section) => [section.index, section]));
  const paragraphs = new Map();
  let mappingBudget = 8_000_000;
  const rows = source.rows.map(({ section, sourceLocation, ...row }) => {
    let location = null;
    if (sourceLocation && mappingBudget > 0) {
      const { paragraph, sourceNode, startUnit, endUnit } = sourceLocation;
      const raw = bySection.get(section)?.paragraphs[paragraph];
      if (raw?.nodeIndex === sourceNode && raw.parentNodeIndex === null) {
        let current = paragraphs.get(raw);
        if (current === undefined) {
          const view = retainedTextView(raw);
          current = view ? { view, index: null } : null;
          paragraphs.set(raw, current);
        }
        if (current && current.view.offsets.length * 2 <= mappingBudget) {
          const { text, offsets } = current.view;
          mappingBudget -= offsets.length * 2;
          try {
            const start = sourceDisplayPosition(startUnit, offsets, text.length);
            const end = sourceDisplayPosition(endUnit, offsets, text.length);
            if (
              row.value.status === 'available' &&
              end - start === endUnit - startUnit &&
              text.slice(start, end) === row.value.text
            ) {
              if (current.index === null) {
                current.index = projectionViews.length;
                projectionViews.push({ section, paragraph, text });
              }
              location = {
                owner: `section:${section}:body`,
                section,
                paragraph,
                startUnit: start,
                endUnit: end,
                projectionView: current.index,
              };
            }
          } catch (error) {
            if (!(error instanceof RangeError) || error.message !== 'InvalidSourceDisplayPosition')
              throw error;
          }
        }
      }
    }
    return { ...row, location };
  });
  return { format: 'hwp5', coverage: source.coverage, rows, projectionViews };
}

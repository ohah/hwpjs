import { bindPageAreaDeclarationPages } from './page-area-declaration-pages.mjs';
import { createPageAreaDeclarationSelection } from './page-area-declaration-selection.mjs';
import { layoutPageAreas } from './page-area-flow.mjs';
import { layoutPageAreaInstances } from './page-area-instance-layout.mjs';

// Native coordinates -> physical page -> explicit selection -> existing paint rows.
export function layoutDeclaredPageAreas(content, partition, body, pages, measure, maxRows) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) return fail('PageAreaOverflow');
  const binding = bindPageAreaDeclarationPages(content, { ...body, pages });
  if (binding.state !== 'bound') return binding;
  const selection = createPageAreaDeclarationSelection(partition.areas, binding);
  if (selection.state !== 'prepared') return selection;
  const rows = [],
    overflow = [],
    boxes = [],
    placedDrawings = [],
    flowPictures = [],
    tableAnchors = [];
  for (const page of pages) {
    const selected = selection.select(page);
    if (selected.state !== 'selected') return selected;
    if (!selected.areas.length) continue;
    if (rows.length >= maxRows) return fail('PageAreaOverflow');
    const objects = selected.areas.some((area) =>
      ['tables', 'drawings', 'pictures', 'lines', 'containers'].some((key) => area[key]?.length),
    );
    const repeated = objects
      ? layoutPageAreaInstances(
          content,
          { ...partition, areas: selected.areas },
          [page],
          measure,
          maxRows - rows.length,
        )
      : layoutPageAreas(
          {
            ...content,
            paragraphs: selected.areas.flatMap((area) => area.paragraphs),
            paragraphFlows: selected.areas.flatMap((area) => area.paragraphFlows),
          },
          [page],
          measure,
          maxRows - rows.length,
        );
    if (repeated.state !== 'placed') return repeated;
    rows.push(...repeated.rows);
    overflow.push(...repeated.overflow);
    for (const [target, key] of [
      [boxes, 'boxes'],
      [placedDrawings, 'placedDrawings'],
      [flowPictures, 'flowPictures'],
      [tableAnchors, 'tableAnchors'],
    ])
      target.push(...(repeated[key] ?? []));
  }
  return {
    state: 'placed',
    rows,
    overflow,
    boxes,
    placedDrawings,
    flowPictures,
    tableAnchors,
    declarationPages: binding.declarations,
    policy: selection.policy,
  };
}

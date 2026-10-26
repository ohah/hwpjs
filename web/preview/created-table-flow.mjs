import { layoutCreatedTable } from './created-table-layout.mjs';
import { rowHeight } from './row-geometry.mjs';
import { sameCreatedCell } from './created-cell-address.mjs';

// Experimental block flow, not source-equivalent inline pagination.
export function attachCreatedTableFlow(content, base, measure, maxRows = 20000) {
  if (!content.createdTables?.length || base.createdTablesPaginated === true) return base;
  const rows = base.rows.map((row) => ({ ...row }));
  const boxes = (base.boxes ?? []).map((box) => ({ ...box }));
  const paragraphs = [],
    unavailable = [];
  const trailingBoxes = new Map();
  const flowPictures = base.flowPictures?.map((picture) => ({
    ...picture,
    rectangle: { ...picture.rectangle },
  }));
  let height = base.height;
  const tables = [...content.createdTables].sort(
    (a, b) =>
      a.section - b.section || a.hostParagraph - b.hostParagraph || a.anchorUnit - b.anchorUnit,
  );
  for (const table of tables) {
    const host = rows.filter(
      (row) =>
        !row.createdCell &&
        row.kind === 'text' &&
        row.section === table.section &&
        row.paragraph === table.hostParagraph,
    );
    if (
      !host.length ||
      host.some((row) => row.tableNode !== undefined || row.transform !== undefined || row.pageArea)
    ) {
      unavailable.push({
        section: table.section,
        identity: table.identity,
        error: 'UnsupportedCreatedTableHostLayout',
      });
      continue;
    }
    const key = `${table.section}:${table.hostParagraph}`;
    const tail = trailingBoxes.get(key);
    const cut =
      table.anchorUnit === 0
        ? Math.min(...host.map((row) => row.y))
        : Math.max(
            ...host.map((row) => row.y + rowHeight(row)),
            tail ? tail.y + tail.height + 12 : -Infinity,
          );
    const flow = layoutCreatedTable(table, measure, {
      x: host[0].x ?? 20,
      y: cut,
      maxRows: maxRows - rows.length,
    });
    const shift = flow.height + 12;
    for (const row of rows)
      if (row.y >= cut) {
        row.y += shift;
        if (row.pageClip) row.pageClip = { ...row.pageClip, y: row.pageClip.y + shift };
      }
    for (const box of boxes) if (box.y >= cut) box.y += shift;
    for (const picture of flowPictures ?? [])
      if (picture.rectangle.y >= cut) picture.rectangle.y += shift;
    rows.push(...flow.rows.map((row) => ({ ...row, editable: true, selectable: true })));
    boxes.push(...flow.boxes);
    if (table.anchorUnit !== 0)
      trailingBoxes.set(
        key,
        flow.boxes.reduce(
          (last, box) => (!last || box.y + box.height > last.y + last.height ? box : last),
          null,
        ),
      );
    paragraphs.push(...flow.paragraphs);
    height += shift;
  }
  rows.sort((a, b) => a.y - b.y || (a.x ?? 20) - (b.x ?? 20));
  return {
    ...base,
    rows,
    boxes,
    height,
    ...(flowPictures ? { flowPictures } : {}),
    spatialRows: true,
    createdCellParagraphs: paragraphs,
    createdTableUnavailable: unavailable,
    pageLayoutMode: 'created-table-block-prototype',
  };
}

export function createdCellParagraph(layout, point) {
  if (!point?.createdCell) return null;
  return layout.createdCellParagraphs?.find((p) => sameCreatedCell(p, point)) ?? null;
}

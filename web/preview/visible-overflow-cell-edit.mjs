import { hwpUnitPixels } from './hwp-units.mjs';
import { inlineTableHasNoCaption } from './inline-table-paper-preview.mjs';
import { pageVisibleRectangle } from './page-visible-rectangle.mjs';
import { rowLeft, rowTextTop, rowTextHeight, rowVisualHeight } from './row-geometry.mjs';

const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0);
const key = (section, node) => `${section}:${node}`;
const contains = (clip, box) => {
  const result = pageVisibleRectangle(box, clip);
  return result.state === 'visible' && result.clipped === false;
};
const samePaper = (a, b) => a && b && ['x', 'y', 'width', 'height'].every((k) => a[k] === b[k]);

// Final scene proof only. Source widths, owners and Native edit permissions stay unchanged.
export function projectVisibleOverflowCells(content, layout, displayContent = content) {
  const declared = layout?.previewReadOnlyTables;
  if (layout?.state !== 'paginated' || !Array.isArray(declared) || !declared.length) return layout;
  if (
    !['hwp5', 'hwpx'].includes(content?.format) ||
    content.limited !== false ||
    content.window ||
    content.viewKind ||
    content.readOnly === true ||
    !Array.isArray(content?.tables) ||
    !Array.isArray(content?.paragraphs) ||
    !Array.isArray(displayContent?.paragraphs) ||
    !Array.isArray(layout.rows) ||
    !Array.isArray(layout.boxes) ||
    declared.some((d) => !d || !uint(d.section) || !uint(d.tableNode) || !uint(d.hostParagraph)) ||
    content.tables.some((t) => !t || !Array.isArray(t.cells)) ||
    content.paragraphs.some((p) => !p) ||
    layout.rows.some((row) => !row) ||
    layout.boxes.some((box) => !box)
  ) {
    return {
      ...layout,
      rows: (Array.isArray(layout.rows) ? layout.rows : []).map((row) =>
        row?.previewOnly ? { ...row, editable: false, selectable: false } : row,
      ),
      previewReadOnlyTables: declared.map((d) => (d ? { ...d, editableCells: [] } : d)),
    };
  }
  const sourceTables = new Map(),
    sourceParagraphs = new Map(),
    displayed = new Map(),
    infos = new Map();
  const infoFor = (item) =>
    infos.get(key(item.section, item.tableNode)) ??
    infos.get(key(item.section, item.positionOwnerTableNode));
  let unique = true;
  for (const table of content.tables ?? []) {
    const id = key(table.section, table.tableNode);
    sourceTables.set(id, sourceTables.has(id) ? null : table);
  }
  for (const p of content.paragraphs ?? []) {
    const id = key(p?.section, p?.paragraph);
    if (!p || !uint(p.section) || !uint(p.paragraph) || sourceParagraphs.has(id)) unique = false;
    sourceParagraphs.set(id, p);
  }
  for (const p of displayContent.paragraphs) {
    const id = key(p?.section, p?.paragraph);
    if (
      !p ||
      !uint(p.section) ||
      !uint(p.paragraph) ||
      typeof p.text !== 'string' ||
      displayed.has(id)
    )
      unique = false;
    displayed.set(id, p);
  }
  for (const descriptor of declared) {
    const id = key(descriptor.section, descriptor.tableNode),
      table = sourceTables.get(id);
    const info = {
      valid: unique && !infos.has(id) && Boolean(table),
      cells: new Map(),
      descriptor,
    };
    if (infos.has(id)) infos.get(id).valid = false;
    else infos.set(id, info);
    const host = sourceParagraphs.get(key(descriptor.section, descriptor.hostParagraph));
    if (
      !table ||
      table.parentTableNode != null ||
      table.partial !== false ||
      table.sourceGeometry?.geometry?.treat_as_character !== true ||
      !inlineTableHasNoCaption(content.format, table) ||
      table.hostParagraph !== descriptor.hostParagraph ||
      !host ||
      host.tableCell ||
      descriptor.reason !== 'InlineTablePaperOverflow' ||
      !Array.isArray(descriptor.paragraphs)
    ) {
      info.valid = false;
      continue;
    }
    const inventory = new Set();
    for (const cell of table.cells ?? []) {
      if (
        !cell ||
        !uint(cell.listNode) ||
        info.cells.has(cell.listNode) ||
        cell.rowSpan !== 1 ||
        cell.columnSpan !== 1 ||
        !Array.isArray(cell.paragraphs) ||
        !cell.paragraphs.length
      ) {
        info.valid = false;
        continue;
      }
      const expected = new Set();
      const entry = {
        safe: true,
        box: null,
        boxes: 0,
        expected,
        seen: new Set(),
        ranges: new Map(),
        source: cell,
        paragraphs: cell.paragraphs,
      };
      info.cells.set(cell.listNode, entry);
      for (const paragraph of cell.paragraphs) {
        const p = sourceParagraphs.get(key(table.section, paragraph));
        const d = displayed.get(key(table.section, paragraph));
        if (
          !uint(paragraph) ||
          inventory.has(paragraph) ||
          !p ||
          typeof p.text !== 'string' ||
          p.editable !== true ||
          p.tableCell?.tableNode !== table.tableNode ||
          p.tableCell?.listNode !== cell.listNode ||
          !d ||
          d.tableCell?.tableNode !== table.tableNode ||
          d.tableCell?.listNode !== cell.listNode
        )
          info.valid = false;
        expected.add(paragraph);
        inventory.add(paragraph);
      }
    }
    const proof = new Set(descriptor.paragraphs);
    if (
      proof.size !== descriptor.paragraphs.length ||
      proof.size !== inventory.size ||
      [...inventory].some((p) => !proof.has(p))
    )
      info.valid = false;
  }
  for (const p of content.paragraphs ?? []) {
    const info = infos.get(key(p.section, p.tableCell?.tableNode));
    if (info && !info.cells.get(p.tableCell.listNode)?.expected.has(p.paragraph))
      info.valid = false;
  }
  for (const box of layout.boxes ?? []) {
    const info = infoFor(box);
    if (!info) continue;
    const cell = info.cells.get(box.listNode);
    if (!cell) {
      info.valid = false;
      continue;
    }
    cell.boxes++;
    cell.box = box;
    if (
      !uint(cell.source.width) ||
      cell.source.width === 0 ||
      Math.abs(box.width - hwpUnitPixels(cell.source.width)) > 1e-8 ||
      box.previewOnly !== true ||
      box.transform !== undefined ||
      (box.depth ?? 0) !== 0 ||
      !uint(box.pageOrdinal) ||
      !uint(box.columnOrdinal ?? 0) ||
      ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
      box.width <= 0 ||
      box.height <= 0 ||
      !contains(box.referenceBoxes?.paper, box) ||
      !contains(box.pageClip, box)
    )
      cell.safe = false;
  }
  for (const row of layout.rows ?? []) {
    const info = infoFor(row);
    if (!info) continue;
    const cell = info.cells.get(row.listNode),
      box = cell?.box;
    if (!cell) {
      info.valid = false;
      continue;
    }
    if (
      !box ||
      row.transform !== undefined ||
      row.pageOrdinal !== box.pageOrdinal ||
      (row.columnOrdinal ?? 0) !== (box.columnOrdinal ?? 0) ||
      !samePaper(row.referenceBoxes?.paper, box.referenceBoxes?.paper)
    )
      cell.safe = false;
    if (row.kind === 'gap') continue;
    if (row.kind !== 'text' || !cell.expected.has(row.paragraph)) {
      cell.safe = false;
      continue;
    }
    cell.seen.add(row.paragraph);
    const x = rowLeft(row),
      y = row.y + Math.min(0, rowTextTop(row));
    const bottom = row.y + rowVisualHeight(row);
    const bounds = { x, y, width: row.width, height: bottom - y };
    if (
      !Number.isFinite(row.x) ||
      !Number.isFinite(row.y) ||
      !Number.isFinite(row.height) ||
      row.height < 0 ||
      (row.height === 0 && row.text !== '') ||
      row.previewOnly !== true ||
      ![x, y, bottom, row.width, rowTextHeight(row)].every(Number.isFinite) ||
      row.width < 0 ||
      rowTextHeight(row) <= 0 ||
      !contains(row.pageClip, bounds) ||
      !contains(box?.referenceBoxes?.paper, bounds) ||
      !uint(row.startUnit) ||
      !uint(row.endUnit) ||
      row.endUnit < row.startUnit ||
      typeof row.text !== 'string' ||
      row.text.length !== row.endUnit - row.startUnit ||
      !Array.isArray(row.boundaries) ||
      !row.boundaries.length ||
      row.boundaries[0]?.unit !== row.startUnit ||
      row.boundaries.at(-1)?.unit !== row.endUnit
    ) {
      cell.safe = false;
      continue;
    }
    const display = displayed.get(key(row.section, row.paragraph));
    const previous = cell.ranges.get(row.paragraph);
    if (
      !display ||
      typeof display.text !== 'string' ||
      row.text !== display.text.slice(row.startUnit, row.endUnit) ||
      (!previous && row.startUnit !== 0) ||
      (previous &&
        (row.startUnit !== previous.end ||
          (row.startUnit === previous.start && row.endUnit === previous.end)))
    )
      cell.safe = false;
    cell.ranges.set(row.paragraph, { start: row.startUnit, end: row.endUnit });
    let last = null,
      lastX = -Infinity;
    for (const boundary of row.boundaries) {
      if (!boundary) {
        cell.safe = false;
        continue;
      }
      const caret = {
        x: x + boundary.x,
        y: row.y + rowTextTop(row),
        width: 2,
        height: rowTextHeight(row),
      };
      if (
        !uint(boundary.unit) ||
        (last !== null && boundary.unit <= last) ||
        boundary.unit > row.endUnit ||
        boundary.x < lastX ||
        !Number.isFinite(boundary.x) ||
        !contains(row.pageClip, caret) ||
        !contains(box?.referenceBoxes?.paper, caret)
      )
        cell.safe = false;
      last = boundary.unit;
      lastX = boundary.x;
    }
  }
  const allowed = new Set();
  const descriptors = declared.map((descriptor) => {
    const info = infos.get(key(descriptor.section, descriptor.tableNode)),
      editableCells = [];
    if (info?.valid)
      for (const [listNode, cell] of info.cells) {
        if (
          !cell.safe ||
          cell.boxes !== 1 ||
          cell.seen.size !== cell.expected.size ||
          [...cell.expected].some(
            (p) =>
              !cell.seen.has(p) ||
              cell.ranges.get(p)?.end !== displayed.get(key(descriptor.section, p))?.text.length,
          )
        )
          continue;
        editableCells.push({ listNode, paragraphs: [...cell.paragraphs] });
        for (const p of cell.paragraphs) allowed.add(key(descriptor.section, p));
      }
    return { ...descriptor, editableCells };
  });
  const rows = layout.rows.map((row) => {
    if (!infoFor(row)) return row;
    const editable = row.kind === 'text' && allowed.has(key(row.section, row.paragraph));
    return { ...row, editable, selectable: editable, previewOnly: true };
  });
  return { ...layout, rows, previewReadOnlyTables: descriptors };
}

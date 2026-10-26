import { validateNestedFloatingCellOwners } from './nested-floating-cell-owners.mjs';
import { nestedParagraphReference } from './nested-paragraph-reference.mjs';
import { placeMeasuredNestedFloatingTable } from './nested-floating-display-height.mjs';

// Local paragraph/column references only. Real paper bounds are checked at projection.
export function nestedFloatingCellCutScenes(parent, flow, insets) {
  const fail = (error) => ({ state: 'unavailable', error });
  const entries = flow?.floatingTables === undefined ? [] : flow.floatingTables;
  const ownership = validateNestedFloatingCellOwners(parent, entries);
  if (ownership.state !== 'verified') return ownership;
  if (
    !parent ||
    !insets ||
    ![parent.width, parent.height, insets.left, insets.right, insets.top, insets.bottom].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  )
    return fail('InvalidNestedFloatingCellContent');
  const width = parent.width - insets.left - insets.right,
    height = parent.height - insets.top - insets.bottom;
  if (![width, height].every((value) => Number.isFinite(value) && value > 0))
    return fail('InvalidNestedFloatingCellContent');
  if (!Array.isArray(flow?.rows)) return fail('MissingNestedParagraphReference');
  const byParagraph = new Map();
  for (const row of flow.rows)
    if (row?.kind === 'text') {
      const key = `${row.section}:${row.paragraph}`,
        rows = byParagraph.get(key) ?? [];
      rows.push(row);
      byParagraph.set(key, rows);
    }
  const scenes = [];
  for (const entry of entries) {
    const source = entry.table.sourceGeometry;
    if (source?.vertical_relative !== 2 || ![2, 3].includes(source.horizontal_relative))
      return fail('UnsupportedCellFloatingReference');
    const hostRows =
      byParagraph.get(`${entry.paragraph.section}:${entry.paragraph.paragraph}`) ?? [];
    const reference = nestedParagraphReference(
      entry.paragraph,
      { ...flow, rows: hostRows },
      { x: 0, y: 0 },
    );
    if (reference.state !== 'referenced') return reference;
    const placement = placeMeasuredNestedFloatingTable(entry, {
      paragraph: reference.rectangle,
      column: { x: 0, y: 0, width, height },
    });
    if (placement.state !== 'placed') return fail('UnsupportedCellFloatingPosition');
    const rectangle = placement.rectangle;
    const start = Math.min(rectangle.y, ...hostRows.map((row) => row.y));
    const end = Math.max(
      rectangle.y + rectangle.height,
      ...hostRows.map((row) => row.y + row.height),
    );
    if (![start, end].every(Number.isFinite) || start < 0 || end <= start || end > height + 1e-8)
      return {
        ...fail('CellFloatingContentOverflow'),
        tableNode: parent.tableNode,
        listNode: parent.listNode,
        nestedTableNode: entry.table.tableNode,
        sceneStart: start,
        sceneEnd: end,
        cellContentHeight: height,
      };
    scenes.push({ entry, rectangle, start, end });
  }
  return { state: 'prepared', scenes };
}

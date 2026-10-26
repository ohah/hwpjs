import { validateNestedTableOwnership } from "./nested-table-ownership.mjs";
import { measureNestedTable, MAX_NESTED_TABLE_DEPTH } from "./nested-table-measurement.mjs";
import { measureNestedInlineTableObject } from "./nested-inline-table-object-measurement.mjs";

// Reuse source ownership and measurement without rewriting a child's parent.
export function prepareCreatedCellSourceTables(
  content,
  input,
  { measureCellFlow, maxDepth = MAX_NESTED_TABLE_DEPTH } = {},
) {
  const fail = (error) => ({ state: "unavailable", error });
  const tables = new Map(),
    hosts = new Map();
  const children = content.tables.filter(
    (table) =>
      table.section === input.table.section &&
      input.paragraphs.some((p) => p.paragraph === table.hostParagraph),
  );
  if (!children.length) return { state: "measured", tables, hosts, rowCount: 0 };
  let ownership;
  try {
    ownership = validateNestedTableOwnership(content);
  } catch {
    return fail("InvalidNestedTableFlow");
  }
  const inside = (section, paragraph, table) => {
    const row = ownership.paragraphs.get(`${section}:${paragraph}`);
    let owner = row?.tableCell
      ? ownership.tables.get(`${section}:${row.tableCell.tableNode}`)
      : null;
    while (owner) {
      if (owner === table) return true;
      owner =
        owner.parentTableNode == null
          ? null
          : ownership.tables.get(`${owner.section}:${owner.parentTableNode}`);
    }
    return false;
  };
  let rowCount = 0;
  for (const table of children) {
    if (
      table.parentTableNode !== input.table.tableNode ||
      table.parentListNode !== input.cell.listNode
    )
      return fail("InvalidNestedTableFlow");
    let ancestor = table,
      sourceDepth = 0;
    while (ancestor.parentTableNode != null) {
      if (++sourceDepth > MAX_NESTED_TABLE_DEPTH) return fail("NestedTableMeasurementLimit");
      ancestor = ownership.tables.get(`${ancestor.section}:${ancestor.parentTableNode}`);
    }
    if (
      sourceDepth === MAX_NESTED_TABLE_DEPTH &&
      content.tables.some(
        (child) => child.section === table.section && child.parentTableNode === table.tableNode,
      )
    )
      return fail("NestedTableMeasurementLimit");
    if (
      !measureCellFlow &&
      (content.createdTables ?? []).some((created) =>
        inside(created.section, created.hostParagraph, table),
      )
    )
      return fail("UnsupportedNestedCreatedTableDepth");
    if (
      (content.pictures ?? []).some((picture) => inside(picture.section, picture.paragraph, table))
    )
      return fail("UnsupportedCreatedSourceCellObjects");
    if (
      content.tables.some(
        (child) =>
          child !== table &&
          inside(child.section, child.hostParagraph, table) &&
          child.sourceGeometry?.geometry?.treat_as_character !== true,
      )
    )
      return fail("UnsupportedCreatedSourceCellObjects");
    const host = input.paragraphs.find((p) => p.paragraph === table.hostParagraph);
    if (
      !host ||
      !Number.isSafeInteger(table.anchorUnit) ||
      host.text[table.anchorUnit] !== "\ufffc"
    )
      return fail("InvalidInlineTableAnchorPosition");
    if (table.sourceGeometry?.geometry?.treat_as_character !== true)
      return fail("UnsupportedCreatedSourceCellObjects");
    if (rowCount >= input.maxRows) return fail("TableCellMeasurementLimit");
    const remainingDepth = Math.max(1, Math.min(maxDepth, MAX_NESTED_TABLE_DEPTH - sourceDepth));
    const measured = measureNestedTable(content, table, input.measure, {
      maxRows: input.maxRows - rowCount,
      maxDepth: remainingDepth,
      overflow: "visible",
      measureCellFlow,
    });
    if (measured.state !== "measured") return measured;
    const object = measureNestedInlineTableObject(
      table,
      measured,
      content.paragraphs,
      input.measure,
      input.maxRows - rowCount,
    );
    if (object.state !== "object-measured") return object;
    rowCount += object.rowCount;
    tables.set(table.tableNode, {
      table,
      measured,
      margins: object.outerInsets,
      captionReservation: object.captionReservation,
    });
    const key = `${table.section}:${table.hostParagraph}`,
      entries = hosts.get(key) ?? [];
    entries.push({
      tableNode: table.tableNode,
      unit: table.anchorUnit,
      width: object.width,
      height: object.height,
    });
    hosts.set(key, entries);
  }
  return { state: "measured", tables, hosts, rowCount };
}

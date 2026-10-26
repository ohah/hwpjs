import { paginateBodyRows } from "./page-row-flow.mjs";
import { paginateRepeatedTableBands } from "./repeated-table-band-pagination.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { columnReferenceBoxes } from "./column-reference-boxes.mjs";

// Header replay stays in the existing band paginator; it owns no source text.
export function paginateSplitInlineTables(rows, setting, flows, tables, options = {}) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    !(tables instanceof Map) ||
    !Array.isArray(rows) ||
    rows.some((row) => !row) ||
    !Array.isArray(flows) ||
    flows.some(
      (flow) => !flow || (flow.column_changes != null && !Array.isArray(flow.column_changes)),
    ) ||
    [...tables.values()].some(
      (value) => value?.split?.state !== "prepared" || value.split.prepared?.state !== "prepared",
    )
  )
    return fail("InvalidSplitInlineTablePagination");
  if (![...tables.values()].some(({ split }) => split.prepared.repeatedHeader))
    return paginateBodyRows(rows, setting, flows, options);
  const reference = pageReferenceBoxes(setting, { x: options.x ?? 20, y: options.y ?? 20 });
  if (reference.state !== "placed") return reference;
  const body = reference.boxes.page;
  for (const flow of flows) {
    for (const declaration of [
      flow.column_declaration,
      ...(flow.column_changes ?? []).map((change) => change?.declaration),
    ]) {
      if (
        declaration === undefined &&
        !options.columnZones &&
        options.columnDeclaration === undefined
      )
        continue;
      const columns = columnReferenceBoxes(body, declaration);
      if (
        columns.state !== "placed" ||
        columns.boxes.length !== 1 ||
        ["x", "y", "width", "height"].some((k) => columns.boxes[0][k] !== body[k])
      )
        return fail("UnsupportedRepeatedHeaderColumns");
    }
  }
  const nodes = [...tables.keys()],
    indices = new Map(nodes.map((node, i) => [node, i])),
    prepared = [...tables.values()].map(({ split }) => split.prepared);
  const indexed = rows.map((row) =>
    row.splitInlineTableNode === undefined
      ? row
      : { ...row, tableIndex: indices.get(row.splitInlineTableNode) },
  );
  const page = paginateRepeatedTableBands(
    indexed,
    setting,
    flows,
    { ...options, columnZones: false },
    prepared,
  );
  if (page.state !== "paginated") return page;
  return {
    ...page,
    rows: page.rows.map((row) =>
      row.repeatedTableHeader === true
        ? { ...row, splitInlineTableNode: nodes[row.tableIndex] }
        : row,
    ),
  };
}

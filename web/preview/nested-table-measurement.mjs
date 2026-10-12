import { validateNestedTableOwnership } from "./nested-table-ownership.mjs";
import { measureTableCells } from "./table-cell-measurement.mjs";
import { layoutContent } from "./layout.mjs";
import { measureInlineObjectParagraph } from "./inline-object-paragraph-measurement.mjs";
import { layoutInlineTablePageContent } from "./inline-table-page-content.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { sourceTableColumns } from "./table-source-columns.mjs";
import { textMeasurement } from "./text-measurement.mjs";

// 자식 표 크기를 선행 측정하고 현재 UTF-16 앵커에 부모 셀 흐름을 결합합니다.
export function measureNestedTable(content, root, measure, { maxRows = 20000, maxDepth = 64, overflow = "reject" } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (typeof measure !== "function" || !Number.isSafeInteger(maxRows) || maxRows < 1
    || !Number.isSafeInteger(maxDepth) || maxDepth < 1 || !["reject", "clip"].includes(overflow)) return unavailable("InvalidNestedTableMeasurement");
  let index;
  try { index = validateNestedTableOwnership(content); }
  catch { return unavailable("InvalidNestedTableFlow"); }
  if (index.tables.get(`${root?.section}:${root?.tableNode}`) !== root) return unavailable("InvalidNestedTableMeasurement");
  const hosts = new Map();
  for (const table of index.tables.values()) {
    if (table.parentTableNode == null) continue;
    const key = `${table.section}:${table.parentTableNode}:${table.parentListNode}:${table.hostParagraph}`;
    const children = hosts.get(key) ?? []; children.push(table); hosts.set(key, children);
  }
  const measureTable = (table, budget, depth) => {
    if (depth > maxDepth) return unavailable("NestedTableMeasurementLimit");
    const source = sourceTableColumns(table);
    if (source.state !== "resolved") return { ...source, section: table.section, tableNode: table.tableNode };
    return measureTableCells(table, content.paragraphs, measure, { origin: { x: 0, y: 0 }, padding: "source", maxRows: budget, compactLines: true,
      columnWidths: source.columns.map(hwpUnitPixels), minimumRowHeight: 0,
      paragraphFlows: content.paragraphFlows, pictures: content.pictures ?? [],
      measureCellFlow(input) {
        if (!input.paragraphs.some(p => hosts.has(`${table.section}:${table.tableNode}:${input.cell.listNode}:${p.paragraph}`))) return null;
        if (input.pictures.length || input.columnContext?.declaration?.count > 1) return unavailable("UnsupportedNestedCellContent");
        const rows = [], boxes = [], floatingTables = [];
        let height = 0;
        for (const paragraph of input.paragraphs) {
          const children = hosts.get(`${table.section}:${table.tableNode}:${input.cell.listNode}:${paragraph.paragraph}`) ?? [];
          const entries = [], measured = new Map();
          const floatingUnits = new Set();
          for (const child of children) {
            const floating = child.sourceGeometry?.geometry?.treat_as_character === false;
            if (child.sourceCaption || (floating ? ![2, 3].includes(child.sourceGeometry.text_wrap) || child.sourceGeometry.affect_line_spacing !== false : child.sourceGeometry?.geometry?.treat_as_character !== true)) return { ...unavailable("UnsupportedNestedTableAnchor"), tableNode: child.tableNode, parentTableNode: table.tableNode };
            const raw = child.sourceGeometry.out_margin;
            if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(v => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff)) return unavailable("MissingTableOuterInsets");
            const remaining = input.maxRows - rows.length;
            if (remaining < 1) return unavailable("TableCellMeasurementLimit");
            const childFlow = measureTable(child, remaining, depth + 1);
            if (childFlow.state !== "measured") return childFlow;
            if ([...childFlow.flows.values()].some(flow => flow.floatingTables?.length)) return unavailable("UnsupportedNestedFloatingDepth");
            if (floating) {
              if (!Number.isInteger(child.anchorUnit) || child.anchorUnit < 0 || paragraph.text[child.anchorUnit] !== "\ufffc" || floatingUnits.has(child.anchorUnit)) return unavailable("InvalidNestedFloatingTableOwner");
              floatingUnits.add(child.anchorUnit);
              floatingTables.push({ table: child, paragraph, measured: childFlow });
              continue;
            }
            const [left, right, top, bottom] = raw.map(hwpUnitPixels);
            const margins = { left, right, top, bottom };
            measured.set(child.tableNode, { child, childFlow, margins });
            entries.push({ objectNode: child.tableNode, unit: child.anchorUnit, width: childFlow.grid.width + left + right, height: childFlow.grid.height + top + bottom });
          }
          if (rows.length >= input.maxRows) return unavailable("TableCellMeasurementLimit");
          if (floatingUnits.size && entries.length) return unavailable("UnsupportedMixedNestedTableAnchors");
          const currentMeasure = (text, owner, unit, kind) => floatingUnits.has(unit) && kind === "text"
            ? { ...textMeasurement(measure("", owner, unit, kind)), width: 0 } : measure(text, owner, unit, kind);
          const flow = entries.length
            ? measureInlineObjectParagraph(paragraph, entries, input.width, measure, { maxRows: input.maxRows - rows.length, allowLineOverflow: overflow === "clip", compactLines: true })
            : layoutContent({ paragraphs: [paragraph], limited: false }, input.width, currentMeasure, input.maxRows - rows.length, { documentBody: true, compactLines: true });
          if (flow.state === "unavailable") return { ...flow, section: table.section, tableNode: table.tableNode,
            listNode: input.cell.listNode, paragraph: paragraph.paragraph, availableWidth: input.width,
            objects: entries.map(entry => ({ objectNode: entry.objectNode, unit: entry.unit, width: entry.width, height: entry.height })) };
          if (flow.limited) return unavailable("TableCellMeasurementLimit");
          rows.push(...flow.rows.map(row => ({ ...row, y: height + row.y,
            ...(entries.length || floatingUnits.size ? { inlineTables: [...entries.map(entry => ({ tableNode: entry.objectNode, unit: entry.unit })), ...children.filter(child => floatingUnits.has(child.anchorUnit)).map(child => ({ tableNode: child.tableNode, unit: child.anchorUnit }))] } : {}) })));
          for (const anchor of flow.anchors ?? []) {
            if (rows.length >= input.maxRows) return unavailable("TableCellMeasurementLimit");
            const { child, childFlow, margins } = measured.get(anchor.objectNode);
            const placement = { objectNode: child.tableNode, section: child.section, paragraph: child.hostParagraph, unit: child.anchorUnit,
              pageOrdinal: 0, columnOrdinal: 0, rectangle: { x: anchor.x, y: height + anchor.y, width: anchor.width, height: anchor.height } };
            const projected = layoutInlineTablePageContent(child, childFlow, placement, margins, { maxRows: input.maxRows - rows.length });
            if (projected.state !== "placed") return projected;
            rows.push(...projected.rows); boxes.push(...projected.boxes);
          }
          height += flow.height;
        }
        return { rows, boxes, height, width: input.width, limited: false, spatialRows: true, clipOverflow: overflow === "clip", ...(floatingTables.length ? { floatingTables } : {}) };
      } });
  };
  return measureTable(root, maxRows, 0);
}

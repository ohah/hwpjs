import {tableSourceFailure} from "./table-source-failure.mjs";
import { measureNestedTable } from "./nested-table-measurement.mjs";
import { projectOverlayTablePage } from "./overlay-table-page.mjs";
import { projectFloatingPicturePage } from "./picture-page-projection.mjs";
import { textMeasurement } from "./text-measurement.mjs";
import { tableAnchorCoverage } from "./table-anchor-coverage.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";

export const isOverlayTable = table => table?.parentTableNode == null
  && table.sourceGeometry?.geometry?.treat_as_character === false && [2, 3].includes(table.sourceGeometry.text_wrap);

/** Paginate normal body first; overlay cells never become cursor reservations. */
export function layoutOverlayTableBody(content, measure, maxRows, layoutBody, { minimumCellHeight } = {}) {
  const fail = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || typeof measure !== "function" || typeof layoutBody !== "function"
    || !Array.isArray(content?.tables) || !Array.isArray(content.paragraphs)) return fail("InvalidOverlayTableBody");
  const sourceFailure=tableSourceFailure(content);if(sourceFailure)return sourceFailure;
  const roots = content.tables.filter(isOverlayTable), removed = new Set(roots.map(t => `${t.section}:${t.tableNode}`));
  if (!roots.length) return fail("MissingOverlayTableSources");
  for (let size = -1; size !== removed.size;) {
    size = removed.size;
    for (const table of content.tables) if (removed.has(`${table.section}:${table.parentTableNode}`)) removed.add(`${table.section}:${table.tableNode}`);
  }
  const local = new Set(content.paragraphs.filter(p => removed.has(`${p.section}:${p.tableCell?.tableNode}`)).map(p => `${p.section}:${p.paragraph}`));
  if (content.drawings?.some(d => local.has(`${d.section}:${d.hostParagraph}`))
    || content.containers?.some(d => local.has(`${d.section}:${d.hostParagraph}`))
    || content.lines?.some(d => local.has(`${d.section}:${d.hostParagraph}`))
    || content.pictures?.some(p => local.has(`${p.section}:${p.paragraph}`) && p.geometry?.treatAsCharacter !== true)) return fail("UnsupportedOverlayTableDrawings");
  const anchors = roots.map(t => ({ section: t.section, paragraph: t.hostParagraph, anchorUnit: t.anchorUnit, node: t.tableNode }));
  for (const anchor of anchors) {
    const owners = content.paragraphs.filter(p => p.section === anchor.section && p.paragraph === anchor.paragraph);
    if (owners.length !== 1 || owners[0].tableCell || !Number.isSafeInteger(anchor.anchorUnit)
      || owners[0].text?.[anchor.anchorUnit] !== "\ufffc") return fail("InvalidOverlayTableHost");
  }
  const body = { ...content, tables: content.tables.filter(t => !removed.has(`${t.section}:${t.tableNode}`)),
    paragraphs: content.paragraphs.filter(p => !local.has(`${p.section}:${p.paragraph}`)),
    paragraphFlows: content.paragraphFlows?.filter(p => !local.has(`${p.section}:${p.paragraph}`)),
    pictures: content.pictures?.filter(p => !local.has(`${p.section}:${p.paragraph}`)),
    floatingDrawingAnchors: [...(content.floatingDrawingAnchors ?? []), ...anchors] };
  const bodyMeasure = (text, paragraph, unit, kind) => kind === "text" && anchors.some(a => a.section === paragraph.section && a.paragraph === paragraph.paragraph && a.anchorUnit === unit)
    ? { width: 0, height: textMeasurement(measure("", paragraph, unit, kind)).height } : measure(text, paragraph, unit, kind);
  const base = layoutBody(body, bodyMeasure, maxRows);
  if (base?.state !== "paginated") return base;
  if (base.limited || !Array.isArray(base.rows) || !Array.isArray(base.pages)) return fail("IncompleteOverlayTableBody");
  const result = { ...base, rows: base.rows.map(row => {
    const owned = anchors.filter(a => a.section === row.section && a.paragraph === row.paragraph && row.startUnit <= a.anchorUnit && a.anchorUnit < row.endUnit);
    return owned.length ? { ...row, inlineTables: [...(row.inlineTables ?? []), ...owned.map(a => ({ tableNode: a.node, unit: a.anchorUnit }))] } : row;
  }), boxes: [...(base.boxes ?? [])], tableAnchors: [...(base.tableAnchors ?? [])], flowPictures: [...(base.flowPictures ?? [])] };
  for (const table of roots) {
    const source = table.sourceGeometry, g = source.geometry;
    // Reuse the same current UTF-16 owner and paragraph-fragment reference policy as floating shapes.
    const reference = projectFloatingPicturePage({ state: "located", section: table.section, paragraph: table.hostParagraph,
      pictureNode: table.tableNode, anchorUnit: table.anchorUnit,
      geometry: { width: g.width, height: g.height, widthRelative: g.width_relative, heightRelative: g.height_relative,
        treatAsCharacter: false, horizontalOffset: g.horizontal_offset, verticalOffset: g.vertical_offset },
      position: { relations: [source.vertical_relative, source.horizontal_relative, source.vertical_alignment, source.horizontal_alignment] } }, content.paragraphs, base.rows);
    if (reference.state !== "placed") return { ...reference, tableNode: table.tableNode };
    const remaining = maxRows - result.rows.length;
    if (remaining < 1) return fail("OverlayTableLayoutLimit");
    const measured = measureNestedTable(content, table, measure, { maxRows: remaining, overflow: "visible", minimumCellHeight });
    if (measured.state !== "measured") return { ...measured, tableNode: table.tableNode };
    const host = base.rows.find(row => row.section === table.section && row.paragraph === table.hostParagraph && row.startUnit <= table.anchorUnit && row.endUnit > table.anchorUnit);
    const placed = projectOverlayTablePage(table, measured, reference.referenceBoxes,
      { pageOrdinal: reference.pageOrdinal, columnOrdinal: host?.columnOrdinal ?? 0, maxRows: remaining });
    if (placed.state !== "placed") return { ...placed, tableNode: table.tableNode };
    result.rows.push(...placed.rows); result.boxes.push(...placed.boxes); result.flowPictures.push(...(placed.flowPictures ?? []));
    result.tableAnchors.push({ section: table.section, tableNode: table.tableNode, hostParagraph: table.hostParagraph, anchorUnit: table.anchorUnit });
  }
  const controls = tableAnchorCoverage(content, result);
  if (controls.state !== "covered") return controls;
  const coverage = pageParagraphCoverage(content.paragraphs, [...result.rows, ...controls.rows]);
  if (coverage.state !== "complete") return coverage;
  return { ...result, rows: result.rows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x), spatialRows: true };
}

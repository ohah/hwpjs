import { tableSourceFailure } from "./table-source-failure.mjs";
import { mixedInlineTablePolicy } from "./mixed-inline-table-policy.mjs";
import { tablePageAnchorError } from "./table-page-anchor-policy.mjs";
import { measureTableCells } from "./table-cell-measurement.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { inlineTablePageFitHeight } from "./inline-table-page-fit.mjs";
import { tableSourceHorizontalLayout } from "./table-source-horizontal-layout.mjs";
import { inlinePictureIndex, picturePositionKey } from "./picture-inline.mjs";
import { pictureTextMeasure } from "./picture-text-measurement.mjs";
import { reserveTableCaptionSpace } from "./table-caption-page-reservation.mjs";
import { singleCellPictureColumn } from "./single-cell-picture-column.mjs";

// Keep source node/list ownership; never manufacture generated table identities.
export function measureSourceInlineTables(content, measure, maxRows) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (
    !Array.isArray(content?.paragraphs) ||
    !Array.isArray(content.tables ?? []) ||
    typeof measure !== "function" ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return unavailable("InvalidSourceInlineTables");
  const sourceFailure = tableSourceFailure(content, { includeCaptions: true });
  if (sourceFailure) return sourceFailure;
  const tables = new Map(),
    hosts = new Map();
  let rowCount = 0;
  for (const table of content.tables ?? []) {
    if (
      !table ||
      !Number.isSafeInteger(table.tableNode) ||
      table.tableNode < 0 ||
      !Array.isArray(table.cells) ||
      !table.cells.length
    )
      return unavailable("InvalidSourceInlineTables");
    const policy = mixedInlineTablePolicy(table, {
      whole: true,
      captions: true,
      diagnostics: content.tableGeometryErrors,
    });
    if (policy.state !== "supported") return policy;
    if (tables.has(table.tableNode)) return unavailable("AmbiguousTablePageHost");
    const anchorReason = tablePageAnchorError(table.sourceGeometry);
    if (anchorReason) return { ...unavailable("UnsupportedTablePageAnchor"), anchorReason };
    const host = content.paragraphs.find(
      (p) => p.section === table.section && p.paragraph === table.hostParagraph && !p.tableCell,
    );
    if (
      !host ||
      !Number.isSafeInteger(table.anchorUnit) ||
      host.text[table.anchorUnit] !== "\ufffc"
    )
      return unavailable("InvalidInlineTableAnchorPosition");
    const raw = table.sourceGeometry.out_margin;
    if (
      !Array.isArray(raw) ||
      raw.length !== 4 ||
      !raw.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff)
    )
      return unavailable("MissingTableOuterInsets");
    if (rowCount >= maxRows) return unavailable("TableCellMeasurementLimit");
    const horizontal = tableSourceHorizontalLayout(table);
    if (horizontal.state !== "resolved") return horizontal;
    const cellIds = new Set(table.cells.flatMap((cell) => cell.paragraphs));
    const pictures = (content.pictures ?? []).filter(
      (p) => p.section === table.section && cellIds.has(p.paragraph),
    );
    const inline = inlinePictureIndex({ ...content, pictures });
    if (
      pictures.some(
        (p) =>
          p.geometry?.treatAsCharacter === true &&
          !inline.get(picturePositionKey(p.section, p.paragraph, p.anchorUnit)),
      )
    )
      return unavailable("UnsupportedSourceTablePictures");
    const cellMeasure = pictureTextMeasure(inline, [], measure);
    const measured = measureTableCells(table, content.paragraphs, cellMeasure, {
      origin: { x: 0, y: 0 },
      padding: "source",
      maxRows: maxRows - rowCount,
      pictures,
      paragraphFlows: content.paragraphFlows,
      pictureReferences: singleCellPictureColumn,
      ...horizontal.gridOptions,
    });
    if (measured.state !== "measured") return measured;
    rowCount += measured.rowCount;
    const [left, right, top, bottom] = raw.map(hwpUnitPixels);
    const outerInsets = { left, right, top, bottom };
    let margins = outerInsets,
      captionReservation;
    if (table.sourceCaption) {
      if (rowCount >= maxRows) return unavailable("TableCellMeasurementLimit");
      const reserved = reserveTableCaptionSpace(
        table,
        content.paragraphs,
        { x: 0, y: 0, width: measured.grid.width, height: measured.grid.height },
        measure,
        margins,
        { maxRows: maxRows - rowCount },
      );
      if (reserved.state !== "reserved") return reserved;
      captionReservation = {
        ...reserved,
        owner: {
          section: table.section,
          tableNode: table.tableNode,
          captionNode: table.sourceCaption.caption_node,
          listNode: table.sourceCaption.list_node,
        },
      };
      rowCount += reserved.rowCount;
      margins = reserved.outerInsets;
    }
    tables.set(table.tableNode, {
      table,
      measured,
      margins,
      outerInsets,
      ...(captionReservation ? { captionReservation } : {}),
    });
    const key = `${table.section}:${table.hostParagraph}`,
      entries = hosts.get(key) ?? [];
    const height = measured.grid.height + margins.top + margins.bottom;
    const pageFitHeight = inlineTablePageFitHeight(table, height, margins);
    entries.push({
      tableNode: table.tableNode,
      unit: table.anchorUnit,
      width: measured.grid.width + margins.left + margins.right,
      height,
      ...(pageFitHeight < height ? { pageFitHeight } : {}),
    });
    hosts.set(key, entries);
  }
  return { state: "measured", tables, hosts, rowCount };
}

import { reserveTableVerticalFlow } from "./table-vertical-flow-reservation.mjs";
import { placeFloatingTable } from "./table-placement.mjs";
import { prepareTablePageBands, tablePageBandFragment } from "./table-page-bands.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";
import { projectTablePageFragments } from "./table-page-fragments.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { paragraphLineGeometry } from "./paragraph-geometry.mjs";
import {
  tableHorizontalOverflowBoundary,
  tableHorizontalBoundsContain,
} from "./table-horizontal-overflow-boundary.mjs";

/** Place one unsplit floating table; body wrapping/pagination remains caller-owned. */
export function placeWholeFloatingTablePage(
  table,
  measured,
  reference,
  paragraph,
  { anchorY, occupiedBottom, pageOrdinal = 0, maxRows = 20000 } = {},
) {
  const unavailable = (error) => ({ state: "unavailable", error });
  const source = table?.sourceGeometry,
    page = reference?.page;
  if (
    measured?.state !== "measured" ||
    !page ||
    !["none", "cell", "table"].includes(table.pagination?.page_break) ||
    source?.geometry?.treat_as_character !== false ||
    ![0, 1, 4].includes(source.text_wrap) ||
    ![0, 1, 2, 3].includes(source.text_flow)
  )
    return unavailable("UnsupportedWholeFloatingTablePage");
  if (
    !Number.isSafeInteger(pageOrdinal) ||
    pageOrdinal < 0 ||
    paragraph?.section !== table.section ||
    paragraph?.paragraph !== table.hostParagraph
  )
    return unavailable("InvalidWholeFloatingTableOwner");
  if (
    !Array.isArray(source.out_margin) ||
    source.out_margin.length !== 4 ||
    !source.out_margin.every(
      (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0x7fffffff,
    )
  )
    return unavailable("InvalidTableOuterInsets");
  const [left, right, top, bottom] = source.out_margin.map(hwpUnitPixels);
  const prepared = prepareTablePageBands(table, measured.grid.rows, "whole", {
    left,
    right,
    top,
    bottom,
  });
  if (prepared.state !== "prepared") return prepared;
  const reservation = reserveTableVerticalFlow(source, {
    anchorY,
    occupiedBottom,
    height: measured.grid.height + top + bottom,
    pageTop: page.y,
    pageBottom: page.y + page.height,
    paperTop: reference.paper?.y,
    paperBottom: reference.paper ? reference.paper.y + reference.paper.height : undefined,
  });
  if (reservation.state !== "reserved") return reservation;
  const relative = source.horizontal_relative,
    name = ["paper", "page", "column", "paragraph"][relative];
  const column = reference.column ?? page;
  const paragraphGeometry = paragraphLineGeometry(
    { ...paragraph.paragraphShape, alignment: 0 },
    column.width,
    0,
    true,
  );
  const boxes = {
    ...reference,
    column,
    paragraph: {
      ...column,
      x: column.x + paragraphGeometry.x,
      width: paragraphGeometry.width,
      y: anchorY,
    },
  };
  if (!name || !boxes[name] || boxes[name].width <= left + right)
    return unavailable("UnsupportedTablePageAnchor");
  if (relative !== 3)
    boxes[name] = {
      ...boxes[name],
      x: boxes[name].x + left,
      width: boxes[name].width - left - right,
    };
  const placement = placeFloatingTable(table, boxes);
  if (placement.state !== "placed") return unavailable("UnsupportedTablePageAnchor");
  const rectangle = {
    x: placement.rectangle.x,
    y: reservation.y + top,
    width: measured.grid.width,
    height: measured.grid.height,
  };
  const horizontalReference = { ...reference, column },
    margins = { left, right, top, bottom };
  const boundary = tableHorizontalOverflowBoundary(
    table,
    horizontalReference,
    rectangle.width,
    margins,
  );
  if (
    ![rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isFinite) ||
    !tableHorizontalBoundsContain(table, rectangle, horizontalReference, margins, boundary)
  )
    return unavailable("TablePageWidthOverflow");
  const fragment = tablePageBandFragment(prepared, {
    x: rectangle.x - left,
    y: reservation.y,
    bandOrdinal: 0,
    pageOrdinal,
    columnOrdinal: 0,
    referenceBoxes: { ...reference, column },
  });
  const padding = resolveTablePadding(table, "source");
  if (!padding) return unavailable("MissingTableSourceInsets");
  const projected = projectTablePageFragments(
    table,
    measured.grid,
    measured.flows,
    { state: "planned", fragments: [fragment] },
    { origin: { x: 0, y: 0 }, padding, maxRows },
  );
  if (projected.state !== "placed") return projected;
  return {
    ...projected,
    ...(boundary !== column
      ? {
          boxes: projected.boxes.map((box) =>
            box.tableNode === table.tableNode
              ? { ...box, horizontalOverflowBoundary: "paper" }
              : box,
          ),
        }
      : {}),
    rectangle,
    reservation,
    sourceWrap: source.text_wrap,
  };
}

import { prepareTablePageBands, tablePageBandFragment } from "./table-page-bands.mjs";
import { projectTablePageFragments } from "./table-page-fragments.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";
import { projectTablePageCaption } from "./table-caption-page-projection.mjs";

// 공통 인라인 개체 위치에 이미 측정한 표 셀을 투영합니다.
export function layoutInlineTablePageContent(
  table,
  measured,
  placement,
  outerInsets,
  options = {},
) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (
    table?.sourceGeometry?.geometry?.treat_as_character !== true ||
    (table.sourceCaption && options.captionReservation?.state !== "reserved")
  )
    return unavailable("UnsupportedInlineTablePageContent");
  if (table.sourceCaption) {
    const owner = options.captionReservation.owner;
    if (
      !owner ||
      owner.section !== table.section ||
      owner.tableNode !== table.tableNode ||
      owner.captionNode !== table.sourceCaption.caption_node ||
      owner.listNode !== table.sourceCaption.list_node
    )
      return unavailable("InvalidInlineTableCaptionOwner");
  }
  if (
    measured?.state !== "measured" ||
    placement?.objectNode !== table.tableNode ||
    placement.section !== table.section ||
    placement.paragraph !== table.hostParagraph ||
    placement.unit !== table.anchorUnit ||
    !Number.isSafeInteger(placement.pageOrdinal) ||
    placement.pageOrdinal < 0
  )
    return unavailable("InvalidInlineTablePageContent");
  const prepared = prepareTablePageBands(table, measured.grid?.rows, "whole", outerInsets);
  if (prepared.state !== "prepared") return prepared;
  const rectangle = placement.rectangle;
  if (
    !rectangle ||
    ![
      rectangle.x,
      rectangle.y,
      rectangle.width,
      rectangle.height,
      measured.grid.width,
      measured.grid.height,
    ].every(Number.isFinite) ||
    rectangle.width <= 0 ||
    rectangle.height <= 0 ||
    measured.grid.width <= 0 ||
    measured.grid.height <= 0 ||
    Math.abs(
      rectangle.width - measured.grid.width - prepared.margins.left - prepared.margins.right,
    ) > 1e-8 ||
    Math.abs(
      rectangle.height - measured.grid.height - prepared.margins.top - prepared.margins.bottom,
    ) > 1e-8
  )
    return unavailable("InvalidInlineTablePageContent");
  const padding = resolveTablePadding(table, "source");
  if (!padding) return unavailable("MissingTableSourceInsets");
  const fragment = tablePageBandFragment(prepared, {
    x: rectangle.x,
    y: rectangle.y,
    bandOrdinal: 0,
    pageOrdinal: placement.pageOrdinal,
    columnOrdinal: placement.columnOrdinal,
    referenceBoxes: placement.referenceBoxes,
  });
  const projected = projectTablePageFragments(
    table,
    measured.grid,
    measured.flows,
    { state: "planned", fragments: [fragment] },
    { origin: { x: 0, y: 0 }, padding, maxRows: options.maxRows },
  );
  if (projected.state !== "placed" || !table.sourceCaption) return projected;
  return projectTablePageCaption(table, options.captionReservation, projected, {
    maxRows: options.maxRows,
  });
}

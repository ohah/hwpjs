import { pageSequenceReference } from "./page-sequence-reference.mjs";
import { placeWholeFloatingTablePage } from "./whole-floating-table-page.mjs";
import { layoutFloatingCellPages } from "./floating-cell-page-layout.mjs";
import { inspectFloatingTablePlacement } from "./floating-table-placement-conflicts.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { tableHostProfile } from "./table-host-profile.mjs";

// Replan from measured source content, never move already projected fragments.
export function planFloatingTablePlacement(table, measured, setting, host, insets, content, placements, groups,
  { pageOrdinal, anchorY, maxRows, maxAttempts = 2000 } = {}) {
  const fail = error => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2000) return fail("InvalidFloatingTablePlacementBudget");
  const source = table?.sourceGeometry;
  if (!source || !Array.isArray(placements) || !Array.isArray(groups)) return fail("InvalidFloatingTablePlacementPlan");
  const movable = table.pagination?.page_break === "cell" && source.flow_with_text === true
    && source.vertical_relative === 2 && source.vertical_alignment === 0 && source.allow_overlap === false;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!Number.isSafeInteger(pageOrdinal) || pageOrdinal < 0 || pageOrdinal >= 2000) return fail("PageFlowLimit");
    const reference = pageSequenceReference(setting, pageOrdinal);
    if (reference.state !== "placed") return reference;
    const page = reference.boxes.page;
    let placement = placeWholeFloatingTablePage(table, measured, { ...reference.boxes, column: page }, host,
      { anchorY, occupiedBottom: anchorY, pageOrdinal, maxRows });
    if (placement.state === "next-page") {
      pageOrdinal++;
      const next = pageSequenceReference(setting, pageOrdinal);
      if (next.state !== "placed") return next;
      anchorY = next.boxes.page.y;
      continue;
    }
    const leadingTable = tableHostProfile(host, table)?.leading === true;
    if ((placement.error === "TableVerticalFlowHeightOverflow" || placement.error === "UnsupportedUnconfinedTableBodyOverflow"
      && source.flow_with_text === false && source.geometry.vertical_offset >= 0
      && hwpUnitPixels(source.geometry.vertical_offset) < page.height) && leadingTable && table.pagination.page_break === "cell") {
      placement = layoutFloatingCellPages(table, measured, setting, host, { pageOrdinal, anchorY, maxRows });
    }
    if (placement.state !== "placed") return { ...placement, section: placement.section ?? table.section, tableNode: placement.tableNode ?? table.tableNode };
    const inspected = inspectFloatingTablePlacement(table, placement, insets, content, placements, groups);
    if (inspected.state === "collected") return { state: "planned", placement, pageOrdinal: placement.firstPageOrdinal ?? pageOrdinal,
      anchorY: placement.anchorY ?? anchorY };
    if (inspected.error !== "UnsupportedFloatingTableCollision" || !movable) return inspected;
    const nextOrdinal = inspected.pageOrdinal;
    const next = pageSequenceReference(setting, nextOrdinal);
    if (next.state !== "placed") return next;
    const bottom = inspected.conflictingRectangle.y + inspected.conflictingRectangle.height;
    if (!Number.isFinite(bottom) || nextOrdinal < pageOrdinal || nextOrdinal === pageOrdinal && bottom <= anchorY) return fail("InvalidFloatingTablePlacementAdvance");
    pageOrdinal = nextOrdinal;
    anchorY = bottom;
    if (anchorY >= next.boxes.page.y + next.boxes.page.height) {
      pageOrdinal++;
      const following = pageSequenceReference(setting, pageOrdinal);
      if (following.state !== "placed") return following;
      anchorY = following.boxes.page.y;
    }
  }
  return fail("FloatingTablePlacementLimit");
}

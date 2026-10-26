import { projectNestedTableCellContent } from "./nested-table-cell-projection.mjs";
import { createCellRowBandIndex } from "./cell-row-band-index.mjs";
import { pictureAnchorRows } from "./picture-anchor-row-index.mjs";

// Request-local grid coordinates only. The caller rebinds physical page metadata.
export function prepareNestedCellCutIndex(flow, parent, insets, fragment, origin, maxRows) {
  const nested = projectNestedTableCellContent(flow, parent, insets, fragment, maxRows);
  if (nested.state !== "placed") return nested;
  const index = createCellRowBandIndex(
    [...nested.boxes, ...nested.rows].map((item) => ({
      y: item.y - origin.y,
      height: item.height,
      item,
    })),
  );
  if (index.state !== "prepared") return index;
  const pictureAnchors = nested.flowPictures?.length ? pictureAnchorRows(nested.rows) : null;
  if (nested.flowPictures?.length && !pictureAnchors)
    return { state: "unavailable", error: "InvalidNestedPictureProjection" };
  return { state: "prepared", nested, index, pictureAnchors, inspections: index.inspections };
}

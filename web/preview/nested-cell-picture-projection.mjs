import { translatePicturePlacement } from "./picture-placement-translation.mjs";
// Descendant image ownership stays on its own cell; only its position owner
// changes as the containing cell moves to a physical page.
import { pictureAnchorRows, pictureAnchorRow } from "./picture-anchor-row-index.mjs";
export function projectNestedCellPictures(
  flow,
  parent,
  insets,
  fragment,
  owners,
  rows,
  projectClip,
) {
  const fail = () => ({ state: "unavailable", error: "InvalidNestedPictureProjection" });
  const pictures = flow.nestedPictures ?? [];
  if (!Array.isArray(pictures) || pictures.length > 20000) return fail();
  if (!pictures.length) return { state: "placed", pictures: [] };
  const anchorRows = pictureAnchorRows(rows);
  if (!anchorRows) return fail();
  const projected = [],
    seen = new Set();
  for (const picture of pictures) {
    const cell = picture?.cell,
      r = picture?.rectangle;
    const key = `${picture?.section}:${picture?.pictureNode}`;
    if (
      !picture ||
      seen.has(key) ||
      picture.section !== parent.section ||
      ![picture.pictureNode, picture.paragraph, picture.anchorUnit].every(
        (v) => Number.isSafeInteger(v) && v >= 0,
      ) ||
      !owners.has(`${cell?.tableNode}:${cell?.listNode}`) ||
      ![0, 1, 2, 3].includes(picture.flow?.textWrap) ||
      !r ||
      ![r.x, r.y, r.width, r.height, r.x + r.width, r.y + r.height].every(Number.isFinite) ||
      r.width <= 0 ||
      r.height <= 0
    )
      return fail();
    if (!pictureAnchorRow(anchorRows, picture)) return fail();
    seen.add(key);
    const moved = translatePicturePlacement(
      picture,
      parent.x + insets.left,
      parent.y + insets.top,
      {
        pageOrdinal: fragment.pageOrdinal,
        columnOrdinal: fragment.columnOrdinal,
        referenceBoxes: fragment.referenceBoxes,
      },
    );
    if (moved.state !== "translated") return fail();
    const item = { ...moved.picture, positionOwnerTableNode: parent.tableNode };
    if (flow.clipOverflow === true || picture.pageClip !== undefined) {
      item.pageClip = projectClip(picture.pageClip);
      if (!item.pageClip) return fail();
    }
    projected.push(item);
  }
  return { state: "placed", pictures: projected };
}

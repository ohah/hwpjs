import { translatePicturePlacement } from "./picture-placement-translation.mjs";

function shifted(value, offset) {
  if (!Number.isFinite(value) || !Number.isFinite(offset) || !Number.isFinite(value + offset))
    throw new Error("InvalidSectionLayoutOffset");
  return value + offset;
}

function shiftedOrdinal(value, offset) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(value + offset) ||
    value + offset < 0
  )
    throw new Error("InvalidSectionPageOrdinal");
  return value + offset;
}

export function moveLayoutBox(box, offset, xOffset = 0) {
  return box == null
    ? box
    : {
        ...box,
        y: shifted(box.y, offset),
        ...(xOffset !== 0 ? { x: shifted(box.x, xOffset) } : {}),
      };
}

/** Affine rows retain local coordinates; only their world translation moves. */
export function moveLayoutRow(row, offset, ordinal, xOffset = 0) {
  const result = { ...row };
  if (!Number.isFinite(offset) || !Number.isFinite(xOffset))
    throw new Error("InvalidSectionLayoutOffset");
  if (row.pageOrdinal !== undefined) result.pageOrdinal = shiftedOrdinal(row.pageOrdinal, ordinal);
  if (row.transform !== undefined) {
    if (
      !Array.isArray(row.transform) ||
      row.transform.length !== 6 ||
      !row.transform.every(Number.isFinite)
    )
      throw new Error("InvalidSectionLayoutTransform");
    result.transform = [...row.transform];
    result.transform[4] = shifted(result.transform[4], xOffset);
    result.transform[5] = shifted(result.transform[5], offset);
    if (!Number.isFinite(result.transform[5])) throw new Error("InvalidSectionLayoutTransform");
  } else {
    result.y = shifted(row.y, offset);
    if (xOffset !== 0) result.x = shifted(row.x ?? 0, xOffset);
  }
  if (row.referenceBoxes)
    result.referenceBoxes = Object.fromEntries(
      Object.entries(row.referenceBoxes).map(([key, box]) => [
        key,
        moveLayoutBox(box, offset, xOffset),
      ]),
    );
  if (row.pageClip !== undefined) result.pageClip = moveLayoutBox(row.pageClip, offset, xOffset);
  if (row.inlineGroupPlacements !== undefined) {
    if (!Array.isArray(row.inlineGroupPlacements)) throw new Error("InvalidSectionLayoutOffset");
    result.inlineGroupPlacements = row.inlineGroupPlacements.map((item) =>
      moveLayoutPlacement(item, offset, ordinal, xOffset),
    );
  }
  return result;
}

export function moveLayoutPlacement(item, offset, ordinal, xOffset = 0) {
  let result = { ...item };
  if (!Number.isFinite(offset) || !Number.isFinite(xOffset))
    throw new Error("InvalidSectionLayoutOffset");
  if (item.pageOrdinal !== undefined)
    result.pageOrdinal = shiftedOrdinal(item.pageOrdinal, ordinal);
  const pictureFrame =
    item.pictureNode !== undefined ||
    item.flowRectangle !== undefined ||
    item.captionRows !== undefined;
  if (pictureFrame) {
    const physical = {
      ...(result.pageOrdinal !== undefined ? { pageOrdinal: result.pageOrdinal } : {}),
      ...(item.columnOrdinal !== undefined ? { columnOrdinal: item.columnOrdinal } : {}),
      ...(item.referenceBoxes
        ? {
            referenceBoxes: Object.fromEntries(
              Object.entries(item.referenceBoxes).map(([key, box]) => [
                key,
                moveLayoutBox(box, offset, xOffset),
              ]),
            ),
          }
        : {}),
    };
    const moved = translatePicturePlacement(item, xOffset, offset, physical);
    if (moved.state !== "translated") throw new Error(moved.error);
    result = moved.picture;
  }
  if (item.y !== undefined) result.y = shifted(item.y, offset);
  if (item.x !== undefined && xOffset !== 0) result.x = shifted(item.x, xOffset);
  if (item.pageClip !== undefined) result.pageClip = moveLayoutBox(item.pageClip, offset, xOffset);
  for (const key of [
    ...(pictureFrame ? [] : ["rectangle", "captionRectangle"]),
    "outerRectangle",
    "origin",
    "bounds",
    "footprint",
    "paintOrigin",
    "visualBounds",
  ])
    if (item[key]) result[key] = moveLayoutBox(item[key], offset, xOffset);
  if (item.referenceBoxes && !pictureFrame)
    result.referenceBoxes = Object.fromEntries(
      Object.entries(item.referenceBoxes).map(([key, box]) => [
        key,
        moveLayoutBox(box, offset, xOffset),
      ]),
    );
  return result;
}

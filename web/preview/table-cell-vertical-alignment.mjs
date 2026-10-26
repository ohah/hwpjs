import { translatePicturePlacement } from './picture-placement-translation.mjs';
/** Align measured flat content inside the final cell box, after row-span sizing. */
export function alignTableCellFlow(flow, cellHeight, insets, alignment = 0) {
  if (![0, 1, 2].includes(alignment)) throw new Error('UnsupportedCellVerticalAlignment');
  if (
    !flow ||
    !Array.isArray(flow.rows) ||
    ![flow.height, cellHeight, insets?.top, insets?.bottom].every(Number.isFinite) ||
    flow.height < 0 ||
    cellHeight <= 0 ||
    insets.top < 0 ||
    insets.bottom < 0
  )
    throw new Error('InvalidCellVerticalAlignment');
  // Top alignment adds no translation; retain existing projection overflow checks.
  if (alignment === 0) return flow;
  // Use the same addition order as grid content sizing; subtraction can lose an ulp.
  const required = flow.height + insets.top + insets.bottom;
  if (!Number.isFinite(required) || required > cellHeight)
    throw new Error('CellVerticalAlignmentOverflow');
  const shift = ((cellHeight - required) * alignment) / 2;
  if (!Number.isFinite(shift + flow.height)) throw new Error('InvalidCellVerticalAlignment');
  // 이미 영역을 채운 중첩 흐름은 이동할 필요가 없습니다.
  if (shift === 0) return flow;
  if (
    flow.cellPageBreaks !== undefined &&
    (!Array.isArray(flow.cellPageBreaks) ||
      !Array.from(flow.cellPageBreaks).every(
        (row) => row && Number.isFinite(row.y) && row.y >= 0 && row.y <= flow.height,
      ))
  )
    throw new Error('InvalidTableCellPageBreak');
  if (
    flow.floatingDrawings !== undefined &&
    (!Array.isArray(flow.floatingDrawings) ||
      !Array.from(flow.floatingDrawings).every(
        (item) =>
          item &&
          [item.start, item.end].every(Number.isFinite) &&
          item.start >= 0 &&
          item.end > item.start &&
          item.end <= flow.height &&
          item.rectangle &&
          [item.rectangle.x, item.rectangle.y, item.rectangle.width, item.rectangle.height].every(
            Number.isFinite,
          ),
      ))
  )
    throw new Error('InvalidCellFloatingDrawingReservation');
  // Floating tables are positioned later from their host paragraph rows. Moving
  // those rows here moves the table once; its source descriptor stays unchanged.
  if (
    flow.columns ||
    (flow.boxes?.length &&
      (flow.inlineCaptions?.length ||
        flow.rows.some((row) => row.pageClip || row.inlineGroupPlacements || row.transform) ||
        flow.boxes.some(
          (box) =>
            box.pageClip ||
            ![
              box.x,
              box.y,
              box.width,
              box.height,
              box.x + box.width,
              box.y + box.height + shift,
            ].every(Number.isFinite) ||
            box.y < 0 ||
            box.width <= 0 ||
            box.height <= 0 ||
            box.y + box.height > flow.height + 1e-8,
        )))
  )
    throw new Error('UnsupportedNestedCellVerticalAlignment');
  const movePicture = (picture) => {
    const moved = translatePicturePlacement(picture, 0, shift);
    if (moved.state !== 'translated') throw new Error('InvalidCellVerticalAlignment');
    return moved.picture;
  };
  return {
    ...flow,
    height: flow.height + shift,
    rows: flow.rows.map((row) => ({ ...row, y: row.y + shift })),
    ...(flow.floatingDrawings
      ? {
          floatingDrawings: flow.floatingDrawings.map((item) => ({
            ...item,
            start: item.start + shift,
            end: item.end + shift,
            rectangle: { ...item.rectangle, y: item.rectangle.y + shift },
          })),
        }
      : {}),
    ...(flow.cellPageBreaks
      ? { cellPageBreaks: flow.cellPageBreaks.map((row) => ({ ...row, y: row.y + shift })) }
      : {}),
    ...(flow.boxes?.length
      ? { boxes: flow.boxes.map((box) => ({ ...box, y: box.y + shift })) }
      : {}),
    ...(flow.flowPictures ? { flowPictures: flow.flowPictures.map(movePicture) } : {}),
    ...(flow.nestedPictures ? { nestedPictures: flow.nestedPictures.map(movePicture) } : {}),
  };
}

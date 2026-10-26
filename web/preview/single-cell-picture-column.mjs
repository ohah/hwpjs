import { columnReferenceBoxes } from './column-reference-boxes.mjs';

// A selected one-column cell list owns its local column content area.
// This is not the document/page column translated into a different cell.
export function singleCellPictureColumn(input) {
  if (
    input.columnContext?.state !== 'selected' ||
    input.columnContext.declaration?.count !== 1 ||
    !Number.isFinite(input.width) ||
    input.width <= 0 ||
    !Number.isFinite(input.height) ||
    input.height < 0
  )
    return undefined;
  // Before image-driven cell growth, zero content height is a valid horizontal
  // reference only for absolute-height, paragraph-top pictures.
  let allowZeroHeight =
    input.height === 0 && Array.isArray(input.pictures) && input.pictures.length > 0;
  if (allowZeroHeight)
    for (const p of input.pictures) {
      if (
        p?.geometry?.heightRelative !== 2 ||
        p.position?.relations?.[0] !== 2 ||
        p.position.relations[2] !== 0
      ) {
        allowZeroHeight = false;
        break;
      }
    }
  const selected = columnReferenceBoxes(
    { x: 0, y: 0, width: input.width, height: input.height },
    input.columnContext.declaration,
    1024,
    { allowZeroHeight },
  );
  return selected.state === 'placed' && selected.boxes.length === 1
    ? { column: selected.boxes[0] }
    : undefined;
}

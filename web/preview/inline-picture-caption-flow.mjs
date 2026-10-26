import { layoutPictureCaption } from './picture-caption-layout.mjs';
import { inlinePictureRowPlacement } from './inline-picture-row-placement.mjs';
import { pictureFramePaperFit } from './picture-caption-page-fit.mjs';

// Reserve and place through the existing caption engine. The image dimensions
// remain unchanged; only the containing inline frame includes the caption.
export function inlinePictureCaptionFrame(item, paragraphs, measure, maxRows) {
  const picture = item.picture;
  if (!picture.caption) return { state: 'none', height: item.height };
  const host = paragraphs.filter(
    (p) => p.section === picture.section && p.paragraph === picture.paragraph,
  );
  if (
    host.length !== 1 ||
    typeof host[0].text !== 'string' ||
    !Number.isSafeInteger(picture.anchorUnit) ||
    picture.anchorUnit < 0 ||
    host[0].text[picture.anchorUnit] !== '\ufffc' ||
    picture.caption.side !== 3 ||
    picture.caption.gap < 0 ||
    host[0].tableCell
  )
    return { state: 'unavailable', error: 'UnsupportedInlinePictureCaptionFlow' };
  const caption = layoutPictureCaption(
    picture,
    paragraphs,
    { x: 0, y: 0, width: item.width, height: item.height },
    measure,
    { maxRows },
  );
  if (caption.state !== 'positioned') return caption;
  if (
    caption.bounds.x < -1e-8 ||
    caption.bounds.y < -1e-8 ||
    caption.bounds.x + caption.bounds.width > item.width + 1e-8
  )
    return { state: 'unavailable', error: 'UnsupportedInlinePictureCaptionWidth' };
  return { state: 'reserved', height: caption.bounds.y + caption.bounds.height, caption };
}

export function projectInlinePictureCaptions(content, index, layout, measure, maxRows) {
  const added = [];
  for (const item of index.values()) {
    if (!item?.picture.caption) continue;
    const frame = inlinePictureCaptionFrame(
      item,
      content.paragraphs,
      measure,
      maxRows - layout.rows.length - added.length,
    );
    if (frame.state !== 'reserved') return frame;
    const hosts = layout.rows.flatMap((row, i) =>
      row.section === item.picture.section &&
      row.paragraph === item.picture.paragraph &&
      row.kind === 'text' &&
      row.startUnit <= item.picture.anchorUnit &&
      row.endUnit > item.picture.anchorUnit
        ? [{ row, i }]
        : [],
    );
    if (hosts.length !== 1 || hosts[0].row.transform !== undefined)
      return { state: 'unavailable', error: 'AmbiguousInlinePictureCaptionRow' };
    const { row, i } = hosts[0],
      placed = inlinePictureRowPlacement(item, row, i);
    if (placed.state !== 'placed') return placed;
    const paper = layout.pages.find((page) => page.ordinal === row.pageOrdinal)?.paper;
    if (pictureFramePaperFit({ ...placed.rectangle, height: frame.height }, paper).state !== 'fits')
      return { state: 'unavailable', error: 'InlinePictureCaptionPageOverflow' };
    const bottom = placed.origin.y + frame.height;
    if (bottom > row.y + row.height + 1e-8)
      return { state: 'unavailable', error: 'UnreservedInlinePictureCaption' };
    for (const captionRow of frame.caption.rows)
      added.push({
        ...captionRow,
        x: captionRow.x + placed.origin.x,
        y: captionRow.y + placed.origin.y,
        pageOrdinal: row.pageOrdinal,
        columnOrdinal: row.columnOrdinal,
        referenceBoxes: row.referenceBoxes,
      });
  }
  return { ...layout, rows: [...layout.rows, ...added] };
}

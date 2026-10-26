import { translatePicturePlacement } from './picture-placement-translation.mjs';
import { pictureFramePaperFit } from './picture-caption-page-fit.mjs';

// Captions stay drawing-owned text. They join page rows only after cell moves.
export function projectCellPictureCaptions(content, layout, maxRows) {
  const fail = (error) => ({ state: 'unavailable', error });
  const pictures = (layout.flowPictures ?? []).filter((p) => p.captionRows !== undefined);
  if (!pictures.length) return layout;
  if (!Array.isArray(layout.rows) || !Number.isSafeInteger(maxRows) || maxRows < 1)
    return fail('InvalidCellPictureCaptionProjection');
  const added = [],
    seen = new Set();
  for (const picture of pictures) {
    if (translatePicturePlacement(picture, 0, 0).state !== 'translated')
      return fail('InvalidCellPictureCaptionProjection');
    const key = `${picture.section}:${picture.pictureNode}`;
    const source = content.pictures.filter(
      (p) => p.section === picture.section && p.pictureNode === picture.pictureNode,
    );
    if (
      seen.has(key) ||
      source.length !== 1 ||
      !source[0].caption ||
      !picture.cell ||
      !Array.isArray(picture.captionRows)
    )
      return fail('InvalidCellPictureCaptionProjection');
    seen.add(key);
    const caption = source[0].caption;
    const members = content.paragraphs.filter(
      (p) => p.section === picture.section && p.drawingCaption?.drawingNode === picture.pictureNode,
    );
    if (
      !members.length ||
      members.some(
        (p) =>
          p.drawingCaption.captionNode !== caption.caption_node ||
          p.drawingCaption.listNode !== caption.list_node,
      )
    )
      return fail('DrawingCaptionBindingMismatch');
    const page = layout.pages?.find((p) => p.ordinal === picture.pageOrdinal);
    if (pictureFramePaperFit(picture.flowRectangle, page?.paper).state !== 'fits')
      return fail('PictureCaptionPageOverflow');
    for (const paragraph of members) {
      const rows = picture.captionRows
        .filter(
          (r) =>
            r.kind === 'text' &&
            r.section === picture.section &&
            r.paragraph === paragraph.paragraph,
        )
        .toSorted((a, b) => a.startUnit - b.startUnit);
      let cursor = 0;
      if (
        !rows.length ||
        layout.rows.some(
          (r) =>
            r.kind === 'text' &&
            r.section === paragraph.section &&
            r.paragraph === paragraph.paragraph,
        )
      )
        return fail('AmbiguousCellPictureCaptionRows');
      for (const row of rows) {
        if (
          row.startUnit !== cursor ||
          !Number.isSafeInteger(row.endUnit) ||
          row.endUnit < cursor ||
          row.text !== paragraph.text.slice(cursor, row.endUnit)
        )
          return fail('IncompleteCellPictureCaptionRows');
        cursor = row.endUnit;
      }
      if (cursor !== paragraph.text.length) return fail('IncompleteCellPictureCaptionRows');
    }
    const ids = new Set(members.map((p) => p.paragraph));
    for (const row of picture.captionRows) {
      if (
        !row ||
        row.section !== picture.section ||
        !ids.has(row.paragraph) ||
        row.pictureNode !== picture.pictureNode ||
        row.captionNode !== caption.caption_node ||
        row.listNode !== caption.list_node ||
        ![row.x, row.y, row.height, row.y + row.height].every(Number.isFinite) ||
        row.height <= 0
      )
        return fail('InvalidCellPictureCaptionProjection');
      if (layout.rows.length + added.length >= maxRows) return fail('PictureCaptionRowLimit');
      added.push({
        ...row,
        pageOrdinal: picture.pageOrdinal,
        columnOrdinal: picture.columnOrdinal,
        referenceBoxes: picture.referenceBoxes,
        positionOwnerTableNode: picture.positionOwnerTableNode ?? picture.cell.tableNode,
      });
    }
  }
  return {
    ...layout,
    rows: [...layout.rows, ...added].toSorted(
      (a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || (a.x ?? 0) - (b.x ?? 0),
    ),
  };
}

import { pageReferenceBoxes } from './page-reference-boxes.mjs';
import { columnReferenceBoxes } from './column-reference-boxes.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';

// A local scene frame is not a replacement for the document's physical paper.
export function notePlanningFrame(content, note, width, context) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (content?.pageSettings?.length !== 1 || !Number.isFinite(width) || width <= 0)
    return fail('InvalidNotePlanningFrame');
  const source = content.pageSettings[0],
    reference = pageReferenceBoxes(source, { x: 20, y: 20 });
  if (reference.state !== 'placed') return reference;
  if (Math.abs(reference.boxes.page.width - width) <= 1e-8)
    return { state: 'selected', setting: source, localColumn: false };
  if (
    note?.kind !== 'endnote' ||
    context?.state !== 'resolved' ||
    context.section !== note.section ||
    context.width !== width
  )
    return fail('UnsupportedNotePlanningWidth');
  const columns = columnReferenceBoxes(reference.boxes.page, context.declaration);
  if (
    columns.state !== 'placed' ||
    columns.boxes.length < 2 ||
    columns.boxes.some((box) => Math.abs(box.width - width) > 1e-8)
  )
    return fail('UnprovenNotePlanningColumn');
  const widthUnits = Math.round(width / hwpUnitPixels(1)),
    heightUnits = Math.round(reference.boxes.page.height / hwpUnitPixels(1));
  if (
    ![widthUnits, heightUnits].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 0xffffffff,
    ) ||
    Math.abs(hwpUnitPixels(widthUnits) - width) > 1e-8 ||
    Math.abs(hwpUnitPixels(heightUnits) - reference.boxes.page.height) > 1e-8
  )
    return fail('UnsupportedFractionalNotePlanningFrame');
  return {
    state: 'selected',
    localColumn: true,
    setting: {
      ...source,
      width: widthUnits,
      height: heightUnits,
      orientation: 'widely',
      gutter_type: 'left_only',
      duplicate_margins: 0,
      margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
    },
  };
}

export function columnNotePictureReference(picture) {
  if (picture.owner?.anchorNode !== picture.pictureNode) return true;
  const g = picture.geometry;
  if (![2, 3, 4].includes(g?.widthRelative) || g.heightRelative !== 2) return false;
  return (
    g.treatAsCharacter === true ||
    (g.treatAsCharacter === false &&
      picture.position?.relations?.[0] === 2 &&
      [2, 3].includes(picture.position?.relations?.[1]))
  );
}

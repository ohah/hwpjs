import { hwpUnitPixels } from "./hwp-units.mjs";
import { pictureLineRegions } from './picture-line-regions.mjs';
import { signedInt32 } from './signed-int32.mjs';

// An earlier, fully consumed picture need not block a later paragraph's table.
// Concurrent anchors and backwards table references still need joint solving.
export function nestedPictureTableSeparation(paragraph, tables, currentPictures, previousPictures, height, width) {
  const fail = reason => ({state:'unavailable',error:'UnsupportedNestedFloatingPictureTables',nestedFlowReason:reason});
  if (!paragraph || ![paragraph.section,paragraph.paragraph].every(n=>Number.isSafeInteger(n)&&n>=0) || !Array.isArray(tables) || !Array.isArray(currentPictures) || !Array.isArray(previousPictures)
    || ![height,width].every(Number.isFinite) || height < 0 || width <= 0) return fail('invalid-separation-input');
  if (currentPictures.some(p=>p?.section===paragraph.section&&p.paragraph===paragraph.paragraph)) return fail('same-paragraph-picture-table');
  let leadingMargin = 0;
  for (const entry of tables) {
    const source = entry?.table?.sourceGeometry;
    const offset = signedInt32(source?.geometry?.vertical_offset);
    const margin = Array.isArray(source?.out_margin) ? signedInt32(source.out_margin[2]) : null;
    if (source?.vertical_relative !== 2 || source.vertical_alignment !== 0 || offset === null || offset < 0 || margin === null)
      return fail('backward-table-reference');
    leadingMargin = Math.max(leadingMargin,hwpUnitPixels(margin));
  }
  const boundary = height - leadingMargin;
  for (const picture of previousPictures) {
    const rectangle = picture?.flowRectangle ?? picture?.rectangle;
    if (![0,1].includes(picture?.flow?.textWrap) || !rectangle || ![rectangle.y,rectangle.height,rectangle.y+rectangle.height].every(Number.isFinite)
      || rectangle.y+rectangle.height > boundary) return fail('active-previous-picture');
    const probe = pictureLineRegions({x:0,y:boundary,width,height:1},rectangle,{...picture.flow,textWrap:1});
    if (probe.state !== 'available' || probe.regions.length !== 1 || probe.regions[0].x !== 0 || probe.regions[0].width !== width)
      return fail('previous-picture-margin');
  }
  return {state:'separated'};
}

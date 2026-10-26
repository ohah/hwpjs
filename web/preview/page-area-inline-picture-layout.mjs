import { inlinePictureIndex } from './picture-inline.mjs';
import { pictureTextMeasure } from './picture-text-measurement.mjs';
import { layoutPageAreas } from './page-area-flow.mjs';
import { hasPictureSourceErrors } from './picture-source-validation.mjs';

/** Keep source picture identity while measuring each repeated area's own rows. */
export function layoutPageAreaInlinePictures(area, page, measure, maxRows) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    !area.pictures?.length ||
    ['tables', 'drawings', 'lines', 'containers'].some((key) => area[key]?.length) ||
    area.pictures.some((picture) => picture.caption != null || hasPictureSourceErrors(picture))
  )
    return fail('UnsupportedPageAreaObjects');
  const index = inlinePictureIndex(area);
  if (index.size !== area.pictures.length || [...index.values()].some((item) => !item))
    return fail('UnsupportedPageAreaObjects');
  return layoutPageAreas(area, [page], pictureTextMeasure(index, [], measure), maxRows);
}

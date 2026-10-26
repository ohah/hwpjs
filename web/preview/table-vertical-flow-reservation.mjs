import { signedInt32 } from './signed-int32.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';
import { tableVerticalReference } from './table-vertical-reference.mjs';
import { paragraphTableStart } from './paragraph-table-start.mjs';

// Resolve paragraph-flow or fixed page-relative non-overlapping reservations.
// The caller owns the current paragraph anchor and occupied content boundary.
export function reserveTableVerticalFlow(source, bounds) {
  if (!bounds) return { state: 'unavailable', error: 'InvalidTableVerticalFlow' };
  const { anchorY, occupiedBottom, height, pageTop, pageBottom } = bounds;
  const geometry = source?.geometry;
  const pageRelative =
    [0, 1].includes(source?.vertical_relative) && [0, 1, 2].includes(source?.vertical_alignment);
  if (
    geometry?.treat_as_character !== false ||
    (!pageRelative && (source.vertical_relative !== 2 || source.vertical_alignment !== 0)) ||
    ![true, false].includes(source.flow_with_text) ||
    source.allow_overlap !== false
  )
    return { state: 'unavailable', error: 'UnsupportedTableVerticalFlow' };
  const offset = signedInt32(geometry.vertical_offset);
  if (
    offset === null ||
    ![anchorY, occupiedBottom, height, pageTop, pageBottom].every(Number.isFinite) ||
    height <= 0 ||
    pageBottom <= pageTop ||
    anchorY < pageTop ||
    anchorY > pageBottom ||
    occupiedBottom < pageTop ||
    occupiedBottom > pageBottom ||
    !Number.isFinite(pageBottom - pageTop)
  )
    return { state: 'unavailable', error: 'InvalidTableVerticalFlow' };
  if (height > pageBottom - pageTop)
    return { state: 'unavailable', error: 'TableVerticalFlowHeightOverflow' };
  if (pageRelative) {
    const reference = tableVerticalReference(source, bounds);
    if (reference.state !== 'resolved')
      return { state: 'unavailable', error: 'InvalidTableVerticalFlow' };
    const requestedY = reference.y,
      bottom = reference.bottom;
    if (source.vertical_relative === 0 && reference.outsideBody)
      return { state: 'unavailable', error: 'UnsupportedPaperTableFlowOutsideBody' };
    if (![requestedY, bottom].every(Number.isFinite) || requestedY < pageTop || bottom > pageBottom)
      return { state: 'unavailable', error: 'TablePageAnchorOverflow' };
    if (requestedY < occupiedBottom) return { state: 'next-page', requestedY, height };
    return {
      state: 'reserved',
      requestedY,
      y: requestedY,
      bottom,
      gap: requestedY - occupiedBottom,
    };
  }
  const { requestedY, y: confinedY } = paragraphTableStart(
    anchorY,
    occupiedBottom,
    pageTop,
    hwpUnitPixels(offset),
  );
  const y = source.flow_with_text ? confinedY : requestedY;
  const bottom = y + height;
  if (![requestedY, y, bottom].every(Number.isFinite))
    return { state: 'unavailable', error: 'InvalidTableVerticalFlow' };
  if (!source.flow_with_text) {
    if (y < pageTop || bottom > pageBottom)
      return {
        state: 'unavailable',
        error: 'UnsupportedUnconfinedTableBodyOverflow',
        requestedY,
        bottom,
        height,
      };
    if (y < occupiedBottom)
      return {
        state: 'unavailable',
        error: 'UnsupportedUnconfinedTableBackwardFlow',
        requestedY,
        occupiedBottom,
        height,
      };
  }
  if (bottom > pageBottom) return { state: 'next-page', requestedY, height };
  return { state: 'reserved', requestedY, y, bottom, gap: y - occupiedBottom };
}

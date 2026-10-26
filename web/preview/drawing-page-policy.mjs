import { drawingAxisGeometry } from './drawing-axis-geometry.mjs';
import { drawingRotatedGeometry } from './drawing-rotated-geometry.mjs';
import { drawingScaledGeometry } from './drawing-scaled-geometry.mjs';
import { drawingWrapPagePolicyError } from './drawing-wrap-page-policy.mjs';
import { drawingHasNoShadow } from './drawing-shadow-policy.mjs';
import { drawingCollisionPolicy } from './drawing-collision-policy.mjs';

export function drawingPagePolicyError(
  source,
  placement,
  grouped,
  fill,
  allowRestricted = false,
  allowWrap = false,
) {
  if (
    !grouped &&
    !(
      drawingAxisGeometry(source) ||
      drawingRotatedGeometry(source) ||
      drawingScaledGeometry(source)
    )
  )
    return 'UnsupportedDrawingPageGeometry';
  if (!grouped && fill !== 'none' && !drawingAxisGeometry(source))
    return 'UnsupportedDrawingPageFill';
  if (!drawingHasNoShadow(source.paint)) return 'UnsupportedDrawingPageShadow';
  if ([0, 1].includes(placement.flow?.text_wrap)) {
    return allowWrap
      ? drawingWrapPagePolicyError(source, placement, grouped)
      : 'UnsupportedDrawingPageWrap';
  } else if (placement.flow?.text_wrap !== 3) return 'UnsupportedDrawingPageWrap';
  if (allowRestricted && !grouped && drawingCollisionPolicy(source).state === 'selected')
    return null;
  if (placement.position?.flags?.[1] !== false) return 'UnsupportedDrawingFlowWithText';
  if (placement.position?.flags?.[2] !== true) return 'UnsupportedDrawingOverlapPolicy';
  return null;
}

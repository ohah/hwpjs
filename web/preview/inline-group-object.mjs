import { hwpUnitPixels } from './hwp-units.mjs';
import { reserveInlineGroupCaption } from './inline-group-caption-reservation.mjs';

// One native group reservation contract for body and source-cell measurement.
export function inlineGroupObject(root, section, captionContext) {
  const source = root?.source,
    geometry = source?.geometry;
  if (
    !source ||
    root.section !== section ||
    source.container_node !== root.containerNode ||
    source.group_context !== null ||
    !Number.isSafeInteger(root.containerNode) ||
    root.containerNode < 0 ||
    geometry?.treat_as_character !== true ||
    geometry.width_relative !== 4 ||
    geometry.height_relative !== 2 ||
    ![geometry.width, geometry.height].every(
      (value) => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff,
    ) ||
    ![0, 1, 2, 3].includes(source.flow?.text_wrap) ||
    !Array.isArray(source.flow?.outside_margins) ||
    source.flow.outside_margins.length !== 4 ||
    !source.flow.outside_margins.every(
      (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff,
    )
  )
    return { state: 'unavailable', error: 'UnsupportedInlineGroupSource' };
  if (source.has_caption === true) {
    if (!captionContext) return { state: 'unavailable', error: 'UnsupportedInlineGroupSource' };
    const reserved = reserveInlineGroupCaption(
      root,
      captionContext.paragraphs,
      captionContext.measure,
      { maxRows: captionContext.maxRows },
    );
    if (reserved.state !== 'reserved') return reserved;
    return {
      state: 'measured',
      objectNode: root.containerNode,
      unit: root.anchorUnit,
      width: reserved.width,
      height: reserved.height,
      left: reserved.outerInsets.left,
      top: reserved.outerInsets.top,
      captionReservation: reserved,
    };
  }
  if (source.caption != null)
    return { state: 'unavailable', error: 'UnsupportedInlineGroupSource' };
  const [left, right, top, bottom] = source.flow.outside_margins.map(hwpUnitPixels);
  return {
    state: 'measured',
    objectNode: root.containerNode,
    unit: root.anchorUnit,
    width: hwpUnitPixels(geometry.width) + left + right,
    height: hwpUnitPixels(geometry.height) + top + bottom,
    left,
    top,
  };
}

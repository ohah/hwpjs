import { hwpUnitPixels } from "./hwp-units.mjs";
import { signedInt32 } from "./signed-int32.mjs";

const validBox = box => box && [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite) && box.width >= 0 && box.height >= 0;
export function alignedReferenceCoordinate(origin, extent, size, offset, alignment) {
  if (alignment === 0) return origin + offset;
  if (alignment === 1) return origin + (extent - size) / 2 + offset;
  if (alignment === 2) return origin + extent - size - offset;
  return null;
}

// 기준 사각형은 조판 호출자가 제공합니다. 화면 viewport를 페이지로 추정하지 않습니다.
export function placeFloatingPicture(picture, boxes, { edgePolicy } = {}) {
  const geometry = picture.geometry, position = picture.position;
  if (geometry?.treatAsCharacter !== false) return { state: "not_floating" };
  if (geometry.widthRelative !== 4 || geometry.heightRelative !== 2) return { state: "unsupported_size" };
  if (![geometry.width, geometry.height].every(value => Number.isInteger(value) && value > 0 && value <= 4294967295)) return { state: "invalid_size" };
  const relations = position?.relations;
  if (!Array.isArray(relations) || relations.length !== 4 || !relations.every(Number.isInteger)) return { state: "missing_position" };
  const [vertical, horizontal, verticalAlignment, horizontalAlignment] = relations;
  if (vertical < 0 || vertical > 2 || horizontal < 0 || horizontal > 3) return { state: "unsupported_reference" };
  const vbox = boxes?.[["paper", "page", "paragraph"][vertical]];
  const hbox = boxes?.[["paper", "page", "column", "paragraph"][horizontal]];
  if (!validBox(vbox) || !validBox(hbox)) return { state: "missing_reference" };
  const resolveAlignment = alignment => alignment <= 2 && alignment >= 0 ? alignment : edgePolicy === "inside-start-outside-end" && [3, 4].includes(alignment) ? alignment === 3 ? 0 : 2 : null;
  const va = resolveAlignment(verticalAlignment), ha = resolveAlignment(horizontalAlignment);
  if (va === null || ha === null) return { state: "unsupported_alignment" };
  const dx = signedInt32(geometry.horizontalOffset), dy = signedInt32(geometry.verticalOffset);
  if (dx === null || dy === null) return { state: "missing_offset" };
  const width = hwpUnitPixels(geometry.width), height = hwpUnitPixels(geometry.height);
  const x = alignedReferenceCoordinate(hbox.x, hbox.width, width, hwpUnitPixels(dx), ha);
  const y = alignedReferenceCoordinate(vbox.y, vbox.height, height, hwpUnitPixels(dy), va);
  if (![x, y, width, height, x + width, y + height].every(Number.isFinite)) return { state: "invalid_bounds" };
  return { state: "placed", rectangle: { x, y, width, height } };
}

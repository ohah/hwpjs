import { offsetPlacedCurveGeometry } from "./curve-rendering-geometry.mjs";
import { moveLayoutBox, moveLayoutPlacement } from "./layout-world-offset.mjs";

// 이미 변환된 경로의 월드 좌표만 이동합니다. 원본 행렬을 재적용하지 않습니다.
export function moveCurvePlacement(item, offset, ordinal, xOffset = 0) {
  if (item?.state !== "placed") throw new Error("InvalidSectionLayoutOffset");
  const geometry = offsetPlacedCurveGeometry(item, [xOffset, offset]);
  if (geometry.state !== "placed") throw new Error("InvalidSectionLayoutOffset");
  const result = moveLayoutPlacement({ ...item, bounds: undefined }, offset, ordinal, xOffset);
  result.commands = geometry.commands;
  result.bounds = geometry.bounds;
  for (const key of ["rootRectangle", "textRectangle"])
    if (item[key] !== undefined) {
      const box = item[key];
      if (
        !box ||
        ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
          Number.isFinite,
        ) ||
        box.width <= 0 ||
        box.height <= 0
      )
        throw new Error("InvalidSectionLayoutOffset");
      result[key] = moveLayoutBox(box, offset, xOffset);
    }
  return result;
}

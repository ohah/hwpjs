import { signedInt32 } from "./signed-int32.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

// Pixel edges assembled through different sums can differ by a few ULPs.
// Compare edges only; do not round source coordinates or absorb real overlap.
const edgeBefore = (a, b) =>
  a <= b || a - b <= 8 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));

// 확정된 그림 사각형 하나가 줄에 남기는 영역입니다. 페이지 배치는 호출자 책임입니다.
export function pictureLineRegions(line, rectangle, flow) {
  const valid = (box) =>
    box &&
    [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
      Number.isFinite,
    ) &&
    box.width >= 0 &&
    box.height > 0;
  if (!valid(line) || !valid(rectangle)) return { state: "invalid_bounds" };
  const full = () => ({ state: "available", regions: [{ x: line.x, width: line.width }] });
  if ([2, 3].includes(flow?.textWrap)) return full();
  if (![0, 1].includes(flow?.textWrap)) return { state: "unsupported_wrap" };
  const raw = flow.outsideMargins;
  if (!Array.isArray(raw) || raw.length !== 4) return { state: "missing_margins" };
  const margins = raw.map(signedInt32);
  if (margins.includes(null)) return { state: "missing_margins" };
  const [left, right, top, bottom] = margins.map(hwpUnitPixels);
  const x0 = rectangle.x - left,
    x1 = rectangle.x + rectangle.width + right;
  const y0 = rectangle.y - top,
    y1 = rectangle.y + rectangle.height + bottom;
  if (![x0, x1, y0, y1].every(Number.isFinite) || x1 < x0 || y1 <= y0)
    return { state: "invalid_margins" };
  if (edgeBefore(y1, line.y) || edgeBefore(line.y + line.height, y0)) return full();
  if (flow.textWrap === 1) return { state: "available", regions: [], nextY: y1 };
  if (![0, 1, 2, 3].includes(flow.textFlow)) return { state: "unsupported_flow" };
  if (edgeBefore(x1, line.x) || edgeBefore(line.x + line.width, x0)) return full();
  const l = { x: line.x, width: Math.max(0, Math.min(x0, line.x + line.width) - line.x) };
  const r = {
    x: Math.max(line.x, x1),
    width: Math.max(0, line.x + line.width - Math.max(line.x, x1)),
  };
  const selected =
    flow.textFlow === 0
      ? [l, r]
      : flow.textFlow === 1
        ? [l]
        : flow.textFlow === 2
          ? [r]
          : [l.width >= r.width ? l : r];
  const regions = selected.filter((region) => region.width > 0);
  return { state: "available", regions, ...(regions.length ? {} : { nextY: y1 }) };
}

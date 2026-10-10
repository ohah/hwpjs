// 같은 줄의 분리된 영역을 순서대로 소비합니다.
import { isHardLineBreak } from "./hard-line-break.mjs";
import { textMeasurement } from "./text-measurement.mjs";
export function regionTextFragments(text, startUnit, regions, measure) {
  if (typeof text !== "string" || !Number.isInteger(startUnit) || startUnit < 0 || startUnit > text.length) throw new RangeError("InvalidFragmentStart");
  const segments = new Intl.Segmenter("ko", { granularity: "grapheme" });
  if (startUnit !== text.length && segments.segment(text).containing(startUnit)?.index !== startUnit) throw new RangeError("InvalidFragmentStart");
  let previousEnd = -Infinity;
  for (const region of regions) {
    if (![region.x, region.width, region.x + region.width].every(Number.isFinite) || region.width < 0 || region.x < previousEnd) throw new RangeError("InvalidFragmentRegions");
    previousEnd = region.x + region.width;
  }
  const pending = segments.segment(text.slice(startUnit))[Symbol.iterator]();
  let current = pending.next();
  const fragments = [];
  let unit = startUnit;
  for (const region of regions) {
    let advance = 0, value = "", textHeight = 0;
    const boundaries = [{ unit, x: 0 }], begin = unit;
    while (!current.done) {
      if (isHardLineBreak(current.value.segment)) {
        textHeight = Math.max(textHeight, textMeasurement(measure("", unit)).height);
        value += current.value.segment; unit += current.value.segment.length;
        boundaries.push({ unit, x: advance });
        fragments.push({ x: region.x, width: region.width, text: value, startUnit: begin, endUnit: unit, boundaries, textHeight: Math.max(20, textHeight) });
        return { fragments, endUnit: unit, complete: false, hardBreak: true };
      }
      const segment = current.value.segment, measured = measure(segment, unit);
      const width = typeof measured === "number" ? measured : measured?.width;
      const height = typeof measured === "number" ? 20 : measured?.height;
      if (!Number.isFinite(width) || width < 0) throw new RangeError("InvalidTextMeasurement");
      if (!Number.isFinite(height) || height <= 0) throw new RangeError("InvalidTextMeasurement");
      if (advance + width > region.width) break;
      value += segment; unit += segment.length; advance += width; current = pending.next();
      textHeight = Math.max(textHeight, height);
      boundaries.push({ unit, x: advance });
    }
    if (value) fragments.push({ x: region.x, width: region.width, text: value, startUnit: begin, endUnit: unit, boundaries, textHeight });
    if (current.done) break;
  }
  return { fragments, endUnit: unit, complete: unit === text.length };
}

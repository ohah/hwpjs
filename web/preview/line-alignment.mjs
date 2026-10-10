import { isHardLineBreak } from "./hard-line-break.mjs";
import { paragraphAlignmentKey } from "./paragraph-alignments.mjs";

/** Display spacing only; the native document and source offsets stay untouched. */
export function alignTextRow(row, { lastLine = false } = {}) {
  const alignment = paragraphAlignmentKey(row.paragraphShape?.alignment);
  if (row.kind !== "text" || !["JUSTIFY", "DISTRIBUTE", "DISTRIBUTE_SPACE"].includes(alignment)) return row;
  const points = row.boundaries;
  const invalid = () => { throw new RangeError("InvalidLineAlignmentGeometry"); };
  if (!Array.isArray(points) || !points.length || !Number.isFinite(row.width) || row.width <= 0 || typeof row.text !== "string" || !Number.isSafeInteger(row.startUnit) || row.startUnit < 0 || row.endUnit !== row.startUnit + row.text.length || !Number.isSafeInteger(row.endUnit)) invalid();
  if (points[0]?.unit !== row.startUnit || points.at(-1)?.unit !== row.endUnit) invalid();
  for (const [index, point] of points.entries()) {
    if (!Number.isSafeInteger(point?.unit) || !Number.isFinite(point?.x) || point.x < 0 || index && (point.unit <= points[index - 1].unit || point.x < points[index - 1].x)) invalid();
  }
  if (points.length < 2) return row;
  const parts = points.slice(1).map((point, index) => row.text.slice(points[index].unit - row.startUnit, point.unit - row.startUnit));
  const forced = parts.some(isHardLineBreak);
  if (alignment !== "DISTRIBUTE" && (forced || alignment === "JUSTIFY" && lastLine)) return row;
  let visible = parts.length;
  while (visible && (/^ +$/u.test(parts[visible - 1]) || isHardLineBreak(parts[visible - 1]))) visible--;
  if (visible < 2) return row;
  const slack = row.width - points[visible].x;
  if (!Number.isFinite(slack) || slack <= 0) return row;
  const spaces = parts.slice(0, visible - 1).flatMap((part, index) => part === " " ? [index + 1] : []);
  const slots = alignment === "DISTRIBUTE" || alignment === "JUSTIFY" && !spaces.length
    ? Array.from({ length: visible - 1 }, (_, index) => index + 1) : spaces;
  if (!slots.length) return row;
  if (/[\t\ufffc]/u.test(row.text)) return { ...row, alignmentUnavailable: "UnsupportedAlignmentControl" };
  const increment = slack / slots.length;
  let slot = 0;
  const boundaries = points.map((point, index) => {
    while (slot < slots.length && slots[slot] <= index) slot++;
    const x = point.x + increment * slot;
    if (!Number.isFinite(x)) invalid();
    return { ...point, x };
  });
  return { ...row, boundaries };
}

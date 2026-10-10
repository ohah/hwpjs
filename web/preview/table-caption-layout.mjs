import { measureTableCaption } from "./table-caption-measurement.mjs";
import { positionTableCaption } from "./table-caption-position.mjs";

// Source width/alignment resolution belongs to the caller, not this composer.
export function layoutTableCaption(table, paragraphs, rectangle, measure, options = {}) {
  const measured = measureTableCaption(table, paragraphs, measure, options);
  if (measured.state !== "measured") return measured;
  return positionTableCaption(rectangle, measured, options);
}

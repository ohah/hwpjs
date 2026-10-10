import { layoutSourceTableCaption } from "./table-caption-source-layout.mjs";
import { tableInsets } from "./table-insets.mjs";

// Reserve current caption bounds before pagination; does not place page fragments.
export function reserveTableCaptionSpace(table, paragraphs, rectangle, measure, outerInsets, { maxRows = 20000 } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  const margins = tableInsets(outerInsets);
  if (!margins) return unavailable("InvalidTableOuterInsets");
  const caption = layoutSourceTableCaption(table, paragraphs, rectangle, measure, { maxRows });
  if (caption.state !== "positioned") return caption;
  const tableRight = rectangle.x + rectangle.width, tableBottom = rectangle.y + rectangle.height;
  const right = caption.bounds.x + caption.bounds.width, bottom = caption.bounds.y + caption.bounds.height;
  const reserved = {
    left: Math.max(margins.left, rectangle.x - caption.bounds.x),
    right: Math.max(margins.right, right - tableRight),
    top: Math.max(margins.top, rectangle.y - caption.bounds.y),
    bottom: Math.max(margins.bottom, bottom - tableBottom),
  };
  if (!Object.values(reserved).every(value => Number.isFinite(value) && value >= 0)) return unavailable("InvalidTableCaptionReservation");
  return { state: "reserved", outerInsets: reserved, caption, rectangle: { ...rectangle }, rowCount: caption.rows.length };
}

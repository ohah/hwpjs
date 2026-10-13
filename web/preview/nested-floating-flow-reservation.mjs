import { nestedParagraphReference } from "./nested-paragraph-reference.mjs";
import { alignedReferenceCoordinate } from "./picture-placement.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { signedInt32 } from "./signed-int32.mjs";

// Empty-anchor host paragraphs: reserve block floats, not behind/front overlays.
export function reserveNestedFloatingFlow(paragraph, flow, entries, origin) {
  const unavailable = error => ({ state: "unavailable", error });
  const reference = nestedParagraphReference(paragraph, flow, origin);
  if (reference.state !== "referenced") return reference;
  if (!Array.isArray(entries) || !Number.isFinite(flow.height) || flow.height < 0) return unavailable("InvalidNestedFloatingFlow");
  let bottom = origin.y + flow.height;
  for (const entry of entries) {
    const table = entry?.table;
    const source = table?.sourceGeometry, geometry = source?.geometry;
    if (!table || table.section !== paragraph.section || table.hostParagraph !== paragraph.paragraph || !Number.isInteger(table.anchorUnit) || table.anchorUnit < 0 || paragraph.text[table.anchorUnit] !== "\ufffc" || ![1, 2, 3].includes(source?.text_wrap)) return unavailable("InvalidNestedFloatingFlow");
    if (source?.text_wrap !== 1) continue;
    if (paragraph.text.replaceAll("\ufffc", "").trim() !== "" || source.vertical_relative !== 2 || source.vertical_alignment !== 0 || source.flow_with_text !== true || source.allow_overlap !== false || !Number.isInteger(geometry?.height) || geometry.height <= 0 || geometry.height > 0xffffffff) return unavailable("UnsupportedNestedFloatingBlockFlow");
    const offset = signedInt32(geometry.vertical_offset);
    if (offset === null) return unavailable("InvalidNestedFloatingFlow");
    const size = hwpUnitPixels(geometry.height);
    const y = alignedReferenceCoordinate(reference.rectangle.y, reference.rectangle.height, size, hwpUnitPixels(offset), 0);
    if (![y, y + size].every(Number.isFinite)) return unavailable("InvalidNestedFloatingFlow");
    bottom = Math.max(bottom, y + size);
  }
  return Number.isFinite(bottom) ? { state: "reserved", bottom } : unavailable("InvalidNestedFloatingFlow");
}

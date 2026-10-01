// Read-only presentation of native events. Never an edit model or save input.
import { clipText } from "./content.mjs";
const inlineText = { tab: "\t", fw_space: "\u3000", nb_space: "\u00a0", line_break: "↵", hypen: "\u00ad", unknown: "\ufffc" };

export function displayHwpxContent(result, { maxUnits = 200000, maxParagraphs = 20000 } = {}) {
  if (!Number.isInteger(maxUnits) || maxUnits < 0 || !Number.isInteger(maxParagraphs) || maxParagraphs < 0) throw new RangeError("InvalidDisplayBounds");
  const paragraphs = [], stack = [], seen = new Set();
  let units = 0, limited = false, textClipped = false;
  const append = (frame, text) => {
    if (!frame.visible) { if (text) limited = true; return; }
    if (textClipped) return;
    const clipped = clipText(text, maxUnits - units);
    if (clipped.length !== text.length) { limited = true; textClipped = true; }
    frame.value.text += clipped; units += clipped.length;
  };
  for (const event of result.events) {
    if (event.kind === "paragraph_start") {
      const key = `${event.section}:${event.paragraph}`;
      if (seen.has(key)) throw new Error("InvalidHwpxParagraphEvents");
      seen.add(key);
      const value = { section: event.section, paragraph: event.paragraph - 1, editable: false, label: `구역 ${event.section + 1} · 문단 ${event.paragraph}${stack.length ? " · 중첩" : ""} · HWPX 읽기 전용`, text: "" };
      const visible = paragraphs.length < maxParagraphs;
      if (visible) paragraphs.push(value); else limited = true;
      stack.push({ section: event.section, paragraph: event.paragraph, value, visible });
      continue;
    }
    const frame = stack.at(-1);
    if (!frame || frame.section !== event.section || frame.paragraph !== event.paragraph) throw new Error("InvalidHwpxParagraphEvents");
    if (event.kind === "paragraph_end") stack.pop();
    else if (event.kind === "content") append(frame, event.value);
    else if (event.kind === "inline_start" || event.kind === "inline_empty") append(frame, inlineText[event.inlineKind] ?? "");
  }
  if (stack.length || seen.size !== result.paragraphCount) throw new Error("InvalidHwpxParagraphEvents");
  return { format: "hwpx", version: null, readOnly: true, paragraphs, totalParagraphs: result.paragraphCount, limited };
}

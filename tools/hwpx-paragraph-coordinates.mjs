// Reader/API paragraphs are document-wide; XML oracles use section-local order.
export function hwpxParagraphCoordinates(events) {
  if (!Array.isArray(events)) throw new TypeError("InvalidParagraphEvents");
  let paragraph = 0, section = -1, localParagraph = 0;
  const rows = [];
  for (const event of events) {
    if (event.kind !== "paragraph_start") continue;
    if (!Number.isSafeInteger(event.section) || event.section < 0 || event.section < section || event.paragraph !== paragraph + 1) throw new Error("InvalidParagraphCoordinates");
    if (event.section !== section) { section = event.section; localParagraph = 0; }
    paragraph++; localParagraph++;
    rows.push({ section, paragraph, localParagraph });
  }
  return rows;
}

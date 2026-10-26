// Audit-only immutable source lookup, not an editor cache or saved document model.
export function hwpxParagraphTextIndex(events) {
  if (!Array.isArray(events)) throw new TypeError("InvalidParagraphEvents");
  const sections = new Map();
  for (const event of events) {
    if (event.kind !== "content") continue;
    let paragraphs = sections.get(event.section);
    if (!paragraphs) sections.set(event.section, (paragraphs = new Map()));
    let chunks = paragraphs.get(event.paragraph);
    if (!chunks) paragraphs.set(event.paragraph, (chunks = []));
    chunks.push(event.value);
  }
  for (const paragraphs of sections.values())
    for (const [paragraph, chunks] of paragraphs) paragraphs.set(paragraph, chunks.join(""));
  return (section, paragraph) => sections.get(section)?.get(paragraph) ?? "";
}

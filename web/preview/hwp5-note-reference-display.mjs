import { storedAutomaticNumberText } from './automatic-number-text.mjs';

// Reuse an agreed direct-body atno display; never interpret opaque note bytes.
export function attachHwp5NoteReferenceDisplay(content) {
  const paragraphs = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  for (const note of content.hwp5Notes ?? []) {
    const host = paragraphs.get(`${note.section}:${note.hostParagraph}`);
    if (
      !host ||
      host.text[note.anchorUnit] !== '\ufffc' ||
      host.automaticNumbers?.some((row) => row.unit === note.anchorUnit)
    )
      continue;
    const candidates = note.paragraphs.flatMap(
      (id) => paragraphs.get(`${note.section}:${id}`)?.automaticNumbers ?? [],
    );
    if (!candidates.length) continue;
    const number = candidates[0],
      expectedKind = note.kind === 'footnote' ? 1 : note.kind === 'endnote' ? 2 : null;
    if (
      expectedKind === null ||
      candidates.some(
        (candidate) =>
          candidate.hwp5Source?.kind !== expectedKind ||
          storedAutomaticNumberText(candidate.source) === null ||
          candidate.source.values.num !== number.source?.values.num ||
          candidate.source.format.supscript !== number.source?.format.supscript ||
          JSON.stringify(candidate.source.format.raw) !== JSON.stringify(number.source?.format.raw),
      )
    )
      continue;
    host.automaticNumbers ??= [];
    host.automaticNumbers.push({
      unit: note.anchorUnit,
      kind: 'hwp5-note-reference',
      noteNode: note.controlNode,
      numberNode: number.numberNode,
      numberNodes: candidates.map((candidate) => candidate.numberNode),
      source: number.source,
    });
  }
  return content;
}

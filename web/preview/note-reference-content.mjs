// Bind native current ownership; numbering values remain immutable source metadata.
export function attachNoteReferences(editor, content) {
  content.noteReferenceErrors = [];
  for (const paragraph of content.paragraphs) paragraph.automaticNumbers = (paragraph.automaticNumbers ?? []).filter(row => row.kind !== "note-reference");
  for (const section of new Set(content.paragraphs.map(p => p.section))) {
    try {
      const sources = new Map(editor.automaticNumberSources(section).map(row => [row.number_node, row]));
      for (const site of editor.noteReferenceSites(section)) {
        const paragraph = content.paragraphs.find(p => p.section === section && p.paragraph === site.paragraph - 1);
        if (!paragraph || paragraph.clipped) continue;
        const source = sources.get(site.number_node);
        if (!source || !["FOOTNOTE", "ENDNOTE"].includes(source.values?.raw?.[1]) || paragraph.text[site.anchor_unit] !== "\ufffc" || paragraph.automaticNumbers.some(row => row.unit === site.anchor_unit)) {
          content.noteReferenceErrors.push({ section, noteNode: site.note_node, error: "NoteReferenceBindingMismatch" });
          continue;
        }
        paragraph.automaticNumbers.push({ numberNode: site.number_node, anchorNode: site.anchor_node, noteNode: site.note_node, unit: site.anchor_unit, source, kind: "note-reference" });
      }
    } catch (error) { content.noteReferenceErrors.push({ section, error: error.message }); }
  }
  return content;
}

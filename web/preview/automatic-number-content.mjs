import { createAutomaticNumberDisplaySnapshot } from "./automatic-number-display-snapshot.mjs";
function retainedNoteSource(source, site) {
  return (
    source &&
    source.anchor_node === site.anchor_node &&
    site.anchor_unit === 0 &&
    ["FOOTNOTE", "ENDNOTE"].includes(source.values?.raw?.[1])
  );
}

/** Only native-owned note numbers can be outside the plain editable coordinate space. */
export function retainedAutomaticNumberPlainText(
  editor,
  section,
  paragraph,
  _flattenedText,
  anchored,
  snapshot = createAutomaticNumberDisplaySnapshot(editor),
) {
  if (!anchored.startsWith("\ufffc")) return anchored;
  const { sources, sites } = snapshot(section);
  for (const site of sites) {
    if (site.paragraph === paragraph && retainedNoteSource(sources.get(site.number_node), site)) {
      // The plain snapshot concatenates text sites and omits retained tabs/spaces.
      // Native editability owns the retained-prefix policy; preserve every other
      // canonical anchor-text unit rather than comparing different projections.
      if (editor.canEdit(section, paragraph) !== true) return anchored;
      return anchored.slice(1);
    }
  }
  return anchored;
}

// Derived metadata; plain retained prefixes never change editable offsets.
export function attachAutomaticNumbers(
  editor,
  content,
  snapshot = createAutomaticNumberDisplaySnapshot(editor),
) {
  content.automaticNumberErrors = [];
  for (const paragraph of content.paragraphs) {
    paragraph.automaticNumbers = [];
    paragraph.automaticNumberPrefixes = [];
  }
  const paragraphs = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  const sections = [...new Set(content.paragraphs.map((p) => p.section))];
  for (const section of sections) {
    try {
      const { sources, sites } = snapshot(section);
      for (const site of sites) {
        if (site.paragraph === null) continue;
        const paragraph = paragraphs.get(`${section}:${site.paragraph - 1}`);
        if (!paragraph || paragraph.clipped) continue;
        const source = sources.get(site.number_node);
        // canEdit applies the native retained-note-prefix policy. Verify both
        // projections exactly instead of guessing from the number type alone.
        if (
          retainedNoteSource(source, site) &&
          paragraph.plainEditable &&
          editor.canEdit(section, site.paragraph) &&
          editor.anchorText(section, site.paragraph) === "\ufffc" + paragraph.text
        ) {
          paragraph.automaticNumberPrefixes.push({
            numberNode: site.number_node,
            anchorNode: site.anchor_node,
            source,
          });
          continue;
        }
        if (
          !source ||
          source.anchor_node !== site.anchor_node ||
          paragraph.text[site.anchor_unit] !== "\ufffc"
        ) {
          content.automaticNumberErrors.push({
            section,
            numberNode: site.number_node,
            error: "AutomaticNumberBindingMismatch",
          });
          continue;
        }
        paragraph.automaticNumbers.push({
          numberNode: site.number_node,
          anchorNode: site.anchor_node,
          unit: site.anchor_unit,
          source,
        });
      }
    } catch (error) {
      content.automaticNumberErrors.push({ section, error: error.message });
    }
  }
  return content;
}

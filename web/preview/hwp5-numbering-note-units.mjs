import { validateHwp5NoteSources } from "../../js/hwp5-note-sources.mjs";
import { sourceDisplayPosition } from "./text-offsets.mjs";

// Classify validated references only; this does not grant note layout support.
export function hwp5NumberingNoteUnits(content, paragraph) {
  const fail = () => {
    throw new Error("AmbiguousHwp5NumberingNoteAnchor");
  };
  if ((content.hwp5NoteErrors ?? []).some((row) => row.section === paragraph.section)) fail();
  const notes = (content.hwp5Notes ?? []).filter((row) => row.section === paragraph.section);
  try {
    validateHwp5NoteSources(notes.map((row) => row.source));
  } catch {
    fail();
  }
  const result = new Map();
  for (const note of notes) {
    const source = note.source;
    if (
      note.kind !== source.kind ||
      note.controlNode !== source.control_node ||
      note.listNode !== source.list_node ||
      note.hostParagraph !== source.paragraph
    )
      fail();
    if (note.hostParagraph !== paragraph.paragraph) continue;
    let unit, end;
    try {
      unit = sourceDisplayPosition(
        source.current_unit,
        paragraph.sourceOffsets,
        paragraph.text.length,
      );
      end = sourceDisplayPosition(
        source.current_unit + 8,
        paragraph.sourceOffsets,
        paragraph.text.length,
      );
    } catch {
      fail();
    }
    if (
      paragraph.clipped ||
      note.anchorUnit !== unit ||
      end !== unit + 1 ||
      paragraph.text[unit] !== "\ufffc"
    )
      fail();
    const members = (content.currentParagraphFlows ?? []).filter(
      (row) =>
        row.section === note.section &&
        row.host === note.kind &&
        row.list_node === note.listNode &&
        row.parent_node === note.controlNode,
    );
    if (
      !members.length ||
      !Array.isArray(note.paragraphs) ||
      members.length !== note.paragraphs.length ||
      new Set(note.paragraphs).size !== note.paragraphs.length ||
      members.some(
        (row, i) =>
          row.paragraph !== note.paragraphs[i] ||
          content.paragraphs.filter(
            (p) => p.section === note.section && p.paragraph === row.paragraph && !p.clipped,
          ).length !== 1,
      )
    )
      fail();
    if (result.has(note.controlNode) && result.get(note.controlNode) !== unit) fail();
    result.set(note.controlNode, unit);
  }
  return result;
}

import { validateHwp5NoteSources } from '../../js/hwp5-note-sources.mjs';
import { sourceDisplayPosition } from './text-offsets.mjs';
import { attachHwp5NoteShapes } from './hwp5-note-shape-content.mjs';

/** Current note body membership and reference boundary, without inventing page policy. */
export function attachHwp5Notes(editor, content) {
  content.hwp5Notes = [];
  content.hwp5NoteErrors = [];
  if (!editor) return attachHwp5NoteShapes(editor, content);
  const flows = content.currentParagraphFlows ?? [];
  for (const section of new Set(
    flows.filter((row) => ['footnote', 'endnote'].includes(row.host)).map((row) => row.section),
  )) {
    try {
      const sources = validateHwp5NoteSources(editor.noteSources(section)),
        prepared = [],
        positions = new Map(),
        paragraphIds = new Set();
      for (const paragraph of content.paragraphs.filter((row) => row.section === section)) {
        if (paragraphIds.has(paragraph.paragraph)) throw new Error('AmbiguousHwp5NoteParagraph');
        paragraphIds.add(paragraph.paragraph);
      }
      const members = flows.filter(
        (row) => row.section === section && ['footnote', 'endnote'].includes(row.host),
      );
      if (new Set(members.map((row) => row.paragraph)).size !== members.length)
        throw new Error('AmbiguousHwp5NoteBody');
      for (const source of sources) {
        const paragraph = content.paragraphs.find(
          (row) => row.section === section && row.paragraph === source.paragraph,
        );
        if (!paragraph || paragraph.clipped) throw new Error('MissingHwp5NoteReferenceParagraph');
        const unit = sourceDisplayPosition(
          source.current_unit,
          paragraph.sourceOffsets,
          paragraph.text.length,
        );
        const end = sourceDisplayPosition(
          source.current_unit + 8,
          paragraph.sourceOffsets,
          paragraph.text.length,
        );
        if (end !== unit + 1 || paragraph.text[unit] !== '\ufffc')
          throw new Error('Hwp5NoteReferenceMismatch');
        const key = `${source.paragraph}:${unit}`,
          owner = positions.get(key);
        if (owner !== undefined && owner !== source.control_node)
          throw new Error('AmbiguousHwp5NoteReference');
        positions.set(key, source.control_node);
        const body = members.filter(
          (row) =>
            row.host === source.kind &&
            row.list_node === source.list_node &&
            row.parent_node === source.control_node,
        );
        if (
          !body.length ||
          body.some(
            (row) =>
              !content.paragraphs.some(
                (p) => p.section === section && p.paragraph === row.paragraph && !p.clipped,
              ),
          )
        )
          throw new Error('MissingHwp5NoteBody');
        prepared.push({
          section,
          kind: source.kind,
          controlNode: source.control_node,
          listNode: source.list_node,
          hostParagraph: source.paragraph,
          anchorUnit: unit,
          paragraphs: body.map((row) => row.paragraph),
          source,
        });
      }
      if (
        members.some(
          (row) =>
            !prepared.some(
              (note) =>
                note.kind === row.host &&
                note.listNode === row.list_node &&
                note.controlNode === row.parent_node,
            ),
        )
      )
        throw new Error('IncompleteHwp5NoteSources');
      content.hwp5Notes.push(...prepared);
    } catch (error) {
      content.hwp5NoteErrors.push({ section, error: error.message });
    }
  }
  return attachHwp5NoteShapes(editor, content);
}

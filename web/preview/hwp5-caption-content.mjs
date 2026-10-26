import { validateHwp5CaptionSources } from '../../js/hwp5-caption-sources.mjs';
import { attachHwp5CaptionGeometry } from './hwp5-caption-geometry.mjs';

export function attachHwp5Captions(editor, content) {
  content.hwp5Captions = [];
  content.hwp5CaptionErrors = [];
  if (!editor) return attachHwp5CaptionGeometry(content);
  const flows = content.currentParagraphFlows ?? [];
  for (const section of new Set(
    flows.filter((row) => row.host === 'table_caption').map((row) => row.section),
  )) {
    try {
      const sources = validateHwp5CaptionSources(editor.captionSources(section));
      const members = flows.filter(
          (row) => row.section === section && row.host === 'table_caption',
        ),
        prepared = [];
      if (new Set(members.map((row) => row.paragraph)).size !== members.length)
        throw new Error('AmbiguousHwp5CaptionFlow');
      const paragraphs = content.paragraphs.filter((row) => row.section === section);
      if (new Set(paragraphs.map((row) => row.paragraph)).size !== paragraphs.length)
        throw new Error('AmbiguousHwp5CaptionParagraph');
      for (const source of sources) {
        const tables = (content.tables ?? []).filter(
          (row) => row.section === section && row.tableNode === source.table_record_node,
        );
        if (tables.length !== 1 || tables[0].layoutSource?.table_node !== source.control_node)
          throw new Error('Hwp5CaptionTableMismatch');
        const body = members.filter(
          (row) => row.list_node === source.list_node && row.parent_node === source.control_node,
        );
        if (
          !body.length ||
          body.some((row) => !paragraphs.some((p) => p.paragraph === row.paragraph && !p.clipped))
        )
          throw new Error('MissingHwp5CaptionBody');
        prepared.push({
          section,
          tableNode: source.table_record_node,
          controlNode: source.control_node,
          listNode: source.list_node,
          paragraphs: body.map((row) => row.paragraph),
          source,
        });
      }
      if (
        members.some(
          (row) =>
            !prepared.some(
              (caption) =>
                caption.listNode === row.list_node && caption.controlNode === row.parent_node,
            ),
        )
      )
        throw new Error('IncompleteHwp5CaptionSources');
      content.hwp5Captions.push(...prepared);
    } catch (error) {
      content.hwp5CaptionErrors.push({ section, error: error.message });
    }
  }
  return attachHwp5CaptionGeometry(content);
}

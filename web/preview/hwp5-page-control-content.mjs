import { validateHwp5PageControlSources } from '../../js/hwp5-page-control-sources.mjs';
import { sourceDisplayPosition } from './text-offsets.mjs';

// Diagnostics do not grant permission to ignore or apply page control semantics.
export function attachHwp5PageControls(editor, content) {
  content.pageControlSources = [];
  content.pageControlSourceErrors = [];
  for (const paragraph of content.paragraphs) paragraph.pageControls = [];
  if (!editor) return content;
  for (let section = 0; section < editor.sectionCount(); section++) {
    try {
      const rows = validateHwp5PageControlSources(editor.pageControlSources(section));
      const projected = rows.map((row) => {
        const owners = content.paragraphs.filter(
          (p) => p.section === section && p.paragraph === row.paragraph,
        );
        if (owners.length !== 1 || owners[0].clipped)
          throw new Error('Hwp5PageControlOwnerMismatch');
        const paragraph = owners[0],
          unit = sourceDisplayPosition(
            row.current_unit,
            paragraph.sourceOffsets,
            paragraph.text.length,
          );
        const end = sourceDisplayPosition(
          row.current_unit + 8,
          paragraph.sourceOffsets,
          paragraph.text.length,
        );
        if (end !== unit + 1 || paragraph.text[unit] !== '\ufffc')
          throw new Error('Hwp5PageControlAnchorMismatch');
        return { ...row, section, unit };
      });
      content.pageControlSources.push(...projected);
      for (const row of projected)
        content.paragraphs
          .find((p) => p.section === section && p.paragraph === row.paragraph)
          .pageControls.push(row);
    } catch (error) {
      content.pageControlSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}

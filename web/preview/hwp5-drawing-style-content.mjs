import { validateHwp5DrawingStyleSources } from '../../js/hwp5-drawing-style-sources.mjs';

// Exact observed profiles, not a range cutoff or fallback after a failed parse.
export function attachHwp5DrawingStyles(editor, content) {
  content.hwp5DrawingStyles = [];
  content.hwp5DrawingStyleErrors = [];
  if (!editor) return content;
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      if (content.hwp5DrawingMatrixErrors?.some((row) => row.section === section))
        throw new Error('IncompleteHwp5DrawingMatrices');
      const components = (content.hwp5DrawingMatrices ?? []).filter(
        (row) => row.section === section && row.kind === 'translation',
      );
      const owners = new Map(components.map((row) => [row.component_node, row.owner_node]));
      if (owners.size !== components.length) throw new Error('AmbiguousHwp5DrawingStyleOwner');
      const version = typeof editor.fileVersion === 'function' ? editor.fileVersion() : null;
      const tail = [0x05000300, 0x05000500, 0x05010001, 0x05010100].includes(version)
        ? 'alpha_shadow_metadata'
        : 'fill_only';
      const rows = validateHwp5DrawingStyleSources(
        editor.drawingStyleSources(section, { border: 'observed13', tail }),
      );
      for (const row of rows) {
        if (!owners.has(row.component_node) || owners.get(row.component_node) !== row.owner_node)
          throw new Error('Hwp5DrawingStyleOwnerMismatch');
        if (
          tail === 'fill_only'
            ? row.alpha !== null || row.shadow !== null || row.metadata !== null
            : row.fill_known && (row.alpha === null || row.shadow === null || row.metadata === null)
        )
          throw new Error('Hwp5DrawingStyleProfileMismatch');
      }
      for (const corner of (content.hwp5DrawingCorners ?? []).filter(
        (row) => row.section === section,
      )) {
        if (!rows.some((row) => row.component_node === corner.component_node))
          throw new Error('MissingHwp5RectangleStyle');
      }
      content.hwp5DrawingStyles.push(
        ...rows.map((row) => ({
          ...row,
          section,
          fileVersion: version,
          borderLayout: 'observed13',
          tailLayout: tail,
        })),
      );
    } catch (error) {
      content.hwp5DrawingStyleErrors.push({ section, error: error.message });
    }
  }
  return content;
}

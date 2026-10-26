import { validateHwp5DrawingComponentSources } from '../../js/hwp5-drawing-component-sources.mjs';

export function attachHwp5DrawingComponents(editor, content) {
  content.hwp5DrawingComponents = [];
  content.hwp5DrawingComponentErrors = [];
  if (!editor) return content;
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      const rows = validateHwp5DrawingComponentSources(editor.drawingComponentSources(section));
      const roots = content.hwp5Drawings.filter((row) => row.section === section);
      const declared = rows.filter((row) => row.second_id !== null);
      if (
        roots.length !== declared.length ||
        new Set(roots.map((row) => row.componentNode)).size !== roots.length
      )
        throw new Error('IncompleteHwp5DrawingComponents');
      for (const row of declared) {
        const root = roots.find((root) => root.componentNode === row.component_node);
        if (!root || root.controlNode !== row.owner_node)
          throw new Error('Hwp5DrawingComponentOwnerMismatch');
        for (const [key, sourceKey] of [
          ['kind_id', 'kind_id'],
          ['offset_x', 'component_offset_x'],
          ['offset_y', 'component_offset_y'],
          ['original_width', 'original_width'],
          ['original_height', 'original_height'],
          ['current_width', 'current_width'],
          ['current_height', 'current_height'],
          ['attributes', 'component_attributes'],
          ['rotation_angle', 'rotation_angle'],
          ['matrix_pairs', 'matrix_pairs'],
          ['extra_bytes', 'component_extra_bytes'],
        ]) {
          if (row[key] !== root.source[sourceKey])
            throw new Error('Hwp5DrawingComponentSourceMismatch');
        }
      }
      content.hwp5DrawingComponents.push(...rows.map((row) => ({ ...row, section })));
    } catch (error) {
      content.hwp5DrawingComponentErrors.push({ section, error: error.message });
    }
  }
  return content;
}

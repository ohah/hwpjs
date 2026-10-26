import { validateHwp5DrawingMatrixSources } from '../../js/hwp5-drawing-matrix-sources.mjs';

export function attachHwp5DrawingMatrices(editor, content) {
  content.hwp5DrawingMatrices = [];
  content.hwp5DrawingMatrixErrors = [];
  if (!editor) return content;
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      const rows = validateHwp5DrawingMatrixSources(editor.drawingMatrixSources(section));
      const components = new Map(
        rows.filter((row) => row.kind === 'translation').map((row) => [row.component_node, row]),
      );
      const drawings = content.hwp5Drawings.filter((row) => row.section === section);
      const roots = new Map(drawings.map((row) => [row.componentNode, row]));
      if (roots.size !== drawings.length) throw new Error('AmbiguousHwp5DrawingMatrixRoot');
      for (const root of drawings) {
        const first = components.get(root.componentNode);
        if (
          !first ||
          first.owner_node !== root.controlNode ||
          rows.filter((row) => row.component_node === root.componentNode && row.kind === 'rotation')
            .length !== root.source.matrix_pairs
        )
          throw new Error('Hwp5DrawingMatrixSourceMismatch');
      }
      for (const component of components.values()) {
        let current = component;
        while (!roots.has(current.component_node)) {
          const parent = components.get(current.owner_node);
          if (!parent || parent.component_node >= current.component_node)
            throw new Error('MissingHwp5DrawingMatrixParent');
          current = parent;
        }
      }
      content.hwp5DrawingMatrices.push(...rows.map((row) => ({ ...row, section })));
    } catch (error) {
      content.hwp5DrawingMatrixErrors.push({ section, error: error.message });
    }
  }
  return content;
}

import { validateHwp5DrawingLocalTransforms } from '../../js/hwp5-drawing-local-transforms.mjs';

export function attachHwp5DrawingLocalTransforms(editor, content) {
  content.hwp5DrawingLocalTransforms = [];
  content.hwp5DrawingLocalErrors = [];
  if (!editor) return content;
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      if (content.hwp5DrawingMatrixErrors?.some((row) => row.section === section))
        throw new Error('IncompleteHwp5DrawingMatrices');
      const raw = (content.hwp5DrawingMatrices ?? []).filter(
        (row) => row.section === section && row.kind === 'translation',
      );
      if (new Set(raw.map((row) => row.component_node)).size !== raw.length)
        throw new Error('AmbiguousHwp5DrawingTransformSource');
      const local = validateHwp5DrawingLocalTransforms(editor.drawingLocalTransforms(section));
      if (raw.length !== local.length) throw new Error('Hwp5DrawingTransformInventoryMismatch');
      for (const row of local)
        if (
          !raw.some(
            (source) =>
              source.component_node === row.component_node && source.owner_node === row.owner_node,
          )
        )
          throw new Error('Hwp5DrawingTransformOwnerMismatch');
      content.hwp5DrawingLocalTransforms.push(...local.map((row) => ({ ...row, section })));
    } catch (error) {
      content.hwp5DrawingLocalErrors.push({ section, error: error.message });
    }
  }
  return content;
}

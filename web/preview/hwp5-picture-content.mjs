import { validateHwp5PictureSources } from '../../js/hwp5-picture-sources.mjs';

export function attachHwp5Pictures(editor, content) {
  content.hwp5Pictures = [];
  content.hwp5PictureErrors = [];
  if (!editor) return content;
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      if (
        content.hwp5DrawingErrors?.some((row) => row.section === section) ||
        content.hwp5DrawingMatrixErrors?.some((row) => row.section === section)
      )
        throw new Error('IncompleteHwp5PictureOwners');
      const sources = validateHwp5PictureSources(editor.pictureSources(section, 'base73'));
      const components = (content.hwp5DrawingMatrices ?? []).filter(
        (row) => row.section === section && row.kind === 'translation',
      );
      const owners = new Map(components.map((row) => [row.component_node, row.owner_node]));
      if (owners.size !== components.length) throw new Error('AmbiguousHwp5PictureOwners');
      for (const source of sources)
        if (
          !owners.has(source.component_node) ||
          owners.get(source.component_node) !== source.owner_node
        )
          throw new Error('Hwp5PictureOwnerMismatch');
      for (const root of content.hwp5Drawings.filter(
        (row) => row.section === section && row.source.kind_id === 0x24706963,
      )) {
        if (
          !sources.some(
            (row) =>
              row.component_node === root.componentNode && row.owner_node === root.controlNode,
          )
        )
          throw new Error('MissingHwp5PictureSource');
      }
      content.hwp5Pictures.push(
        ...sources.map((source) => ({
          section,
          pictureNode: source.component_node,
          recordNode: source.picture_node,
          source,
        })),
      );
    } catch (error) {
      content.hwp5PictureErrors.push({ section, error: error.message });
    }
  }
  return content;
}

// On-demand bytes reuse the existing browser bitmap budget/cache, not a second inline cache.
export function readHwp5PictureBytes(editor, section, pictureNode) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!uint(section) || !uint(pictureNode)) throw new Error('InvalidHwp5PictureRequest');
  const sources = validateHwp5PictureSources(editor.pictureSources(section, 'base73'));
  const selected = sources.filter((row) => row.component_node === pictureNode);
  if (selected.length !== 1) throw new Error('MissingHwp5PictureSource');
  return editor.binaryResource(selected[0].bin_data_id, { maxBytes: 32 * 1024 * 1024 });
}

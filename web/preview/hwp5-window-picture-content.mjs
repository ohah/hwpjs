import { attachHwp5Pictures } from './hwp5-picture-content.mjs';
import { attachHwp5PictureTails } from './hwp5-picture-tail-content.mjs';

export function attachHwp5WindowPictures(editor, content) {
  if (!content.window) throw new Error('MissingParagraphWindow');
  const scoped = Object.create(editor);
  const selected = (section) =>
    new Set(
      (content.hwp5DrawingComponents ?? [])
        .filter((row) => row.section === section)
        .map((row) => row.component_node),
    );
  for (const name of ['pictureSources', 'pictureTailSources']) {
    scoped[name] = (section, ...options) =>
      editor[name](section, ...options).filter((row) => selected(section).has(row.component_node));
  }
  return attachHwp5PictureTails(scoped, attachHwp5Pictures(scoped, content));
}

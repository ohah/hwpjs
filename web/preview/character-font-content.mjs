/** Read-only font values. Missing display support never grants editing support. */
export function attachCharacterFonts(editor, content) {
  for (const key of [
    'fontFaces',
    'fontFaceMetadata',
    'characterFontReferences',
    'characterFontMetrics',
  ]) {
    content[key] = null;
    content[`${key}Error`] = null;
    if (typeof editor?.[key] !== 'function') continue;
    try {
      content[key] = editor[key]();
    } catch (error) {
      content[`${key}Error`] = error.message;
    }
  }
  return content;
}

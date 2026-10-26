/** One current DocInfo resource snapshot; cells retain their native resource IDs. */
export function attachHwp5TableBorderSources(editor, content) {
  content.hwp5BorderFillSources = null;
  content.hwp5BorderFillSourceError = null;
  if (!editor || !content.tables?.length) return content;
  try {
    if (typeof editor.borderFillSources !== 'function')
      throw new Error('Hwp5BorderFillSourcesAbiUnavailable');
    content.hwp5BorderFillSources = editor.borderFillSources();
  } catch (error) {
    content.hwp5BorderFillSourceError = error.message;
  }
  return content;
}

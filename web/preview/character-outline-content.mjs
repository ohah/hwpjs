/** Optional current diagnostics, independent of editing authority. */
export function attachCharacterOutlines(editor, content) {
  content.characterOutlines = null;
  content.characterOutlinesError = null;
  if (typeof editor?.characterOutlines === 'function') {
    try {
      content.characterOutlines = editor.characterOutlines();
    } catch (error) {
      content.characterOutlinesError = error?.message ?? 'CharacterOutlinesUnavailable';
    }
  }
  return content;
}

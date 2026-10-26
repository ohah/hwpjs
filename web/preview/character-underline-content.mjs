/** Optional native snapshot; display failure never changes edit eligibility. */
export function attachCharacterUnderlines(editor, content) {
  content.characterUnderlines = null;
  content.characterUnderlinesError = null;
  content.characterUnderlineStyles = null;
  content.characterUnderlineStylesError = null;
  if (content.characterUnderlineAvailable === true && editor) {
    try {
      content.characterUnderlines = editor.characterUnderlines();
    } catch (error) {
      content.characterUnderlinesError = error.message;
    }
  }
  if (
    content.characterUnderlineAvailable === true &&
    typeof editor?.characterUnderlineStyles === "function"
  ) {
    try {
      content.characterUnderlineStyles = editor.characterUnderlineStyles();
    } catch (error) {
      content.characterUnderlineStylesError = error.message;
    }
  }
  return content;
}

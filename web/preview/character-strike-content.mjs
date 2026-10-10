/** Optional display projection; failures do not broaden edit eligibility. */
export function attachCharacterStrikes(editor, content) {
  content.characterStrikes = null;
  content.characterStrikesError = null;
  content.characterStrikeStyles = null;
  content.characterStrikeStylesError = null;
  if (content.characterStrikeAvailable === true && editor) {
    try { content.characterStrikes = editor.characterStrikes(); }
    catch (error) { content.characterStrikesError = error.message; }
  }
  if (content.characterStrikeAvailable === true && typeof editor?.characterStrikeStyles === "function") {
    try { content.characterStrikeStyles = editor.characterStrikeStyles(); }
    catch (error) { content.characterStrikeStylesError = error.message; }
  }
  return content;
}

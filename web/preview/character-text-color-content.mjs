/** Display diagnostics never change edit eligibility. */
export function attachCharacterTextColors(editor, content) {
  content.characterTextColors = null;
  content.characterTextColorsError = null;
  if (typeof editor?.characterTextColors === "function") {
    try {
      content.characterTextColors = editor.characterTextColors();
    } catch (error) {
      content.characterTextColorsError = error.message;
    }
  }
  return content;
}

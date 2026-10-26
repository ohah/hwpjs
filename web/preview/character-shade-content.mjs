/** Display diagnostics do not grant editing permission. */
export function attachCharacterShades(editor, content) {
  content.characterShades = null;
  content.characterShadesError = null;
  if (typeof editor?.characterShades === "function") {
    try {
      content.characterShades = editor.characterShades();
    } catch (error) {
      content.characterShadesError = error.message;
    }
  }
  return content;
}

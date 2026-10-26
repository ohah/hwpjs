/** Current native diagnostics never grant effect-edit capability. */
export function attachCharacterEffects(editor, content) {
  content.characterEffects = null;
  content.characterEffectsError = null;
  if (typeof editor?.characterEffects === "function") {
    try {
      content.characterEffects = editor.characterEffects();
    } catch (error) {
      content.characterEffectsError = error?.message ?? "CharacterEffectsUnavailable";
    }
  }
  return content;
}

/** Display-only native snapshots. Failure cannot change editing eligibility. */
import { attachCharacterUnderlines } from "./character-underline-content.mjs";
import { attachCharacterTextColors } from "./character-text-color-content.mjs";
import { attachCharacterShades } from "./character-shade-content.mjs";
import { attachCharacterEffects } from "./character-effect-content.mjs";
import { attachCharacterOutlines } from "./character-outline-content.mjs";
import { attachCharacterFonts } from "./character-font-content.mjs";
import { attachCharacterStrikes } from "./character-strike-content.mjs";
import { attachTabSources } from "./tab-source-content.mjs";
export function attachHwpxStyles(editor, content, available) {
  content.characterShapes = null;
  content.characterShapesError = null;
  if (available) {
    try {
      content.characterShapes = editor.characterShapes();
    } catch (error) {
      content.characterShapesError = error.message;
    }
  }
  for (const paragraph of content.paragraphs) {
    paragraph.characterRanges = null;
    paragraph.selectable = paragraph.editable === true;
    delete paragraph.characterRangesError;
    if (!available || paragraph.clipped) continue;
    try {
      const ranges = editor.characterRanges(paragraph.section, paragraph.paragraph + 1);
      if ((ranges.at(-1)?.end ?? 0) !== paragraph.text.length)
        throw new Error("CharacterDisplayLengthMismatch");
      paragraph.characterRanges = ranges;
      paragraph.selectable = paragraph.text.length > 0 || paragraph.editable === true;
    } catch (error) {
      paragraph.characterRangesError = error.message;
    }
  }
  return attachTabSources(
    editor,
    attachCharacterOutlines(
      editor,
      attachCharacterEffects(
        editor,
        attachCharacterShades(
          editor,
          attachCharacterStrikes(
            editor,
            attachCharacterFonts(
              editor,
              attachCharacterTextColors(editor, attachCharacterUnderlines(editor, content)),
            ),
          ),
        ),
      ),
    ),
  );
}

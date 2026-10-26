// Display-only conversion; native raw UTF-16 ranges remain authoritative.
import { retainedTextView } from './text-offsets.mjs';
import { attachCharacterUnderlines } from './character-underline-content.mjs';
import { attachCharacterTextColors } from './character-text-color-content.mjs';
import { attachCharacterShades } from './character-shade-content.mjs';
import { attachCharacterEffects } from './character-effect-content.mjs';
import { attachCharacterOutlines } from './character-outline-content.mjs';
import { attachCharacterFonts } from './character-font-content.mjs';
import { attachCharacterStrikes } from './character-strike-content.mjs';
export function projectHwp5Ranges(ranges, source, text) {
  const rawUnits = source.tokens.reduce((sum, token) => sum + token.raw.length / 2, 0);
  if ((ranges.at(-1)?.end ?? 0) !== rawUnits) throw new Error('CharacterDisplayLengthMismatch');
  const retained = retainedTextView(source);
  if (!retained && source.tokens.some((t) => t.type === 'control' && t.code !== 13))
    throw new Error('UnsupportedCharacterDisplayControls');
  const fullText = retained?.text ?? source.text;
  if (text !== fullText) throw new Error('CharacterDisplayLengthMismatch');
  const offsets = retained?.offsets ?? [{ at: 0, source: 0 }];
  const map = (unit) => {
    const boundary = offsets.findLast((row) => row.source <= unit);
    if (!boundary) throw new Error('InvalidCharacterDisplayPosition');
    return Math.min(text.length, boundary.at + unit - boundary.source);
  };
  const output = [];
  let cursor = 0;
  let rawCursor = 0;
  for (const range of ranges) {
    if (range.start !== rawCursor || range.end < range.start)
      throw new Error('CharacterDisplayLengthMismatch');
    rawCursor = range.end;
    const start = map(range.start),
      end = map(range.end);
    if (start !== cursor || end < start) throw new Error('CharacterDisplayLengthMismatch');
    cursor = end;
    if (end === start) {
      // Empty paragraphs and a separately styled CR retain source boundary
      // affinity without inventing a display glyph or a raw text terminator.
      if (start === text.length) output.push({ start, end, charShapeId: range.charShapeId });
      continue;
    }
    const previous = output.at(-1);
    if (previous?.charShapeId === range.charShapeId) previous.end = end;
    else output.push({ start, end, charShapeId: range.charShapeId });
  }
  if (cursor !== text.length) throw new Error('CharacterDisplayLengthMismatch');
  return output;
}

export function attachHwp5Styles(editor, preview, content, openError = null) {
  content.characterShapes = null;
  content.characterShapesError = openError;
  if (editor) {
    try {
      content.characterShapes = editor.characterShapes();
      content.characterShapesError = null;
    } catch (error) {
      content.characterShapesError = error.message;
    }
  }
  for (const paragraph of content.paragraphs) {
    paragraph.characterRanges = null;
    if (!editor) continue;
    try {
      const source = preview.sections[paragraph.section].paragraphs[paragraph.paragraph];
      paragraph.characterRanges = projectHwp5Ranges(
        editor.characterRanges(paragraph.section, paragraph.paragraph),
        source,
        paragraph.text,
      );
    } catch (error) {
      paragraph.characterRangesError = error.message;
    }
  }
  return attachCharacterOutlines(
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
  );
}

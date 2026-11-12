// Display-only form text geometry, using the existing Native layout/font contract.
import { inlineCheckBoxIndex } from './checkbox-inline-layout.mjs';
export function inlineHwpxFormTextIndex(
  content,
  { autoSizeFrames, requestAutoSize, measurementSnapshot = content } = {},
) {
  const geometry = inlineCheckBoxIndex(
      { ...content, checkBoxes: content.formTexts ?? [] },
      { allowFormTextWrap: true, autoSizeFrames, requestAutoSize, measurementSnapshot },
    ),
    result = new Map();
  result.unavailable = geometry.unavailable;
  for (const [key, box] of geometry) {
    if (!box) {
      result.set(key, null);
      continue;
    }
    const row = box.checkBox;
    const multiline = row.kind === 'edit_box' && row.sourceAttrs?.booleans?.multiLine === true;
    if (
      typeof row.drawFrame !== 'boolean' ||
      (!multiline && /[\r\n]/.test(row.caption)) ||
      (multiline &&
        (/\t/.test(row.caption) || !Number.isFinite(box.fontHeight) || box.fontHeight <= 0))
    ) {
      result.unavailable.push({
        section: row.section,
        formNode: row.formNode,
        reason: 'UnsupportedFormTextPreviewMode',
      });
      continue;
    }
    result.set(key, {
      width: box.width,
      height: box.height,
      ...(box.frameBasis
        ? {
            storedFrame: box.storedFrame,
            frameBasis: box.frameBasis,
            autoSizeContext: box.autoSizeContext,
            autoSizeOwner: box.autoSizeOwner,
          }
        : {}),
      affectLineSpacing: box.affectLineSpacing,
      font: box.font,
      label: row.caption,
      textOffset: box.textOffset,
      foreground: row.foreColor,
      background: row.backColor,
      drawFrame: row.drawFrame,
      checkBox: null,
      multiline,
      wordWrap: multiline && row.sourceLayout.character.word_wrap === true,
      lineHeight: multiline ? (box.lineHeight ?? box.fontHeight) : null,
      form: { ...row, source: row.sourceAttrs },
    });
  }
  return result;
}

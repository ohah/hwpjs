// On-demand only. No snapshot flag, binding cache, display patch or new owner issuer.
export function formattingCapabilities(editor) {
  if (!editor?.supportsAtomicFormatting?.())
    return { atomic: false, reason: 'AtomicFormattingUnavailable' };
  return editor.atomicFormattingCapabilities();
}
export function queryAtomicFormatting(editor, format, message) {
  const cap = formattingCapabilities(editor);
  if (cap.atomic !== true) throw Error(cap.reason);
  const selector = message.selector;
  if (
    !selector ||
    selector.kind !== 'original-paragraph' ||
    !Number.isInteger(selector.section) ||
    selector.section < 0 ||
    selector.section > 0xffffffff ||
    !Number.isInteger(selector.paragraph) ||
    selector.paragraph < 0 ||
    selector.paragraph > 0xffffffff - (format === 'hwpx' ? 1 : 0)
  )
    throw Error('InvalidFormattingSelector');
  return editor.queryFormatting({
    schemaVersion: 1,
    binding: cap.binding,
    selectors: [{ ...selector, paragraph: selector.paragraph + (format === 'hwpx' ? 1 : 0) }],
    ...(message.fields === undefined ? {} : { fields: message.fields }),
  });
}

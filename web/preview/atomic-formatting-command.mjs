import { validateHwp5CurrentBodyReference } from './hwp5-current-body-reference.mjs';

// On-demand only. No snapshot flag, binding cache, display patch or new owner issuer.
export function formattingCapabilities(editor) {
  if (!editor?.supportsAtomicFormatting?.())
    return { atomic: false, reason: 'AtomicFormattingUnavailable' };
  return editor.atomicFormattingCapabilities();
}
export function queryAtomicFormatting(editor, format, message) {
  const cap = formattingCapabilities(editor);
  if (cap.atomic !== true) throw Error(cap.reason);
  const batch = message.selectors !== undefined;
  if (
    batch &&
    (message.selector !== undefined ||
      !Array.isArray(message.selectors) ||
      message.selectors.length === 0 ||
      message.selectors.length > cap.limits.targets)
  )
    throw Error('InvalidFormattingSelectors');
  // Validate all coordinates before reading any Native source metadata.
  const selectors = (batch ? message.selectors : [message.selector]).map((selector) => {
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
    return { ...selector, paragraph: selector.paragraph + (format === 'hwpx' ? 1 : 0) };
  });
  // Synchronous preflight and query on the same editor. Discard all section
  // windows/flows after this call; no cache survives mutation, undo or reopen.
  const sections = new Map();
  const wire = selectors.map((selector) => {
    if (format !== 'hwp5') return selector;
    validateHwp5CurrentBodyReference(
      editor,
      selector,
      'InvalidCurrentFormattingReference',
      'UnsupportedFormattingOwner',
      sections,
    );
    const { reference: _, ...sourceSlot } = selector;
    return sourceSlot;
  });
  return editor.queryFormatting({
    schemaVersion: 1,
    binding: cap.binding,
    selectors: wire,
    ...(message.fields === undefined ? {} : { fields: message.fields }),
  });
}

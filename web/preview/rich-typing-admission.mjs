import { validateHwp5CurrentReference } from './hwp5-current-body-reference.mjs';

// Receipt construction is linear in the bounded native display projection.
// This is command admission, not an independent mutable formatting model.
export function richTypingProjectionOwners(rows) {
  const owners = new Map();
  for (const row of rows) {
    if (
      (row?.plainEditable !== true && row?.anchorEditable !== true) ||
      row.editable !== true ||
      row.clipped ||
      row.createdCell
    )
      continue;
    if (
      ![row.section, row.paragraph].every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff)
    )
      throw Error('InvalidRichTypingProjection');
    let section = owners.get(row.section);
    if (!section) owners.set(row.section, (section = new Map()));
    if (section.has(row.paragraph)) throw Error('DuplicateRichTypingOwner');
    section.set(row.paragraph, row.plainEditable === true ? 'plain' : 'anchored');
  }
  return owners;
}

export function prepareRichTypingTarget({
  editor,
  format,
  message,
  scope,
  projection,
  createdTablesPending,
}) {
  if (!editor || editor.supportsRichTypingAbi?.() !== true) throw Error('RichTypingUnavailable');
  if (
    message.richTypingScope !== scope ||
    !Number.isInteger(message.expectedHistoryRevision) ||
    message.expectedHistoryRevision !== editor.historyRevision()
  )
    throw Error('StaleRichTypingBinding');
  if (message.rangePolicy !== undefined && message.rangePolicy !== 'reject')
    throw Error('InvalidRangePolicy');
  if (typeof message.text !== 'string' || !message.text || /[\r\n]/.test(message.text))
    throw Error('UnsupportedRichTypingText');
  const maximum = format === 'hwpx' ? 0xfffffffe : 0xffffffff;
  if (!Number.isInteger(message.paragraph) || message.paragraph < 0 || message.paragraph > maximum)
    throw RangeError('Invalid paragraph');
  const paragraph = message.paragraph + (format === 'hwpx' ? 1 : 0);
  let textMode = 'plain';
  if (format === 'hwp5') {
    if (
      !Object.hasOwn(message, 'reference') ||
      !['original', 'generated'].includes(message.reference?.kind)
    )
      throw Error('UnsupportedRichTypingOwner');
    validateHwp5CurrentReference(
      editor,
      message,
      'InvalidCurrentTextTransactionReference',
      'UnsupportedRichTypingOwner',
      (flow) =>
        // Generated nested paragraphs need a native source-template writer;
        // ordinary source cells/drawing lists already use the native batch.
        (flow.host === 'body' && flow.top_level === true) ||
        (message.reference.kind === 'original' &&
          flow.top_level === false &&
          ['table_cell', 'drawing'].includes(flow.host) &&
          Number.isInteger(flow.parent_node) &&
          flow.parent_node >= 0 &&
          Number.isInteger(flow.list_node) &&
          flow.list_node >= 0),
    );
  } else if (format === 'hwpx') {
    const mode = projection?.owners.get(message.section)?.get(message.paragraph);
    if (
      createdTablesPending ||
      projection?.editor !== editor ||
      projection.scope !== scope ||
      projection.revision !== message.expectedHistoryRevision ||
      !['plain', 'anchored'].includes(mode)
    )
      throw Error('UnsupportedRichTypingOwner');
    if (
      mode === 'plain'
        ? !editor.canEdit(message.section, paragraph)
        : typeof editor.anchorText(message.section, paragraph) !== 'string'
    )
      throw Error('UnsupportedRichTypingOwner');
    textMode = mode;
  } else throw Error('RichTypingUnavailable');
  return {
    section: message.section,
    paragraph,
    startUnit: message.startUnit,
    endUnit: message.endUnit,
    text: message.text,
    insertion: message.insertion,
    textMode,
  };
}

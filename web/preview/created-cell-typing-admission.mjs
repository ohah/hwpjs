import { validateCreatedCellCharacterRuns } from '../../js/created-cell-character-runs.mjs';
import { isUtf16Boundary } from './utf16-boundary.mjs';

const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0);
// Synchronous query and edit share one Worker editor. Native still validates
// the request binding and commits the cell/resource map as one History edit.
export function prepareCreatedCellTypingTarget({ editor, format, message, scope }) {
  if (!['hwp5', 'hwpx'].includes(format) || editor?.supportsCreatedCellTypingAbi?.() !== true)
    throw Error('CreatedCellTypingUnavailable');
  if (
    !Number.isSafeInteger(scope) ||
    scope < 0 ||
    message.createdCellTypingScope !== scope ||
    !uint(message.expectedHistoryRevision) ||
    message.expectedHistoryRevision !== editor.historyRevision()
  )
    throw Error('StaleCreatedCellTypingBinding');
  if (
    ![message.section, message.row, message.column, message.startUnit, message.endUnit].every(
      uint,
    ) ||
    message.endUnit < message.startUnit
  )
    throw Error('InvalidCreatedCellTypingTarget');
  if (
    typeof message.identity !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(message.identity) ||
    BigInt(message.identity) > 0xffffffffffffffffn
  )
    throw Error('InvalidCreatedCellTypingTarget');
  if (typeof message.text !== 'string' || !message.text.isWellFormed())
    throw Error('InvalidUnicodeEncoding');
  const cell = currentCreatedCell(editor, format, message);
  if (message.headlessBinding !== undefined) {
    const capability = currentCreatedCellCapability(editor, format);
    if (
      capability.binding.session !== message.headlessBinding?.session ||
      capability.binding.revision !== message.headlessBinding?.revision ||
      cell.text !== message.expectedText
    )
      throw Error('StaleCreatedCellTypingBinding');
  }
  if (
    message.endUnit > cell.text.length ||
    !isUtf16Boundary(cell.text, message.startUnit) ||
    !isUtf16Boundary(cell.text, message.endUnit)
  )
    throw Error('InvalidTextPosition');
  if (format === 'hwp5') {
    const ref = message.reference;
    if (
      !ref ||
      ref.kind !== 'cell' ||
      ref.section !== message.section ||
      ref.id !== message.identity ||
      ref.row !== message.row ||
      ref.column !== message.column
    )
      throw Error('InvalidCurrentReferenceScope');
    // currentText validates actual Native scope/epoch/owner, not a display label.
    if (editor.currentText(ref) !== cell.text + '\r') throw Error('SourceBindingMismatch');
  }
  return {
    section: message.section,
    identity: message.identity,
    row: message.row,
    column: message.column,
    startUnit: message.startUnit,
    endUnit: message.endUnit,
    text: message.text,
    insertion: message.insertion === undefined ? { character: {} } : message.insertion,
  };
}

// Read-through only: the canonical Native paragraph/run model remains the SSOT.
function currentCreatedCell(editor, format, selector) {
  const snapshots = editor.createdTables(selector.section);
  if (!Array.isArray(snapshots)) throw Error('InvalidCreatedCellTypingTarget');
  let table = null,
    cell = null;
  for (const snapshot of snapshots) {
    const value = format === 'hwp5' ? snapshot?.table : snapshot;
    if (value?.identity !== selector.identity) continue;
    if (table) throw Error('InvalidCreatedCellTypingTarget');
    table = value;
  }
  if (!table || !Array.isArray(table.cells)) throw Error('InvalidCreatedCellTypingTarget');
  for (const value of table.cells) {
    if (value?.row !== selector.row || value.column !== selector.column) continue;
    if (cell) throw Error('InvalidCreatedCellTypingTarget');
    cell = value;
  }
  if (!cell || !Object.hasOwn(cell, 'character_runs')) throw Error('CreatedCellTypingUnavailable');
  validateCreatedCellCharacterRuns(cell.text, cell.character_runs);
  return cell;
}
function currentCreatedCellCapability(editor, format) {
  if (!['hwp5', 'hwpx'].includes(format) || editor?.supportsCreatedCellTypingAbi?.() !== true)
    throw Error('CreatedCellTypingUnavailable');
  const capability = editor.createdCellTypingCapabilities();
  if (
    capability?.schemaVersion !== 1 ||
    capability.atomic !== true ||
    capability.format !== format ||
    capability.coordinateSpace !== 'created-cell-utf16' ||
    capability.requiresHistoryProtocol !== 2 ||
    typeof capability.binding?.session !== 'string' ||
    !capability.binding.session ||
    !uint(capability.binding.revision) ||
    capability.binding.revision !== editor.historyRevision()
  )
    throw Error('StaleCreatedCellTypingBinding');
  return capability;
}
/** Fresh synchronous Native logical owner query, without a DOM/Surface selection. */
export function observeCreatedCellTextTarget({ editor, format, selector, scope }) {
  if (
    !selector ||
    typeof selector !== 'object' ||
    Array.isArray(selector) ||
    Object.keys(selector).length !== 4 ||
    !['section', 'identity', 'row', 'column'].every((k) => Object.hasOwn(selector, k)) ||
    ![selector.section, selector.row, selector.column].every(uint) ||
    typeof selector.identity !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(selector.identity) ||
    BigInt(selector.identity) > 0xffffffffffffffffn ||
    !Number.isSafeInteger(scope) ||
    scope < 0
  )
    throw Error('InvalidCreatedCellTypingTarget');
  const before = currentCreatedCellCapability(editor, format);
  const cell = currentCreatedCell(editor, format, selector);
  let reference;
  if (format === 'hwp5') {
    // Native-issued current references carry their actual facade scope/epoch.
    // Never synthesize a NativeRef from a display paragraph or logical label.
    let first = 0,
      total;
    do {
      const page = editor.currentReferences(selector.section, { first, count: 256 });
      if (
        !page ||
        !uint(page.total) ||
        page.total > 1048576 ||
        page.first !== first ||
        !Array.isArray(page.references) ||
        page.references.length !== Math.min(256, page.total - first) ||
        (total !== undefined && page.total !== total)
      )
        throw Error('InvalidCurrentReferenceWindow');
      total = page.total;
      for (const ref of page.references) {
        if (
          ref?.kind !== 'cell' ||
          ref.section !== selector.section ||
          ref.id !== selector.identity ||
          ref.row !== selector.row ||
          ref.column !== selector.column
        )
          continue;
        if (reference) throw Error('AmbiguousCurrentReference');
        reference = ref;
      }
      first += page.references.length;
    } while (first < total);
    if (!reference) throw Error('InvalidCurrentReferenceScope');
    if (editor.currentText(reference) !== cell.text + '\r') throw Error('SourceBindingMismatch');
  }
  const after = currentCreatedCellCapability(editor, format);
  if (
    before.binding.session !== after.binding.session ||
    before.binding.revision !== after.binding.revision
  )
    throw Error('StaleCreatedCellTypingBinding');
  return {
    schemaVersion: 1,
    format,
    scope,
    binding: { session: after.binding.session, revision: after.binding.revision },
    selector: { ...selector },
    text: cell.text,
    ...(reference === undefined ? {} : { reference }),
  };
}

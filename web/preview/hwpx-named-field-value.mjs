import { isHwpxNamedFieldValue } from '../../js/hwpx-named-fields.mjs';

const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;

/** Re-observe the source under the same runtime request as the owned mutation. */
function resolveTarget(editor, request, invalid, unavailable) {
  const { id, name, occurrence, section, paragraph, startUnit, endUnit } = request;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    name.length === 0 ||
    (occurrence !== undefined && !uint(occurrence)) ||
    ![section, paragraph, startUnit, endUnit].every(uint) ||
    endUnit < startUnit
  )
    throw Error(invalid);

  const inventory = editor.namedFields();
  if (inventory.coverage !== 'complete') throw Error('IncompleteNamedFieldInventory');
  const matches = inventory.rows.filter((row) => row.name === name);
  if (occurrence === undefined && matches.length > 1) throw Error('AmbiguousNamedField');
  const row = matches[occurrence ?? 0];
  if (!row) throw Error('NamedFieldMissing');
  if (row.id !== id) throw Error('StaleNamedFieldTarget');
  if (row.protection === 'protected') throw Error('NamedFieldProtected');
  if (!row.canSetValue || row.value.status !== 'available' || !row.location)
    throw Error(unavailable);
  const location = row.location;
  if (
    location.section !== section ||
    location.paragraph !== paragraph ||
    location.startUnit !== startUnit ||
    location.endUnit !== endUnit
  )
    throw Error('StaleNamedFieldTarget');
  return row;
}

export function setHwpxNamedFieldValue(editor, request) {
  const { expectedValue, text, section, paragraph, startUnit, endUnit } = request;
  if (!isHwpxNamedFieldValue(expectedValue) || !isHwpxNamedFieldValue(text))
    throw Error('InvalidNamedFieldValueCommand');
  const row = resolveTarget(
    editor,
    request,
    'InvalidNamedFieldValueCommand',
    'NamedFieldValueUnavailable',
  );
  if (row.value.text !== expectedValue) throw Error('NamedFieldValueMismatch');
  if (text === expectedValue) return false;
  editor.spliceFieldLabel(
    section,
    paragraph + 1,
    row.location.beginElement,
    startUnit,
    endUnit - startUnit,
    text,
  );
  return true;
}

export function renameHwpxNamedField(editor, request) {
  const { section, paragraph, name, newName } = request;
  if (typeof newName !== 'string' || !newName || !newName.isWellFormed())
    throw Error('InvalidNamedFieldName');
  const row = resolveTarget(
    editor,
    request,
    'InvalidNamedFieldRenameCommand',
    'NamedFieldRenameUnavailable',
  );
  return editor.renameNamedField(section, paragraph + 1, row.location.beginElement, name, newName);
}

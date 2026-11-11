import { isHwpxNamedFieldValue } from '../../js/hwpx-named-fields.mjs';

const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;

/** Re-observe the source under the same runtime request as the owned field-label edit. */
export function setHwpxNamedFieldValue(editor, request) {
  const { id, name, occurrence, section, paragraph, startUnit, endUnit, expectedValue, text } =
    request;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    name.length === 0 ||
    (occurrence !== undefined && !uint(occurrence)) ||
    ![section, paragraph, startUnit, endUnit].every(uint) ||
    endUnit < startUnit ||
    !isHwpxNamedFieldValue(expectedValue) ||
    !isHwpxNamedFieldValue(text)
  )
    throw Error('InvalidNamedFieldValueCommand');

  const inventory = editor.namedFields();
  if (inventory.coverage !== 'complete') throw Error('IncompleteNamedFieldInventory');
  const matches = inventory.rows.filter((row) => row.name === name);
  if (occurrence === undefined && matches.length > 1) throw Error('AmbiguousNamedField');
  const row = matches[occurrence ?? 0];
  if (!row) throw Error('NamedFieldMissing');
  if (row.id !== id) throw Error('StaleNamedFieldTarget');
  if (row.protection === 'protected') throw Error('NamedFieldProtected');
  if (!row.canSetValue || row.value.status !== 'available' || !row.location)
    throw Error('NamedFieldValueUnavailable');
  const location = row.location;
  if (
    location.section !== section ||
    location.paragraph !== paragraph ||
    location.startUnit !== startUnit ||
    location.endUnit !== endUnit
  )
    throw Error('StaleNamedFieldTarget');
  if (row.value.text !== expectedValue) throw Error('NamedFieldValueMismatch');
  if (text === expectedValue) return false;
  editor.spliceFieldLabel(
    section,
    paragraph + 1,
    location.beginElement,
    startUnit,
    endUnit - startUnit,
    text,
  );
  return true;
}

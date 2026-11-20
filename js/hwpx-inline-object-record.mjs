/** Strict data-only record; shared by creation payload and owner contracts. */
export function inlineInsertRecord(input, keys) {
  if (
    !input ||
    typeof input !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw Error('InvalidInlineObjectRequest');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length)
    throw Error('InvalidInlineObjectRequest');
  const result = {};
  for (const key of keys) {
    const entry = descriptors[key];
    if (!entry || !Object.hasOwn(entry, 'value')) throw Error('InvalidInlineObjectRequest');
    result[key] = entry.value;
  }
  return result;
}

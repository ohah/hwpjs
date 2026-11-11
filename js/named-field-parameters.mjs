const utf8 = new TextDecoder('utf-8', { fatal: true });
const valid = (value) =>
  value === null ||
  (typeof value === 'string' &&
    value.isWellFormed() &&
    new TextEncoder().encode(value).length <= 4096);

export function checkedNamedFieldParameterValues(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'direction') ||
    !Object.hasOwn(value, 'memo') ||
    !valid(value.direction) ||
    !valid(value.memo)
  )
    throw Error('InvalidNamedFieldParameters');
  return { direction: value.direction, memo: value.memo };
}

export function decodeNamedFieldParameters(bytes) {
  return checkedNamedFieldParameters(JSON.parse(utf8.decode(bytes)));
}

export function checkedNamedFieldParameters(value) {
  if (!value || typeof value.canEdit !== 'boolean') throw Error('InvalidNamedFieldParameters');
  return {
    parameters: checkedNamedFieldParameterValues({ direction: value.direction, memo: value.memo }),
    canEdit: value.canEdit,
  };
}

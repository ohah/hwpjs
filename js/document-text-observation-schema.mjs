// Shared bounded Native text-observation scalar/schema checks.
export const uint = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
export const keys = (value, names) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === names.length &&
  names.every((name) => Object.hasOwn(value, name));
export const binding = (value) =>
  keys(value, ['session', 'revision']) &&
  typeof value.session === 'string' &&
  value.session.length > 0 &&
  (value.revision === null || (uint(value.revision) && value.revision < 0xffffffff));
export const scalarText = (text) => {
  if (typeof text !== 'string') return false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
};
export const scalarBoundary = (text, index) =>
  !(
    index > 0 &&
    index < text.length &&
    text.charCodeAt(index - 1) >= 0xd800 &&
    text.charCodeAt(index - 1) <= 0xdbff &&
    text.charCodeAt(index) >= 0xdc00 &&
    text.charCodeAt(index) <= 0xdfff
  );
export const identity = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 20 &&
  /^[1-9][0-9]*$/.test(value) &&
  (value.length < 20 || value <= '18446744073709551615');

// Fixed Native ABI families; a caller cannot relabel an editor as a readonly format.
export function documentTextFormat(prefix) {
  if (prefix === 'hwp5_edit' || prefix === 'hwp5_read') return 'hwp5';
  if (prefix === 'hwpx_edit') return 'hwpx';
  throw Error('InvalidDocumentTextAbiFamily');
}

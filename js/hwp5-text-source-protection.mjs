// Extra native source protection only; false bits do not grant input permission.
export function validateHwp5TextSourceProtection(value, count) {
  const fail = () => {
    throw new Error('InvalidHwp5TextSourceProtection');
  };
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (
    !uint(count) ||
    !value ||
    !Array.isArray(value.protected_paragraphs) ||
    value.protected_paragraphs.length !== count
  )
    fail();
  let any = false;
  for (const bit of value.protected_paragraphs) {
    if (typeof bit !== 'boolean') fail();
    any ||= bit;
  }
  if (value.mode === 'strict') {
    if (value.retained_headers !== null || any) fail();
  } else if (value.mode === 'retained_click' || value.mode === 'retained_memo') {
    if (!uint(value.retained_headers) || value.retained_headers === 0 || !any) fail();
  } else fail();
  return {
    mode: value.mode,
    protected_paragraphs: value.protected_paragraphs,
    retained_headers: value.retained_headers,
  };
}
export function decodeHwp5TextSourceProtection(bytes, count) {
  return validateHwp5TextSourceProtection(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    count,
  );
}

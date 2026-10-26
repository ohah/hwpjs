const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) =>
  object(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const text = (value) => typeof value === 'string' && value.length <= 4096;
/** Validate Native's profile DTO; never classify a producer or reinterpret its encoding in JS. */
export function isSourceColorProfile(value) {
  return (
    exact(value, ['id', 'encoding', 'verified']) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 256 &&
    ['rgb24', 'colorref24'].includes(value.encoding) &&
    typeof value.verified === 'boolean'
  );
}
export function decodeDocumentProvenance(bytes) {
  const fail = () => {
    throw Error('InvalidDocumentProvenance');
  };
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1024 * 1024) return fail();
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (
    !exact(value, ['sourceOnly', 'sourceVersion', 'sourceVersionError', 'sourceColorProfile']) ||
    value.sourceOnly !== true ||
    !isSourceColorProfile(value.sourceColorProfile)
  )
    return fail();
  const version = value.sourceVersion;
  if (version !== null) {
    if (
      !exact(version, [
        'major',
        'minor',
        'micro',
        'build_number',
        'patch',
        'revision',
        'os',
        'xml_version',
        'target_application',
        'application',
        'app_version',
        'xml_bytes',
      ]) ||
      ![version.major, version.minor, version.xml_bytes].every(uint) ||
      !['micro', 'build_number', 'patch', 'revision', 'os'].every(
        (key) => version[key] === null || uint(version[key]),
      ) ||
      !['xml_version', 'target_application', 'application', 'app_version'].every(
        (key) => version[key] === null || text(version[key]),
      )
    )
      return fail();
  }
  if (
    value.sourceVersionError !== null &&
    (version !== null ||
      typeof value.sourceVersionError !== 'string' ||
      !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value.sourceVersionError))
  )
    return fail();
  return value;
}

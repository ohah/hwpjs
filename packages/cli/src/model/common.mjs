export const LIMITS = Object.freeze({
  maxDepth: 32,
  maxBlocks: 200000,
  maxTextUnits: 4 * 1024 * 1024,
});
export const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export const diagnostic = (code, message, source) => ({
  code,
  message: String(message).slice(0, 512),
  ...(source ? { source: { ...source } } : {}),
});
export function call(sdk, method, args, warnings, source) {
  try {
    if (typeof sdk[method] !== 'function') throw new Error(`${method}Unavailable`);
    return { ok: true, value: sdk[method](...args) };
  } catch (error) {
    warnings.push(
      diagnostic(
        'ObservationUnavailable',
        `${method}: ${error?.message ?? 'UnknownError'}`,
        source,
      ),
    );
    return { ok: false, value: null };
  }
}
export function array(result, warnings, name, source) {
  if (result.ok && Array.isArray(result.value) && result.value.length <= LIMITS.maxBlocks)
    return result.value;
  if (result.ok) warnings.push(diagnostic('InvalidObservation', name, source));
  result.ok = false;
  return [];
}
export function unique(rows, key, warnings, name) {
  const map = new Map();
  for (const row of rows) {
    const id = key(row);
    if (map.has(id)) {
      map.set(id, null);
      warnings.push(diagnostic('AmbiguousSourceIdentity', name));
    } else map.set(id, row);
  }
  return map;
}
export const key = (section, id) => `${section}:${id}`;

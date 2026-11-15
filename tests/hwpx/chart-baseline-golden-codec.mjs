// JSON이 누락하는 own undefined와 음수 0까지 보존한다. 차트 의미를 계산하지 않는다.
const tag = '$chartBaseline';
export function encodeBaselineGolden(value) {
  if (value === undefined) return { [tag]: 'undefined' };
  if (Object.is(value, -0)) return { [tag]: '-0' };
  if (Array.isArray(value)) return value.map(encodeBaselineGolden);
  if (value !== null && typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype || Object.hasOwn(value, tag))
      throw Error('UnsupportedBaselineGoldenObject');
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeBaselineGolden(v)]));
  }
  if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null)
    throw Error('UnsupportedBaselineGoldenValue');
  if (typeof value === 'number' && !Number.isFinite(value))
    throw Error('NonFiniteBaselineGoldenNumber');
  return value;
}
export function decodeBaselineGolden(value) {
  if (Array.isArray(value)) return value.map(decodeBaselineGolden);
  if (value !== null && typeof value === 'object') {
    if (Object.hasOwn(value, tag)) {
      if (Object.keys(value).length !== 1) throw Error('InvalidBaselineGoldenTag');
      if (value[tag] === 'undefined') return undefined;
      if (value[tag] === '-0') return -0;
      throw Error('InvalidBaselineGoldenTag');
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeBaselineGolden(v)]));
  }
  return value;
}

const uint = (value) => Number.isInteger(value) && value > 0 && value <= 0xffffffff;
const own = (value, keys) => {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
  const d = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(d).length !== keys.length ||
    keys.some((key) => !d[key] || !Object.hasOwn(d[key], 'value'))
  )
    return null;
  return Object.fromEntries(keys.map((key) => [key, d[key].value]));
};
const array = (value, length, predicate) => {
  if (!Array.isArray(value) || value.length !== length) return null;
  const d = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(d).length !== length + 1) return null;
  const result = [];
  for (let i = 0; i < length; i++) {
    if (!d[i] || !Object.hasOwn(d[i], 'value') || !predicate(d[i].value)) return null;
    result.push(d[i].value);
  }
  return result;
};
export function checkedOleAxisFrame(value) {
  const r = own(value, ['original', 'current', 'matrix', 'angle', 'flip', 'reverse', 'offset']);
  if (!r) return null;
  const original = array(r.original, 2, uint),
    current = array(r.current, 2, uint),
    matrix = array(r.matrix, 6, Number.isFinite),
    flip = array(r.flip, 2, (x) => typeof x === 'boolean'),
    offset = array(r.offset, 2, Number.isFinite);
  if (
    !original ||
    !current ||
    !matrix ||
    !flip ||
    !offset ||
    !Number.isInteger(r.angle) ||
    r.angle < 0 ||
    r.angle > 0xffffffff ||
    r.reverse !== null
  )
    return null;
  return { original, current, matrix, angle: r.angle, flip, reverse: null, offset };
}
/** Current Native shape-frame evidence only. This never authorizes resource reuse or a mutation. */
export function hasOleSourceFrame(source) {
  if (source?.transform_identity === true) return true;
  const r = checkedOleAxisFrame(source?.axis_frame),
    g = source?.geometry;
  if (
    !r ||
    r.angle !== 0 ||
    r.flip.some(Boolean) ||
    r.offset.some((x) => x !== 0) ||
    r.matrix[0] <= 0 ||
    r.matrix[4] <= 0 ||
    [1, 2, 3, 5].some((i) => r.matrix[i] !== 0) ||
    g?.width_relative !== 4 ||
    g?.height_relative !== 2 ||
    !uint(g.width) ||
    !uint(g.height)
  )
    return false;
  return (
    r.current[0] === g.width &&
    r.current[1] === g.height &&
    Math.round(r.original[0] * r.matrix[0]) === g.width &&
    Math.round(r.original[1] * r.matrix[4]) === g.height
  );
}

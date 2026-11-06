// Scalar wire validation only. Cell ownership, resource cloning and history are Native-owned.
const names = Object.freeze(['section', 'tableNode', 'listNode', 'color']);
const allowed = new Set(names);

function validate(input, message) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('InvalidCellBackground');
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== names.length + Number(message) ||
    keys.some((key) => !allowed.has(key) && !(message && key === 'kind')) ||
    (message && input.kind !== 'cell-background')
  )
    throw new TypeError('InvalidCellBackground');
  const values = names.map((name) => {
    if (!Object.hasOwn(input, name)) throw new TypeError('InvalidCellBackground');
    const value = input[name];
    const maximum = name === 'color' ? 0xffffff : 0xffffffff;
    if (!Number.isInteger(value) || value < 0 || value > maximum)
      throw new RangeError('InvalidCellBackground');
    return value;
  });
  return Object.freeze(Object.fromEntries(names.map((name, index) => [name, values[index]])));
}

export function validateCellBackground(input) {
  return validate(input, false);
}

export function validateCellBackgroundMessage(input) {
  return validate(input, true);
}

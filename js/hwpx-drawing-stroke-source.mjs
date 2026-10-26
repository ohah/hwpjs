const fields = [
  'color',
  'width',
  'style',
  'endCap',
  'headStyle',
  'tailStyle',
  'headfill',
  'tailfill',
  'headSz',
  'tailSz',
  'outlineStyle',
  'alpha',
];
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export function decodeDrawingStrokeSource(bytes, expectedNode) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const attr = value?.attributes;
  if (
    !value ||
    value.sourceOnly !== true ||
    !uint(value.node) ||
    value.node !== expectedNode ||
    !(value.lineShapeNode === null || uint(value.lineShapeNode)) ||
    !(value.knownColor === null || typeof value.knownColor === 'boolean') ||
    !uint(value.unknownEnums) ||
    value.unknownEnums > 8 ||
    !attr ||
    typeof attr !== 'object' ||
    Array.isArray(attr) ||
    !fields.every(
      (name) =>
        attr[name] === null ||
        (typeof attr[name] === 'string' && new TextEncoder().encode(attr[name]).length <= 4096),
    )
  )
    throw new Error('InvalidDrawingStrokeSource');
  return value;
}

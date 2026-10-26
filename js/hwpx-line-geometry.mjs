export function decodeLineGeometry(bytes, expectedNode) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  if (
    !value ||
    value.current !== true ||
    value.coordinateSpace !== 'renderingInfo' ||
    value.paintable !== false ||
    value.geometry?.node !== expectedNode ||
    !['node', 'paragraph', 'anchor_node', 'anchor_unit'].every((name) =>
      uint(value.geometry[name]),
    ) ||
    value.geometry.paragraph < 1 ||
    !Array.isArray(value.geometry.endpoints) ||
    value.geometry.endpoints.length !== 2 ||
    !value.geometry.endpoints.every(
      (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
    )
  )
    throw new Error('InvalidLineGeometry');
  return value;
}

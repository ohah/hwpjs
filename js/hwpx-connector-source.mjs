const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const parse = (bytes) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
export function decodeConnectorNodes(bytes) {
  const nodes = parse(bytes);
  if (
    !Array.isArray(nodes) ||
    !nodes.every((value, index) => uint(value) && (index === 0 || value > nodes[index - 1]))
  )
    throw new Error('InvalidConnectorNodes');
  return nodes;
}
export function decodeConnectorSource(bytes) {
  const value = parse(bytes),
    geometry = value?.geometry;
  const point = (item) =>
    item === null ||
    (object(item) &&
      ['x', 'y', 'subject_id_ref', 'subject_index', 'control_type'].every(
        (name) => item[name] === null || typeof item[name] === 'string',
      ));
  if (
    !object(value) ||
    value.sourceOnly !== true ||
    !uint(value.node) ||
    !object(geometry) ||
    !(geometry.raw_type === null || typeof geometry.raw_type === 'string') ||
    typeof geometry.known_type !== 'boolean' ||
    !point(geometry.start) ||
    !point(geometry.end) ||
    typeof geometry.controls_present !== 'boolean' ||
    !Array.isArray(geometry.controls) ||
    geometry.controls.length > 4096 ||
    !geometry.controls.every((item) => item !== null && point(item)) ||
    (!geometry.controls_present && geometry.controls.length !== 0) ||
    !uint(geometry.unexpected_children)
  )
    throw new Error('InvalidConnectorSource');
  return value;
}
export function decodeConnectorOwner(bytes, expectedNode) {
  const value = parse(bytes);
  if (
    !object(value) ||
    value.current !== true ||
    value.sourceOnly === true ||
    !['node', 'paragraph', 'anchor_node', 'anchor_unit'].every((name) => uint(value[name])) ||
    value.paragraph < 1 ||
    (expectedNode !== undefined && value.node !== expectedNode)
  )
    throw new Error('InvalidConnectorOwner');
  return value;
}
export function decodeConnectorRenderingSource(bytes, expectedNode) {
  const value = parse(bytes);
  const point = (row) => Array.isArray(row) && row.length === 2 && row.every(Number.isFinite);
  if (
    !object(value) ||
    value.sourceOnly !== true ||
    value.coordinateSpace !== 'renderingInfo' ||
    !uint(value.node) ||
    (expectedNode !== undefined && value.node !== expectedNode) ||
    !Array.isArray(value.endpoints) ||
    value.endpoints.length !== 2 ||
    !value.endpoints.every(point) ||
    !Array.isArray(value.controls) ||
    value.controls.length > 4096 ||
    !value.controls.every(point)
  )
    throw new Error('InvalidConnectorRenderingSource');
  return value;
}

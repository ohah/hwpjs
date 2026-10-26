// Validate wire types without duplicating native attribute names or XML rules.
import { validShapeLayoutValues } from './hwpx-shape-layout-values.mjs';
const kinds = new Set(['button', 'check_button', 'combo_box', 'radio_button', 'edit_box']);
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function decode(bytes, maximum) {
  if (!(bytes instanceof Uint8Array) || bytes.length > maximum)
    throw new Error('InvalidFormSource');
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('InvalidFormSource');
  }
}
export function decodeFormSourceNodes(bytes) {
  const value = decode(bytes, 8 * 1024 * 1024);
  if (
    !object(value) ||
    value.sourceOnly !== true ||
    !Array.isArray(value.nodes) ||
    value.nodes.length > 100000 ||
    !value.nodes.every(
      (row, i) =>
        object(row) &&
        uint(row.formNode) &&
        kinds.has(row.kind) &&
        (i === 0 || row.formNode > value.nodes[i - 1].formNode),
    )
  )
    throw new Error('InvalidFormSource');
  return value;
}
export function decodeFormSourceAttributes(bytes) {
  const value = decode(bytes, 1024 * 1024);
  const group = (data, check) =>
    object(data) &&
    Object.keys(data).length <= 128 &&
    Object.entries(data).every(
      ([key, item]) =>
        /^[A-Za-z][A-Za-z0-9]*$/.test(key) && key.length <= 128 && (item === null || check(item)),
    );
  if (
    !object(value) ||
    value.sourceOnly !== true ||
    !kinds.has(value.kind) ||
    !group(
      value.strings,
      (item) =>
        typeof item === 'string' &&
        item.isWellFormed() &&
        new TextEncoder().encode(item).length <= 65536,
    ) ||
    !group(value.booleans, (item) => typeof item === 'boolean') ||
    !group(value.integers, uint)
  )
    throw new Error('InvalidFormSource');
  return value;
}
export function decodeFormSites(bytes) {
  const sites = decode(bytes, 16 * 1024 * 1024);
  if (
    !Array.isArray(sites) ||
    sites.length > 100000 ||
    !sites.every((site, i) => {
      if (
        !object(site) ||
        !uint(site.formNode) ||
        !kinds.has(site.kind) ||
        (i > 0 && site.formNode <= sites[i - 1].formNode)
      )
        return false;
      if (site.state === 'located')
        return uint(site.paragraph) && site.paragraph > 0 && uint(site.anchorUnit);
      if (site.state === 'unsupported_anchor')
        return uint(site.paragraph) && site.paragraph > 0 && site.anchorUnit === null;
      return (
        ['conditional', 'missing_host', 'ambiguous_host'].includes(site.state) &&
        site.paragraph === null &&
        site.anchorUnit === null
      );
    })
  )
    throw new Error('InvalidFormSource');
  return sites;
}
export function decodeFormSourceLayout(bytes) {
  const value = decode(bytes, 65536);
  const bool = (value) => value === null || typeof value === 'boolean';
  if (
    !object(value) ||
    value.sourceOnly !== true ||
    !uint(value.formNode) ||
    !kinds.has(value.kind) ||
    !validShapeLayoutValues(value) ||
    !object(value.character) ||
    !(value.character.id === null || uint(value.character.id)) ||
    ![
      value.character.follow_context,
      value.character.auto_size,
      value.character.word_wrap,
      value.sizeProtected,
    ].every(bool)
  )
    throw new Error('InvalidFormSource');
  return value;
}

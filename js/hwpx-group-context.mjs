// XML preorder identities: every parent precedes its child.
export function validGroupContext(value, node) {
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  if (!uint(node)) return false;
  if (value === null) return true;
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [value.parent_container, value.root_anchor, value.depth].every(uint) &&
    value.depth >= 1 &&
    value.root_anchor <= value.parent_container &&
    value.parent_container < node &&
    value.depth <= value.parent_container - value.root_anchor + 1 &&
    (value.depth === 1) === (value.parent_container === value.root_anchor),
  );
}

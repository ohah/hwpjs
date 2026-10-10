import { validShapeLayoutValues } from "./hwpx-shape-layout-values.mjs";
export function decodeContainerSource(bytes) {
  const fail = () => { throw new Error("InvalidContainerSource"); };
  if (!(bytes instanceof Uint8Array) || bytes.length > 1048576) return fail();
  let v;
  try { v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail(); }
  const uint = n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  const optional = (n, check) => n === null || check(n);
  const signed = n => Number.isSafeInteger(n) && n >= -2147483648 && n <= 4294967295;
  const bool = n => n === null || typeof n === "boolean";
  const array = (a, length, check) => Array.isArray(a) && a.length === length && a.every(check);
  if (!v || !uint(v.container_node)) return fail();
  if (!Array.isArray(v.children) || !v.children.every((c, i) => c && uint(c.node) && c.node > v.container_node && (i === 0 || c.node > v.children[i - 1].node) && typeof c.namespace_uri === "string" && typeof c.local_name === "string" && c.local_name.length > 0)) return fail();
  const c = v.group_context;
  if (c !== null && (!c || ![c.parent_container, c.root_anchor, c.depth].every(uint) || c.depth < 1 || c.root_anchor > c.parent_container || c.parent_container >= v.container_node || c.depth > c.parent_container - c.root_anchor + 1)) return fail();
  const g = v.geometry, p = v.position, f = v.flow, t = v.transform;
  if (!g || !p || !f || !t) return fail();
  if (!validShapeLayoutValues(v)) return fail();
  if (!array(t.flip, 2, bool) || !optional(t.angle, uint) || !array(t.center, 2, n => optional(n, signed)) || !bool(t.rotate_image) || !bool(t.reverse) || !uint(t.unknown_matrix_nodes) || !Array.isArray(t.matrices) || t.matrices.length > 1024) return fail();
  if (!t.matrices.every(m => m && ["translation", "scale", "rotation"].includes(m.kind) && array(m.values, 6, n => optional(n, n => typeof n === "number" && Number.isFinite(n))))) return fail();
  return v;
}

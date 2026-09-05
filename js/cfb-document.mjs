import { DOCUMENT as D } from "./abi-schema.mjs";
import { inputBytes } from "./input.mjs";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
function u32(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
    throw new TypeError("Expected u32");
  return value;
}
function u64(value) {
  if (typeof value !== "bigint" || value < 0n || value > 0xffffffffffffffffn)
    throw new TypeError("Expected u64 bigint");
  return value;
}
export function encodeDocument(document) {
  const version = document.version ?? 3;
  if (version !== 3 && version !== 4) throw new TypeError("UnsupportedVersion");
  if (
    !Array.isArray(document.nodes) ||
    !document.nodes.length ||
    document.nodes.length > 1000000
  )
    throw new TypeError("InvalidDocument");
  let size = D.header_bytes;
  const nodes = document.nodes.map((node) => {
    if (typeof node.name !== "string" || !node.name.isWellFormed())
      throw new TypeError("InvalidName");
    const name = encoder.encode(node.name),
      content = inputBytes(node.content ?? new Uint8Array());
    const clsid = inputBytes(node.clsid ?? new Uint8Array(16));
    if (clsid.length !== 16) throw new TypeError("InvalidCLSID");
    size += D.node_bytes + name.length + content.length;
    if (size > 256 * 1024 * 1024) throw new RangeError("LimitExceeded");
    return {
      name,
      content,
      clsid,
      parent: u32(node.parent ?? 0xffffffff),
      kind: u32(node.kind ?? 2),
      state: u32(node.state ?? 0),
      created: u64(node.created ?? 0n),
      modified: u64(node.modified ?? 0n),
    };
  });
  const bytes = new Uint8Array(size),
    view = new DataView(bytes.buffer);
  view.setUint32(0, version, true);
  view.setUint32(4, nodes.length, true);
  let offset = D.header_bytes;
  for (const node of nodes) {
    for (const [field, value] of [
      [D.parent, node.parent],
      [D.kind, node.kind],
      [D.name_len, node.name.length],
      [D.content_len, node.content.length],
      [D.state, node.state],
    ])
      view.setUint32(offset + field, value, true);
    view.setBigUint64(offset + D.created, node.created, true);
    view.setBigUint64(offset + D.modified, node.modified, true);
    bytes.set(node.clsid, offset + D.clsid);
    offset += D.node_bytes;
    bytes.set(node.name, offset);
    offset += node.name.length;
    bytes.set(node.content, offset);
    offset += node.content.length;
  }
  return bytes;
}
export function decodeDocument(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0, true),
    count = view.getUint32(4, true),
    nodes = [];
  let offset = D.header_bytes;
  for (let i = 0; i < count; i++) {
    const node = {
      parent: view.getUint32(offset + D.parent, true),
      kind: view.getUint32(offset + D.kind, true),
      state: view.getUint32(offset + D.state, true),
      created: view.getBigUint64(offset + D.created, true),
      modified: view.getBigUint64(offset + D.modified, true),
      clsid: bytes.slice(offset + D.clsid, offset + D.clsid + 16),
    };
    const names = view.getUint32(offset + D.name_len, true),
      content = view.getUint32(offset + D.content_len, true);
    offset += D.node_bytes;
    node.name = decoder.decode(bytes.subarray(offset, offset + names));
    offset += names;
    node.content = bytes.slice(offset, offset + content);
    offset += content;
    nodes.push(node);
  }
  if (offset !== bytes.length) throw new Error("InvalidDocument");
  return { version, nodes };
}

/** Remove a node/subtree and remap parents. Returns a new model, does not mutate input. */
export function removeNode(document, index) {
  if (!Number.isInteger(index) || index <= 0 || index >= document.nodes.length)
    throw new RangeError("InvalidNode");
  const children = document.nodes.map(() => []);
  document.nodes.forEach((n, i) => {
    if (!i) return;
    if (
      !Number.isInteger(n.parent) ||
      n.parent < 0 ||
      n.parent >= children.length
    )
      throw new Error("InvalidDirectoryReference");
    children[n.parent].push(i);
  });
  const removed = new Set(),
    stack = [index];
  while (stack.length) {
    const id = stack.pop();
    if (removed.has(id)) continue;
    removed.add(id);
    for (const child of children[id]) stack.push(child);
  }
  const map = new Map(),
    nodes = [];
  document.nodes.forEach((n, i) => {
    if (!removed.has(i)) {
      map.set(i, nodes.length);
      nodes.push({ ...n });
    }
  });
  for (let i = 1; i < nodes.length; i++) {
    const parent = map.get(nodes[i].parent);
    if (parent === undefined) throw new Error("InvalidDirectoryReference");
    nodes[i].parent = parent;
  }
  return { ...document, nodes };
}

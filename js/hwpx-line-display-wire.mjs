import { decodeDrawingPlacement } from "./hwpx-drawing-placement-wire.mjs";

export function decodeLinePlacement(bytes) {
  return decodeDrawingPlacement(bytes, "InvalidLinePlacement");
}

export function decodeLineNodes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) throw new Error("InvalidLineNodes");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  if (view.getUint32(0, true) !== 0x314e4c48 || bytes.length !== 8 + count * 4) throw new Error("InvalidLineNodes");
  const nodes = Array.from({ length: count }, (_, i) => view.getUint32(8 + i * 4, true));
  if (nodes.some((node, i) => i > 0 && node <= nodes[i - 1])) throw new Error("InvalidLineNodes");
  return nodes;
}

export function decodeLineDisplay(bytes) {
  if (!(bytes instanceof Uint8Array) || ![56, 72].includes(bytes.length)) throw new Error("InvalidLineDisplay");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== (bytes.length === 56 ? 0x31444c48 : 0x32444c48) || view.getUint32(4, true) !== 0 || view.getUint32(12, true) === 0) throw new Error("InvalidLineDisplay");
  const endpoints = [0, 1].map(i => [0, 1].map(axis => view.getFloat64(24 + (i * 2 + axis) * 8, true)));
  if (endpoints.flat().some(number => !Number.isFinite(number))) throw new Error("InvalidLineDisplay");
  let stroke = { color: null, width: null, style: null };
  if (bytes.length === 72) {
    const flags = view.getUint32(56, true);
    if (flags > 7) throw new Error("InvalidLineDisplay");
    stroke = Object.fromEntries(["color", "width", "style"].map((name, i) => {
      const value = view.getUint32(60 + i * 4, true), present = flags & (1 << i);
      if (!present && value !== 0) throw new Error("InvalidLineDisplay");
      return [name, present ? value : null];
    }));
    if (stroke.color > 0xffffff || stroke.style > 1) throw new Error("InvalidLineDisplay");
  }
  return { lineNode: view.getUint32(8, true), paragraph: view.getUint32(12, true), anchorNode: view.getUint32(16, true), anchorUnit: view.getUint32(20, true), endpoints, stroke };
}

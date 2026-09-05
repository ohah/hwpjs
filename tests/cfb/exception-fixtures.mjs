import { v4File } from "./contract-fixtures.mjs";

export function directoryOrder(cycle = false) {
  const bytes = v4File();
  function entry(index, name, type, left, right, child) {
    const o = 8192 + index * 128;
    bytes.fill(0, o, o + 128);
    const encoded = Buffer.from(name + "\0", "utf16le");
    encoded.copy(bytes, o);
    bytes.writeUInt16LE(encoded.length, o + 64);
    bytes[o + 66] = type;
    bytes[o + 67] = 1;
    for (const [field, value] of [
      [68, left],
      [72, right],
      [76, child],
      [116, 0xfffffffe],
    ])
      bytes.writeUInt32LE(value, o + field);
  }
  const none = 0xffffffff;
  entry(0, "Root Entry", 5, none, none, cycle ? 1 : 3);
  entry(1, "A", cycle ? 1 : 2, cycle ? 2 : none, cycle ? none : 2, none);
  entry(2, "B", cycle ? 1 : 2, cycle ? 1 : none, none, none);
  if (!cycle) entry(3, "Folder", 1, none, none, 1);
  return bytes;
}

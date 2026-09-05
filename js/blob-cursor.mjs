// Adapted from SheetJS CFB 1.2.0, Copyright (C) 2013-present SheetJS.
// Apache-2.0; see licenses/SheetJS-Apache-2.0.txt and THIRD_PARTY_NOTICES.md.
// JS compatibility cursor on copied bytes, not a CFB parser or container writer.
import { nodeBuffer } from "./output-bytes.mjs";

function hex(bytes, start, length) {
  if (nodeBuffer?.isBuffer(bytes))
    return bytes.toString("hex", start, start + length);
  const out = [];
  for (let i = start; i < start + length; i++)
    out.push(("0" + bytes[i].toString(16)).slice(-2));
  return out.join("");
}
function readShift(size, type) {
  let value;
  const i = this.l;
  switch (size) {
    case 1:
      value = this[i];
      break;
    case 2:
      value = this[i + 1] * 256 + this[i];
      if (type === "i" && !(value < 0x8000)) value = -(0xffff - value + 1);
      break;
    case 4:
      value =
        (this[i + 3] << 24) +
        (this[i + 2] << 16) +
        (this[i + 1] << 8) +
        this[i];
      break;
    case 16:
      value = hex(this, i, size);
      break;
  }
  this.l += size;
  return value;
}
function writeShift(size, value, format) {
  if (format === "hex") {
    for (let i = 0; i < size; i++)
      this[this.l++] = parseInt(value.slice(2 * i, 2 * i + 2), 16) || 0;
    return this;
  }
  if (format === "utf16le") {
    const end = this.l + size;
    for (let i = 0; i < Math.min(value.length, size); i++) {
      const c = value.charCodeAt(i);
      this[this.l++] = c & 255;
      this[this.l++] = c >> 8;
    }
    while (this.l < end) this[this.l++] = 0;
    return this;
  }
  let count = 0;
  switch (size) {
    case 1:
      count = 1;
      this[this.l] = value & 255;
      break;
    case 2:
      count = 2;
      this[this.l] = value & 255;
      this[this.l + 1] = (value >>> 8) & 255;
      break;
    case 4:
    case -4:
      count = 4;
      for (let i = 0; i < 4; i++) this[this.l + i] = (value >>> (i * 8)) & 255;
      break;
  }
  this.l += count;
  return this;
}
function checkField(expected, field) {
  const actual = hex(this, this.l, expected.length >> 1);
  if (actual !== expected)
    throw new Error(field + "Expected " + expected + " saw " + actual);
  this.l += expected.length >> 1;
}
export function attachCursor(bytes) {
  bytes.l = 0;
  bytes.read_shift = readShift;
  bytes.chk = checkField;
  bytes.write_shift = writeShift;
  return bytes;
}

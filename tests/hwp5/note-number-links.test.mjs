import test from "node:test";
import assert from "node:assert/strict";
import { noteNumberLinksActual } from "./note-number-links.mjs";

const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const record = (tag, level, payload = Buffer.alloc(0)) =>
  Buffer.concat([u32(tag | (level << 10) | (payload.length << 20)), payload]);
const control = (name, level, number, kind = 0) => {
  const payload = Buffer.alloc(16);
  payload.writeUInt32LE(name, 0);
  if (name === 0x61746e6f) {
    payload.writeUInt32LE(kind, 4);
    payload.writeUInt16LE(number, 8);
  } else payload.writeUInt32LE(number, 4);
  return record(71, level, payload);
};
const list = record(72, 1, Buffer.alloc(8));
const paragraph = record(66, 1, Buffer.alloc(22));

test("HWP5 note number oracle distinguishes ownership, kind and stored number", () => {
  const note = control(0x666e2020, 0, 7);
  const auto = control(0x61746e6f, 2, 7, 1);
  const good = Buffer.concat([note, list, paragraph, auto]);
  assert.deepEqual(noteNumberLinksActual(good), [1, 0, 0, 1, 0, 1, 0, 0]);
  assert.deepEqual(noteNumberLinksActual(good, "spec8"), [1, 0, 0, 1, 0, 0, 0, 1]);
  assert.deepEqual(noteNumberLinksActual(Buffer.concat([note, list, paragraph])), [0, 1, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(noteNumberLinksActual(Buffer.concat([note, list, paragraph, auto, auto])), [2, 0, 1, 2, 0, 2, 0, 0]);
  assert.deepEqual(noteNumberLinksActual(Buffer.concat([note, list, paragraph, auto, list, paragraph, auto])), [2, 0, 1, 2, 0, 2, 0, 0]);
  assert.deepEqual(noteNumberLinksActual(Buffer.concat([note, list, paragraph, control(0x6175746e, 2, 7, 1)])), [0, 1, 0, 0, 0, 0, 0, 0]);
  const wrongKind = Buffer.from(good);
  wrongKind.writeUInt32LE(2, wrongKind.length - auto.length + 8);
  assert.deepEqual(noteNumberLinksActual(wrongKind), [1, 0, 0, 0, 1, 1, 0, 0]);
  const wrongNumber = Buffer.from(good);
  wrongNumber.writeUInt16LE(8, wrongNumber.length - auto.length + 12);
  assert.deepEqual(noteNumberLinksActual(wrongNumber), [1, 0, 0, 1, 0, 0, 1, 0]);
  assert.deepEqual(noteNumberLinksActual(Buffer.concat([control(0x666e2020, 0, 0x10007), list, paragraph, auto])), [1, 0, 0, 1, 0, 0, 1, 0]);
  const sibling = Buffer.concat([note, list, paragraph, control(0x61746e6f, 0, 7, 1)]);
  assert.deepEqual(noteNumberLinksActual(sibling), [0, 1, 0, 0, 0, 0, 0, 0]);
});

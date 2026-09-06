import assert from "node:assert/strict";
const w = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const u = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const item = (id, type, b) => Buffer.concat([u(id), u(type), b]);
const set = (id, items) => Buffer.concat([u(id), u(items.length), u(0), ...items]);
const frame = (tag, level, p) => Buffer.concat([w(tag | (level << 10) | (p.length << 20)), p]);
export function presentationReferenceEdges(call) {
  const version = 0x05010001, flag = n => item(0x4001, 9, w(n)), image = n => item(0x401e, 0x8002, u(n));
  const payload = (items, fill = 0x266, pres = 0x219, root = 0x21b) => set(root, [item(pres, 0x8000, set(pres, [item(fill, 0x8000, set(fill, items))]))]);
  const body = (p, owner = 0x73656364) => Buffer.concat([frame(71, 0, w(owner)), frame(87, 1, p)]);
  const run = (b, bins = 0, source = 1) => call(23, Buffer.concat([Buffer.from([source]), w(version), w(bins), b]));
  const good = body(payload([flag(4), image(0)])); let accepted = 0, rejected = 0;
  const check = b => { assert.equal(run(b).readUInt32LE(28), 1); accepted++; };
  const reject = b => { assert.throws(() => run(b), /InvalidResourceReference/); rejected++; check(good); };
  check(good); check(body(payload([image(0), flag(4)])));
  for (const value of [0, 1, 2, 3, 5, 6, 7, 8, 0x80000004, 0xffffffff]) reject(body(payload([flag(value), image(0)])));
  for (const items of [[image(0)], [flag(4), flag(4), image(0)], [flag(4), flag(2), image(0)], [item(0x4001, 4, w(4)), image(0)], [item(7, 0x8000, set(7, [flag(4)])), image(0)]]) reject(body(payload(items)));
  for (const p of [payload([flag(4), image(0)], 0x267), payload([flag(4), image(0)], 0x266, 0x218), payload([flag(4), image(0)], 0x266, 0x219, 0x21a)]) reject(body(p));
  reject(body(payload([flag(4), image(0)]), 0x626f6b6d));
  reject(frame(87, 0, payload([flag(4), image(0)])));
  reject(Buffer.concat([frame(71, 0, w(0x73656364)), frame(900, 1, Buffer.alloc(0)), frame(87, 2, payload([flag(4), image(0)]))]));
  assert.throws(() => run(frame(27, 0, payload([flag(4), image(0)])), 0, 0), /InvalidResourceReference/); rejected++;
  for (const id of [1, 2, 65535]) {
    assert.equal(run(body(payload([flag(4), image(id)])), id).readUInt32LE(28), 1); accepted++;
    assert.throws(() => run(body(payload([flag(4), image(id)])), id - 1), /InvalidResourceReference/); rejected++; check(good);
  }
  return { accepted, rejected };
}

import assert from "node:assert/strict";
import { identityActual } from "./links.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const u = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const frame = (tag, level, b) =>
  Buffer.concat([
    w(tag | (level << 10) | (Math.min(b.length, 4095) << 20)),
    ...(b.length >= 4095 ? [w(b.length)] : []),
    b,
  ]);
const field = (cmd) =>
  Buffer.concat([w(0x8001), Buffer.from([0]), u(cmd.length / 2), cmd, w(123)]);
export function memoEdges(call) {
  const v = 0x05010001;
  const make = (p, tokenId = 0x25256d65, headId = 0x25756e6b, code = 3) => {
    const token = Buffer.alloc(16);
    token.writeUInt16LE(code);
    token.writeUInt32LE(tokenId, 2);
    token.writeUInt16LE(code, 14);
    return Buffer.concat([
      frame(66, 0, Buffer.alloc(24)),
      frame(67, 1, token),
      frame(71, 1, Buffer.concat([w(headId), p])),
    ]);
  };
  const good = field(Buffer.from("MEMO/", "utf16le"));
  let accepted = 0,
    rejected = 0;
  const check = (b) => {
    assert.equal(identityActual(call, v, b), 1);
    accepted++;
  };
  const reject = (b, error = /ControlIdMismatch/) => {
    assert.throws(() => call(38, Buffer.concat([w(v), b])), error);
    rejected++;
    check(make(good));
  };
  for (let n = 0; n < good.length; n++)
    reject(make(good.subarray(0, n)), /UnexpectedEnd/);
  for (const s of [
    "",
    "M",
    "MEMO",
    "memo/",
    "XMEMO/",
    "MEMO\u0000/",
    "ＭＥＭＯ/",
  ])
    reject(make(field(Buffer.from(s, "utf16le"))));
  for (const [token, head, code] of [
    [0x25756e6b, 0x25256d65, 3],
    [0x25686c6b, 0x25756e6b, 3],
    [0x25256d65, 0x25686c6b, 3],
    [0x25256d65, 0x25756e6b, 2],
  ])
    reject(make(good, token, head, code));
  for (const suffix of [
    Buffer.alloc(0),
    Buffer.from([0, 0, 0, 216, 255, 254]),
    Buffer.alloc((65535 - 5) * 2, 255),
  ])
    check(
      make(field(Buffer.concat([Buffer.from("MEMO/", "utf16le"), suffix]))),
    );
  for (let n = 0; n < 4; n++)
    check(make(Buffer.concat([good, Buffer.alloc(n, 7)])));
  return { accepted, rejected };
}

import assert from "node:assert/strict";

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}
function frame(tag, payload, level = 0) {
  return Buffer.concat([
    u32(tag | (level << 10) | (payload.length << 20)),
    payload,
  ]);
}
export function checkDocinfo(call, version, bytes) {
  const expected = [];
  let offset = 0;
  while (offset < bytes.length) {
    const start = offset,
      bits = bytes.readUInt32LE(offset);
    offset += 4;
    let length = bits >>> 20;
    if (length === 4095) {
      length = bytes.readUInt32LE(offset);
      offset += 4;
    }
    const tag = bits & 1023,
      payload = bytes.subarray(offset, offset + length);
    offset += length;
    expected.push(u32(tag));
    if (tag === 16) {
      for (let i = 0; i < 7; i++)
        expected.push(u32(payload.readUInt16LE(i * 2)));
      for (let i = 14; i < 26; i += 4)
        expected.push(u32(payload.readUInt32LE(i)));
      expected.push(u32(payload.length - 26), payload.subarray(26));
    } else if (tag === 17) {
      const count =
        version >= 0x05000302 ? 18 : version >= 0x05000201 ? 16 : 15;
      expected.push(u32(payload.length / 4), u32(count), payload);
    } else expected.push(u32(offset - start), bytes.subarray(start, offset));
  }
  assert.deepEqual(
    call(4, Buffer.concat([u32(version), bytes])),
    Buffer.concat(expected),
  );
}
export function checkDocinfoEdges(call) {
  const v = 0x05000107;
  const invoke = (b, limit = 100) => call(4, Buffer.concat([u32(v), b]), limit);
  for (let n = 0; n < 26; n++)
    assert.throws(() => invoke(frame(16, Buffer.alloc(n))), /UnexpectedEnd/);
  for (let n = 0; n < 60; n++)
    assert.throws(() => invoke(frame(17, Buffer.alloc(n))), /UnexpectedEnd/);
  for (const version of [
    0x05000200, 0x05000201, 0x05000301, 0x05000302, 0x05010001,
  ]) {
    for (let n = 60; n <= 80; n++) {
      const b = frame(17, Buffer.alloc(n, 255));
      if (n % 4)
        assert.throws(
          () => call(4, Buffer.concat([u32(version), b])),
          /InvalidMappingSize/,
        );
      else checkDocinfo(call, version, b);
    }
  }
  for (const tag of [16, 17])
    assert.throws(
      () => invoke(frame(tag, Buffer.alloc(tag === 16 ? 26 : 60), 1)),
      /InvalidDocInfoLevel/,
    );
  for (const n of [26, 27, 32])
    checkDocinfo(
      call,
      v,
      frame(16, Buffer.from(Array.from({ length: n }, (_, i) => i))),
    );
  checkDocinfo(call, v, frame(1023, Buffer.from([1, 2, 3]), 1023));
  assert.throws(() => invoke(frame(16, Buffer.alloc(26)), 0), /LimitExceeded/);
  checkDocinfo(call, v, frame(16, Buffer.alloc(26))); // recovery
}

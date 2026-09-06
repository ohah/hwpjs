import assert from "node:assert/strict";
const word = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const units = (values) => {
  const b = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => b.writeUInt16LE(v, i * 2));
  return b;
};
const version = 0x05010001;
const frame = (tag, b, level = 1, extended = b.length >= 4095) =>
  Buffer.concat([
    word(tag | (level << 10) | ((extended ? 4095 : b.length) << 20)),
    ...(extended ? [word(b.length)] : []),
    b,
  ]);
// Independent table 6: 0=text, 1=character, 2=inline, 3=extended.
const kinds = [
  1, 3, 3, 3, 2, 2, 2, 2, 2, 2, 1, 3, 3, 1, 3, 3, 3, 3, 3, 2, 2, 3, 3, 3, 1, 1,
  1, 1, 1, 1, 1, 1,
];
function tokenize(b) {
  assert.equal(b.length % 2, 0);
  const rows = [];
  let p = 0;
  while (p < b.length) {
    const start = p,
      code = b.readUInt16LE(p),
      kind = kinds[code] || 0;
    if (kind) {
      p += kind === 1 ? 2 : 16;
      assert.ok(p <= b.length);
      if (kind !== 1) assert.equal(b.readUInt16LE(p - 2), code);
    } else {
      do {
        p += 2;
      } while (p < b.length && b.readUInt16LE(p) >= 32);
    }
    rows.push([start / 2, (p - start) / 2, kind, kind ? code : 0xffffffff]);
  }
  return rows;
}
export function checkBody(call, v, bytes, pairCounts = false) {
  let p = 0;
  const expected = [],
    parents = [],
    headers = [];
  const stats = {
    headers: 0,
    texts: 0,
    units: 0,
    textRuns: 0,
    characterControls: 0,
    inlineControls: 0,
    extendedControls: 0,
    headersWithoutText: 0,
  };
  while (p < bytes.length) {
    const start = p,
      bits = bytes.readUInt32LE(p);
    p += 4;
    let n = bits >>> 20;
    if (n === 4095) {
      n = bytes.readUInt32LE(p);
      p += 4;
    }
    const tag = bits & 1023,
      level = (bits >>> 10) & 1023,
      b = bytes.subarray(p, p + n);
    p += n;
    expected.push(
      word(tag),
      word(level),
      word(p - start),
      bytes.subarray(start, p),
    );
    if (tag === 66) {
      const count = b.readUInt32LE(0) & 0x7fffffff;
      expected.push(word(count), word(b.readUInt32LE(0) >>> 31));
      stats.headers++;
      const h = { count, paired: false };
      parents[level] = h;
      headers.push(h);
    } else if (tag === 67) {
      const tokens = tokenize(b);
      expected.push(
        word(tokens.length),
        ...tokens.flatMap((row) => row.map(word)),
      );
      stats.texts++;
      stats.units += n / 2;
      for (const row of tokens)
        stats[
          [
            "textRuns",
            "characterControls",
            "inlineControls",
            "extendedControls",
          ][row[2]]
        ]++;
      if (pairCounts) {
        assert.ok(parents[level - 1]);
        assert.equal(parents[level - 1].paired, false);
        assert.equal(parents[level - 1].count, n / 2);
        parents[level - 1].paired = true;
      }
    }
  }
  assert.equal(p, bytes.length);
  if (pairCounts)
    stats.headersWithoutText = headers.filter((h) => !h.paired).length;
  assert.deepEqual(
    call(8, Buffer.concat([word(v), bytes])),
    Buffer.concat(expected),
  );
  return stats;
}
function control(code) {
  return units(
    kinds[code] === 1
      ? [code]
      : [code, 0xffff, 0, 13, 0xd800, 0xfeff, 0x1234, code],
  );
}
export function bodyEdges(call) {
  for (const v of [0x05000107, 0x05000301, 0x05000302, version])
    for (let n = 0; n <= 28; n++) {
      const b = Buffer.from(
        Array.from({ length: n }, (_, i) => (i * 17 + 128) & 255),
      );
      if (n < 22 || (v >= 0x05000302 && n === 23))
        assert.throws(
          () => call(8, Buffer.concat([word(v), frame(66, b)])),
          /UnexpectedEnd/,
        );
      else checkBody(call, v, frame(66, b));
    }
  for (let code = 0; code < 32; code++) {
    const c = control(code),
      b = Buffer.concat([
        units([0x41, 0xd83d, 0xde00, 0xd800]),
        c,
        units([0xfeff, 0x42, 13]),
      ]);
    checkBody(call, version, frame(67, b));
    for (let n = 1; n < c.length; n++)
      assert.throws(
        () =>
          call(8, Buffer.concat([word(version), frame(67, c.subarray(0, n))])),
        n % 2 ? /InvalidTextSize/ : /UnexpectedEnd/,
      );
    if (c.length === 16) {
      const bad = Buffer.from(c);
      bad.writeUInt16LE(32, 14);
      assert.throws(
        () => call(8, Buffer.concat([word(version), frame(67, bad)])),
        /InvalidControlTerminator/,
      );
    }
  }
  for (const n of [0, 2, 4094, 4096, 131072])
    checkBody(call, version, frame(67, Buffer.alloc(n, 0x41)));
  const header = Buffer.alloc(24);
  header.writeUInt32LE(0x80000001);
  const text = units([13]);
  for (const level of [0, 1, 7, 1022])
    checkBody(
      call,
      version,
      Buffer.concat([
        frame(66, header, level, true),
        frame(67, text, level + 1, true),
      ]),
      true,
    );
  const good = Buffer.concat([frame(66, header, 0), frame(67, text)]);
  assert.throws(
    () => call(8, Buffer.concat([word(version), good]), 1),
    /LimitExceeded/,
  );
  checkBody(call, version, good, true);
  checkBody(call, version, frame(1023, Buffer.from([255]), 1023));
}
export function bodyMutations(call) {
  const full = Buffer.concat([
    units([0xfeff, 0xd83d, 0xde00, 0xd800]),
    ...Array.from({ length: 32 }, (_, code) => control(code)),
    units([0x41, 13]),
  ]);
  const cases = [
    [66, Buffer.alloc(24)],
    [67, full],
  ];
  let mutations = 0,
    accepted = 0,
    rejected = 0;
  for (const [tag, original] of cases) {
    const coverage = Buffer.alloc(original.length);
    for (let offset = 0; offset < original.length; offset++)
      for (let bit = 0; bit < 8; bit++) {
        const b = Buffer.from(original);
        b[offset] ^= 1 << bit;
        let error;
        try {
          call(8, Buffer.concat([word(version), frame(tag, b)]));
        } catch (e) {
          error = e;
        }
        if (error) {
          assert.match(
            error.message,
            /^(UnexpectedEnd|InvalidControlTerminator)$/,
          );
          rejected++;
        } else {
          checkBody(call, version, frame(tag, b));
          accepted++;
        }
        checkBody(call, version, frame(tag, original));
        coverage[offset] |= 1 << bit;
        mutations++;
      }
    assert.deepEqual(coverage, Buffer.alloc(original.length, 255));
  }
  assert.equal(mutations, 3152);
  return { mutations, accepted, rejected, recoveries: mutations };
}

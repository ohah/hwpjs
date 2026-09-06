import assert from "node:assert/strict";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const wire = (fields) =>
  Buffer.concat(
    fields.flatMap((b) => (b === null ? [w(0xffffffff)] : [w(b.length), b])),
  );
const string = (b, tail = Buffer.alloc(0)) =>
  Buffer.concat([w(b.length / 2), b, tail]);
export function xmlTemplateEdges(call) {
  let rejected = 0,
    accepted = 0;
  const run = (fields, limit) => call(29, wire(fields), limit);
  const good = [
    string(Buffer.from("<x/>", "utf16le")),
    null,
    string(Buffer.alloc(0)),
  ];
  const check = (fields) => {
    const total = fields.reduce((n, b) => n + (b?.length ?? 0), 0);
    const extra = fields.reduce(
      (n, b) => n + (b ? b.length - 4 - 2 * b.readUInt32LE(0) : 0),
      0,
    );
    const expected = Buffer.concat([w(total), w(extra), wire(fields)]);
    assert.deepEqual(run(fields, total), expected);
    accepted++;
    if (total) {
      assert.throws(() => run(fields, total - 1), /LimitExceeded/);
      rejected++;
    }
  };
  const reject = (fields) => {
    assert.throws(() => run(fields), /UnexpectedEnd/);
    rejected++;
    check(good);
  };
  // All eight combinations independently test absence, including all absent at limit zero.
  for (let mask = 0; mask < 8; mask++)
    check(
      Array.from({ length: 3 }, (_, i) =>
        mask & (1 << i) ? string(Buffer.alloc(0)) : null,
      ),
    );
  for (let field = 0; field < 3; field++) {
    const raw = string(Buffer.from([0, 0xd8, 0, 0, 0xff, 0xfe, 60, 0]));
    for (let n = 0; n < raw.length; n++) {
      const f = [null, null, null];
      f[field] = raw.subarray(0, n);
      reject(f);
    }
    for (const n of [0x7fffffff, 0x80000000, 0xffffffff]) {
      const f = [null, null, null];
      f[field] = w(n);
      reject(f);
    }
    for (const n of [0, 1, 127, 32768, 65536]) {
      const f = [null, null, null];
      f[field] = string(Buffer.alloc(n * 2, 0xd8), Buffer.from([9, 0, 8]));
      check(f);
    }
    // XML syntax is not this parser's claim: DOCTYPE, external entity and malformed XML remain raw.
    for (const text of [
      '<!DOCTYPE x SYSTEM "https://invalid.invalid/a"><x/>',
      "<x>&unknown;</y>",
      "\0\ud800",
    ]) {
      const f = [null, null, null];
      f[field] = string(Buffer.from(text, "utf16le"));
      check(f);
    }
  }
  return { accepted, rejected };
}

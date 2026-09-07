import assert from "node:assert/strict";
const word = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return b;
};
const version = 0x05000307;
const frame = (tag, level, b = Buffer.alloc(0)) =>
  Buffer.concat([word(tag | (level << 10) | (b.length << 20)), b]);
const extended = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);
const wide = new Set([...extended, 4, 5, 6, 7, 8, 9, 19, 20]);
function linkRows(bytes) {
  const nodes = [],
    stack = [],
    paragraphs = [];
  for (let p = 0; p < bytes.length; ) {
    const bits = bytes.readUInt32LE(p);
    p += 4;
    let n = bits >>> 20;
    if (n === 4095) {
      n = bytes.readUInt32LE(p);
      p += 4;
    }
    const level = (bits >>> 10) & 1023,
      tag = bits & 1023,
      raw = bytes.subarray(p, p + n);
    p += n;
    const i = nodes.length;
    const node = {
      tag,
      parent: level ? stack[level - 1] : null,
      raw,
      index: i,
      tokens: [],
      headers: [],
    };
    nodes.push(node);
    stack.length = level + 1;
    stack[level] = i;
    if (tag === 66) paragraphs.push(node);
    if (tag === 67) {
      const parent = nodes[node.parent];
      assert.equal(parent.tag, 66);
      for (let o = 0; o < raw.length; ) {
        const code = raw.readUInt16LE(o);
        if (extended.has(code))
          parent.tokens.push([i, o / 2, code, raw.readUInt32LE(o + 2)]);
        o += wide.has(code) ? 16 : 2;
      }
    }
    if (tag === 71) {
      const parent = nodes[node.parent];
      assert.equal(parent.tag, 66);
      parent.headers.push(node);
    }
  }
  const rows = [];
  for (const p of paragraphs) {
    assert.equal(p.tokens.length, p.headers.length);
    for (let i = 0; i < p.tokens.length; i++) {
      const [text, offset, code, id] = p.tokens[i],
        header = p.headers[i];
      const headerId = header.raw.readUInt32LE();
      let identity = 0;
      if (id !== headerId) {
        assert.ok(id === 0x25256d65 || id === 0x25252a64);
        assert.equal(headerId, 0x25756e6b);
        assert.equal(code, 3);
        const units = header.raw.readUInt16LE(9),
          end = 11 + units * 2;
        assert.ok(end + 4 <= header.raw.length);
        if (id === 0x25256d65) assert.ok(
          header.raw
            .subarray(11, end)
            .subarray(0, 10)
            .equals(Buffer.from("MEMO/", "utf16le")),
        );
        else assert.deepEqual(header.raw.subarray(11,end),Buffer.from('$RevisionDelete;','utf16le'));
        identity = id === 0x25256d65 ? 1 : 2;
      }
      rows.push([
        p.index,
        text,
        header.index,
        offset,
        code,
        id,
        headerId,
        identity,
      ]);
    }
  }
  return rows;
}
export {linkRows as controlLinkEvidence};
export function linksActual(call, v, bytes) {
  const rows = linkRows(bytes);
  assert.deepEqual(
    call(13, Buffer.concat([word(v), bytes])),
    Buffer.concat(rows.flatMap((r) => r.slice(0, 6).map(word))),
  );
  return rows.length;
}
export function identityActual(call, v, bytes) {
  const rows = linkRows(bytes);
  assert.deepEqual(
    call(38, Buffer.concat([word(v), bytes])),
    Buffer.concat(rows.flatMap((r) => r.map(word))),
  );
  return rows.reduce((n, r) => n + Number(r[7] !== 0), 0);
}
export function linkEdges(call) {
  const header = frame(66, 0, Buffer.alloc(24));
  const token = (id, code = 11) => {
    const b = Buffer.alloc(16, 255);
    b.writeUInt16LE(code);
    b.writeUInt32LE(id >>> 0, 2);
    b.writeUInt16LE(code, 14);
    return b;
  };
  const ctrl = (id, level = 1) => frame(71, level, word(id));
  const text = (id, level = 1) => frame(67, level, token(id));
  const good = Buffer.concat([header, text(0x74626c20), ctrl(0x74626c20)]);
  const run = (b) => call(13, Buffer.concat([word(version), b]));
  assert.equal(linksActual(call, version, good), 1);
  for (const [b, error] of [
    [text(1, 0), /OrphanParagraphRecord/],
    [Buffer.concat([header, text(1)]), /MissingControlHeader/],
    [Buffer.concat([header, ctrl(1)]), /MissingControlToken/],
    [ctrl(1, 0), /OrphanControlHeader/],
    [
      Buffer.concat([header, frame(1023, 1), ctrl(1, 2)]),
      /OrphanControlHeader/,
    ],
    [
      Buffer.concat([header, text(1), text(1), ctrl(1)]),
      /DuplicateParagraphRecord/,
    ],
    [Buffer.concat([header, text(1), ctrl(2)]), /ControlIdMismatch/],
    [
      Buffer.concat([
        header,
        frame(67, 1, Buffer.concat([token(1), token(2)])),
        ctrl(2),
        ctrl(1),
      ]),
      /ControlIdMismatch/,
    ],
  ]) {
    assert.throws(() => run(b), error);
    linksActual(call, version, good);
  }
  // Repeated IDs are occurrence-based, not a global ID map. Skip inline controls.
  const body = Buffer.concat([
    Buffer.from([65, 0]),
    token(0, 9),
    token(7),
    token(7),
  ]);
  assert.equal(
    linksActual(
      call,
      version,
      Buffer.concat([header, frame(67, 1, body), ctrl(7), ctrl(7)]),
    ),
    2,
  );
  // Nested paragraph belongs to outer control, not the outer paragraph's token list.
  assert.equal(
    linksActual(
      call,
      version,
      Buffer.concat([
        good,
        frame(66, 2, Buffer.alloc(24)),
        text(3, 3),
        ctrl(3, 3),
      ]),
    ),
    2,
  );
  assert.equal(linksActual(call, version, Buffer.alloc(0)), 0);
  for (let bit = 0; bit < 32; bit++) {
    const id = (0x74626c20 ^ (2 ** bit)) >>> 0;
    assert.throws(
      () => run(Buffer.concat([header, text(id), ctrl(0x74626c20)])),
      /ControlIdMismatch/,
    );
    assert.equal(
      linksActual(call, version, Buffer.concat([header, text(id), ctrl(id)])),
      1,
    );
    linksActual(call, version, good);
  }
  return { idMutations: 32, recoveries: 32 };
}

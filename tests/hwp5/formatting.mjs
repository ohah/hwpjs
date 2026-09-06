import assert from "node:assert/strict";
import { checkDocinfo } from "./docinfo.mjs";

function word(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}
function frame(tag, b, level = 1) {
  return Buffer.concat([word(tag | (level << 10) | (b.length << 20)), b]);
}
export function formattingEdges(call) {
  const version = 0x05010001;
  const tab = Buffer.from("0300008001000000fffffffffefd3412aa", "hex");
  const bullet = Buffer.from(
    "0800000000003200ffffffff222001000000f6140334121327aa",
    "hex",
  );
  const style = Buffer.from("010000d80000fffeffff34127856abcd", "hex");
  const numbering = Buffer.alloc(184);
  numbering[98] = 7;
  numbering[100] = 9;
  numbering[128] = 0x81;
  numbering[170] = 11;
  const cases = [
    [22, tab, 16, []],
    [23, numbering, 182, [100, 128]],
    [24, bullet, 25, [14, 23]],
    [26, style, 14, []],
  ];
  for (const [tag, b, required, optional] of cases) {
    for (let n = 0; n < required; n++) {
      const input = frame(tag, b.subarray(0, n));
      if (optional.includes(n)) checkDocinfo(call, version, input);
      else
        assert.throws(
          () => call(4, Buffer.concat([word(version), input])),
          /UnexpectedEnd/,
        );
    }
    checkDocinfo(call, version, frame(tag, b));
    assert.throws(
      () => call(4, Buffer.concat([word(version), frame(tag, b, 0)])),
      /InvalidDocInfoLevel/,
    );
    checkDocinfo(call, version, frame(tag, b)); // recovery
  }
  for (const v of [0x05000204, 0x05000205, 0x05000300, 0x05010000])
    checkDocinfo(call, v, frame(23, numbering));
  assert.throws(
    () =>
      call(
        4,
        Buffer.concat([
          word(version),
          frame(22, Buffer.from("00000000ffffffff", "hex")),
        ]),
      ),
    /UnexpectedEnd/,
  );
  // Nonempty formats in all ten levels, distinct headers, embedded NUL/surrogate.
  const levels = Array.from({ length: 10 }, (_, i) => {
    const b = Buffer.alloc(20, i + 1);
    b.writeUInt16LE(3, 12);
    b.writeUInt16LE(0, 14);
    b.writeUInt16LE(0xd800, 16);
    b.writeUInt16LE(0x5e, 18);
    return b;
  });
  const rich = Buffer.concat([
    ...levels.slice(0, 7),
    Buffer.from([3, 0]),
    ...Array.from({ length: 7 }, (_, i) => word(i)),
    ...levels.slice(7),
    word(8),
    word(9),
    word(10),
    Buffer.from([0xee]),
  ]);
  checkDocinfo(call, version, frame(23, rich));
}

export function formattingMutations(call) {
  const cases = [
    [22, Buffer.alloc(16)],
    [23, Buffer.alloc(182)],
    [24, Buffer.alloc(25)],
    [26, Buffer.alloc(14)],
  ];
  cases[0][1].writeUInt32LE(1, 4);
  function checkMutation(tag, original, b) {
    let error;
    try {
      call(4, Buffer.concat([word(0x05010001), frame(tag, b)]));
    } catch (e) {
      error = e;
    }
    if (error) assert.equal(error.message, "UnexpectedEnd");
    else checkDocinfo(call, 0x05010001, frame(tag, b));
    checkDocinfo(call, 0x05010001, frame(tag, original));
    return !error;
  }
  let seed = 0x713a58,
    accepted = 0,
    rejected = 0;
  for (let i = 0; i < 1000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const [tag, original] = cases[i % cases.length];
    const b = Buffer.from(original);
    b[seed % b.length] ^= seed >>> 24 || 1;
    if (checkMutation(tag, original, b)) accepted++;
    else rejected++;
  }
  // LCG low bits correlate with i % 4: random repetition does not guarantee
  // position coverage. Enumerate every bit independently of the random sweep.
  const exhaustive = [];
  for (const [tag, original] of cases) {
    const coverage = Buffer.alloc(original.length);
    let passed = 0,
      failed = 0;
    for (let offset = 0; offset < original.length; offset++) {
      for (let bit = 0; bit < 8; bit++) {
        const b = Buffer.from(original);
        b[offset] ^= 1 << bit;
        if (checkMutation(tag, original, b)) passed++;
        else failed++;
        coverage[offset] |= 1 << bit;
      }
    }
    assert.deepEqual(coverage, Buffer.alloc(original.length, 255));
    assert.equal(passed + failed, original.length * 8);
    exhaustive.push({
      tag,
      positions: original.length,
      mutations: passed + failed,
      accepted: passed,
      rejected: failed,
      recoveries: passed + failed,
    });
  }
  assert.deepEqual(
    exhaustive.map(({ tag, positions, mutations }) => ({
      tag,
      positions,
      mutations,
    })),
    [
      { tag: 22, positions: 16, mutations: 128 },
      { tag: 23, positions: 182, mutations: 1456 },
      { tag: 24, positions: 25, mutations: 200 },
      { tag: 26, positions: 14, mutations: 112 },
    ],
  );
  return { mutations: 1000, accepted, rejected, recoveries: 1000, exhaustive };
}

export function formattingCounts(bytes) {
  const counts = { tabDef: 0, numbering: 0, bullet: 0, style: 0 };
  const names = { 22: "tabDef", 23: "numbering", 24: "bullet", 26: "style" };
  let offset = 0;
  while (offset < bytes.length) {
    const bits = bytes.readUInt32LE(offset);
    offset += 4;
    let length = bits >>> 20;
    if (length === 4095) {
      length = bytes.readUInt32LE(offset);
      offset += 4;
    }
    const name = names[bits & 1023];
    if (name) counts[name]++;
    offset += length;
  }
  assert.equal(offset, bytes.length);
  return counts;
}

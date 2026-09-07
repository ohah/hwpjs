import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import {historyDateEvidence} from './history-date-evidence.mjs';
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const u = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const rec = (tag, b = Buffer.alloc(0)) =>
  Buffer.concat([Buffer.from([tag]), w(b.length), b]);
const start = (flags, layout = 1) =>
  rec(
    16,
    layout === 1
      ? Buffer.concat([u(flags), w(1)])
      : Buffer.concat([w(1), u(flags)]),
  );
const end = rec(17);
const run = (
  call,
  b,
  mode = 1,
  records = 1000000,
  payload = 64 * 1024 * 1024,
) => call(30, Buffer.concat([Buffer.from([mode]), w(payload), b]), records);
function expected(b, mode) {
  let pos = 0;
  const rows = [];
  while (pos < b.length) {
    const tag = b[pos],
      len = b.readUInt32LE(pos + 1);
    assert.ok(len <= b.length - pos - 5);
    rows.push({ tag, b: b.subarray(pos + 5, pos + 5 + len) });
    pos += 5 + len;
  }
  const first = rows[0].b,
    flags = first.readUInt16LE(mode === 1 || mode === 3 ? 0 : 4),
    option = first.readUInt32LE(mode === 1 || mode === 3 ? 2 : 0);
  const report = [rows.length, 0, 0, 0, 0, first.length - 6, 0, 0,0,0,0,0];
  let seen = 0;
  for (const { tag, b } of rows.slice(1)) {
    const bit = { 32: 1, 33: 2, 34: 4, 35: 8, 48: 16 }[tag] ?? 0;
    if (bit & seen) report[6]++;
    seen |= bit;
    if (tag === 32) report[5] += b.length - 4;
    else if (tag === 33) {
      if(mode<3)report[2]++;
      else {const d=historyDateEvidence(b);report[8]++;report[9]+=Number(d.mask!==0);report[10]+=Number(d.calendar===2);report[11]+=Number(d.weekday===2);report[5]+=d.extra;}
    }
    else if ([34, 35, 48, 49].includes(tag)) {
      report[3]++;
      report[4] += b.length / 2;
      if (tag === 49) report[7]++;
    } else if (tag !== 17) report[1]++;
  }
  return Buffer.concat([...[flags, option, ...report].map(w), b]);
}
export function historyEdges(call) {
  let rejected = 0,
    accepted = 0;
  const good = Buffer.concat([
    start(31),
    rec(32, w(0xffffffff)),
    rec(33, Buffer.alloc(16)),
    rec(34, Buffer.from([0, 0xd8])),
    rec(35),
    rec(48),
    end,
  ]);
  const check = (b, mode = 1) => {
    assert.deepEqual(run(call, b, mode), expected(b, mode));
    accepted++;
  };
  const reject = (b, re, mode = 1, records, payload) => {
    assert.throws(() => run(call, b, mode, records, payload), re);
    rejected++;
    check(good);
  };
  check(good);
  for (let i = 0; i < good.length; i++)
    reject(good.subarray(0, i), /UnexpectedEnd|MissingHistory/);
  for (const b of [
    Buffer.concat([end, start(0)]),
    Buffer.concat([start(0), start(0), end]),
    Buffer.concat([start(0), end, end]),
  ])
    reject(b, /MissingHistoryStart|NestedHistoryStart|RecordAfterHistoryEnd/);
  for (const bit of [1, 2, 4, 8, 16])
    reject(Buffer.concat([start(bit), end]), /HistoryPresenceMismatch/);
  reject(
    Buffer.concat([start(0), rec(32, w(1)), end]),
    /HistoryPresenceMismatch/,
  );
  for (const tag of [34, 35, 48, 49])
    reject(
      Buffer.concat([
        start({ 34: 4, 35: 8, 48: 16 }[tag] ?? 0),
        rec(tag, Buffer.from([0])),
        end,
      ]),
      /InvalidHistoryTextSize/,
    );
  reject(
    Buffer.concat([start(0), rec(17, Buffer.from([0]))]),
    /InvalidHistoryEndPayload/,
  );
  reject(good, /LimitExceeded/, 1, 6);
  assert.deepEqual(run(call, good, 1, 7), expected(good, 1));
  reject(good, /LimitExceeded/, 1, 7, 15);
  assert.deepEqual(run(call, good, 1, 7, 16), expected(good, 1));
  for (const size of [0x7fffffff, 0x80000000, 0xffffffff]) {
    const b = Buffer.concat([Buffer.from([255]), w(size)]);
    reject(b, /UnexpectedEnd/, 0, 1, 0xffffffff);
    reject(b, /LimitExceeded/, 0, 1, 0);
  }
  for (let tag = 0; tag < 256; tag++)
    if (![16, 17, 32, 33, 34, 35, 48, 49].includes(tag))
      check(Buffer.concat([start(0x8040), rec(tag, Buffer.from([7])), end]));
  check(Buffer.concat([start(1), rec(32, w(1)), rec(32, w(2)), end]));
  check(Buffer.concat([start(2), rec(33, Buffer.from([7])), end]));
  check(
    Buffer.concat([start(0, 2), rec(49, Buffer.from("<x/>", "utf16le")), end]),
    2,
  );
  assert.deepEqual(run(call, Buffer.alloc(0), 0, 0), Buffer.alloc(0));
  return { accepted, rejected };
}
export function historyActual(call, cfb) {
  const path = new URL(
    "../../reference/rhwp/samples/basic/treatise sample.hwp",
    import.meta.url,
  );
  if (!existsSync(path)) return { skipped: "reference fixture unavailable" };
  cfb.parse(readFileSync(path), { strict: true });
  let decoded = 0,
    records = 0;
  for (let i = 0; i < 4; i++) {
    const compressed = Buffer.from(
      cfb.findExact(`/DocHistory/VersionLog${i}`).content,
    );
    const b = inflateRawSync(compressed);
    decoded += b.length;
    // These observed streams carry the same CRC32/ISIZE tail as other HWP streams.
    // Exercise the existing decoder, not a new guessed history encryption policy.
    const header = Buffer.from(cfb.findExact("/FileHeader").content);
    assert.deepEqual(call(3, Buffer.concat([header, compressed]), b.length), b);
    const corrupt = Buffer.from(compressed);
    corrupt[corrupt.length - 8] ^= 1;
    assert.throws(
      () => call(3, Buffer.concat([header, corrupt]), b.length),
      /InvalidChecksum/,
    );
    const out = run(call, b, 2);
    assert.deepEqual(out, expected(b, 2));
    records += out.readUInt32LE(8);
    assert.equal(out.readUInt32LE(0), 159);
    assert.throws(() => run(call, b, 1), /HistoryPresenceMismatch/);
  }
  assert.equal(decoded, 107676);
  assert.equal(records, 28);
  return { items: 4, decoded, records, dateDeferred: 4 };
}
export {expected as historyExpected,run as historyRun};

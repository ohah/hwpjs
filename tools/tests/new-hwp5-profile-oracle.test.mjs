// Pure synthetic records. No WASM, SDK, binary fixture or product writer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectNewHwp5Profile } from './new-hwp5-profile-oracle.mjs';

function authored(modern = true) {
  const header = Buffer.alloc(256);
  header.writeUInt32LE(modern ? 0x05000300 : 0x05000107, 32);
  const mapping = Buffer.alloc(modern ? 64 : 60);
  for (const index of [1, 2, 3, 4, 5, 6, 7, 9, 10, 13, 14]) mapping.writeUInt32LE(1, index * 4);
  const paragraph = Buffer.alloc(modern ? 54 : 46);
  if (modern) paragraph.writeUInt32LE(160, 50);
  const secd = Buffer.alloc(30);
  secd.writeUInt32LE(0x73656364);
  const note = () => {
    const payload = Buffer.alloc(28);
    payload.writeUInt16LE(1, 10);
    return { tag: 74, level: 2, payload };
  };
  return {
    header,
    info: [
      { tag: 17, payload: mapping },
      { tag: 21, payload: Buffer.alloc(modern ? 74 : 68) },
      { tag: 25, payload: paragraph },
    ],
    body: [
      { tag: 71, level: 1, payload: secd },
      ...(modern ? [note(), note(), { tag: 75, level: 2, payload: Buffer.alloc(14) }] : []),
    ],
  };
}

test('new profile oracle requires modern default and explicit exact legacy', () => {
  assert.equal(inspectNewHwp5Profile(authored()).version, 0x05000300);
  assert.throws(() => inspectNewHwp5Profile(authored(false)));
  assert.equal(inspectNewHwp5Profile(authored(false), 'legacy_5_0_1_7').version, 0x05000107);
  assert.throws(() => inspectNewHwp5Profile(authored(), 'legacy_5_0_1_7'));
});
test('new profile oracle rejects header only upgrade and mapping drift', () => {
  const mixed = authored(false);
  mixed.header.writeUInt32LE(0x05000300, 32);
  assert.throws(() => inspectNewHwp5Profile(mixed));
  const wrong = authored();
  wrong.info[0].payload.writeUInt32LE(1, 60);
  assert.throws(() => inspectNewHwp5Profile(wrong));
});
test('new profile oracle rejects missing independent fields and spacing drift', () => {
  const short = authored();
  short.info[1].payload = short.info[1].payload.subarray(0, 68);
  assert.throws(() => inspectNewHwp5Profile(short));
  const spacing = authored();
  spacing.info[2].payload.writeUInt32LE(159, 50);
  assert.throws(() => inspectNewHwp5Profile(spacing));
});
test('new profile oracle keeps spec26 distinct from explicit observed28', () => {
  const input = authored();
  input.body[1].payload = input.body[1].payload.subarray(0, 26);
  assert.throws(() => inspectNewHwp5Profile(input));
});
test('new profile oracle rejects wrong physical owner and missing note', () => {
  const owner = authored();
  owner.body[0].payload.writeUInt32LE(0x636f6c64);
  assert.throws(() => inspectNewHwp5Profile(owner));
  const missing = authored();
  missing.body.splice(1, 1);
  assert.throws(() => inspectNewHwp5Profile(missing));
});
test('new profile oracle rejects printed border12 and duplicate border', () => {
  const short = authored();
  short.body[3].payload = Buffer.alloc(12);
  assert.throws(() => inspectNewHwp5Profile(short));
  const duplicate = authored();
  duplicate.body.push({ ...duplicate.body[3] });
  assert.throws(() => inspectNewHwp5Profile(duplicate));
});

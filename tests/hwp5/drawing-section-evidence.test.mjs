import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectDrawingSection} from './drawing-section-evidence.mjs';

const header = Buffer.alloc(256);
header.writeUInt32LE(0x05000107, 32);
function frame(tag) {
  const b = Buffer.alloc(12);
  b.writeUInt32LE((8 << 20) | tag);
  return b;
}
const raw = Buffer.concat([frame(77), frame(98), frame(98)]);
const section = {name:'Section7',raw};
const expected = [12,24].map(offset => ({name:'synthetic.hwp',section:'Section7',offset,bytes:8}));

for (const failure of [null, new Error('InvalidShapeOwner'), new WebAssembly.RuntimeError('InjectedTrap'), new TypeError('HostBug')]) {
  test(`inventory precedes hierarchy: ${failure?.constructor.name ?? 'success'}`, () => {
    const inventory = [];
    const calls = [];
    const call = (mode, bytes) => {
      calls.push(mode);
      if (mode === 3) {
        assert.deepEqual(bytes, Buffer.concat([header,raw]));
        return raw;
      }
      assert.equal(mode,51);
      assert.deepEqual(bytes,Buffer.concat([header.subarray(32,36),raw]));
      assert.deepEqual(inventory,expected);
      if (failure) throw failure;
      return Buffer.alloc(0);
    };
    const run = () => inspectDrawingSection(call,header,section,'synthetic.hwp',inventory);
    if (failure) assert.throws(run,e => e === failure);
    else {
      const result = run();
      assert.equal(result.bytes,raw);
      assert.equal(result.records.length,3);
    }
    assert.deepEqual(calls,[3,51]);
    assert.deepEqual(inventory,expected);
  });
}

test('decode and framing failures cannot manufacture inventory or reach hierarchy', () => {
  for (const bad of [null,raw.subarray(0,raw.length-1)]) {
    const inventory = [];
    const failure = new Error('InvalidDeflate');
    let calls = 0;
    assert.throws(() => inspectDrawingSection(mode => {
      calls++;
      assert.equal(mode,3);
      if (bad === null) throw failure;
      return bad;
    },header,section,'synthetic.hwp',inventory),e => bad === null ? e === failure : e.constructor === assert.AssertionError);
    assert.equal(calls,1);
    assert.deepEqual(inventory,[]);
  }
});

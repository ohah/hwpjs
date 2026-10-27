import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { copyOwned, ownObservation } from '../../src/state/owned.ts';
import { EditorState } from '../../src/state/editor-state.ts';

test('byte boundaries copy Buffer slices and ArrayBuffer; reject shared/accessor/cycle/class payloads', () => {
  const source = Buffer.from([1, 2, 3]);
  const owned = copyOwned(source.subarray(1));
  source[1] = 9;
  assert.equal(owned[0], 2);
  const ab = new Uint8Array([5]).buffer;
  const copied = copyOwned(ab);
  new Uint8Array(ab)[0] = 8;
  assert.equal(new Uint8Array(copied)[0], 5);
  assert.throws(() => copyOwned(new SharedArrayBuffer(1)), /SharedBuffer/);
  assert.throws(() => copyOwned(new Uint8Array(new SharedArrayBuffer(1))), /SharedBuffer/);
  const cycle: any = {};
  cycle.self = cycle;
  assert.throws(() => copyOwned(cycle), /Cyclic/);
  let accessed = false;
  const payload = {
    get x() {
      accessed = true;
      return 1;
    },
  };
  assert.throws(() => copyOwned(payload), /Accessor/);
  assert.equal(accessed, false);
  assert.throws(() => copyOwned(new Date()), /Unsupported/);
  assert.throws(() => copyOwned({ fn() {} }), /Unsupported/);
});
test('state getters isolate mutable Map/Set/ArrayBuffer values and redact secrets', () => {
  const source = {
    map: new Map([['data', new Uint8Array([2])]]),
    set: new Set([new Uint8Array([3])]),
    buffer: new Uint8Array([4]).buffer,
    password: 'secret',
  };
  const state = new EditorState({
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 1,
    status: 'ready',
    content: source,
  });
  source.map.get('data')![0] = 99;
  const a = state.content as any;
  a.map.get('data')[0] = 88;
  [...a.set][0][0] = 77;
  new Uint8Array(a.buffer)[0] = 66;
  const b = state.content as any;
  assert.equal(b.map.get('data')[0], 2);
  assert.equal([...b.set][0][0], 3);
  assert.equal(new Uint8Array(b.buffer)[0], 4);
  assert.equal('password' in b, false);
  assert.throws(() => state.read(async () => 1), /AsyncRead/);
});

test('plain observation identity is stable while each typed-buffer access is a fresh copy', () => {
  const state = new EditorState({
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 1,
    status: 'ready',
    content: { paragraphs: [{ text: 'large immutable text' }], binary: new Uint8Array([1, 2]) },
  });
  const first = state.content as any;
  assert.ok(first === state.content);
  assert.equal(first.paragraphs, (state.content as any).paragraphs);
  assert.notEqual(first.binary, first.binary);
  first.binary[0] = 99;
  assert.equal(first.binary[0], 1);
  assert.ok(Object.isFrozen(first.paragraphs[0]));
});

test('내부 관측 재사용은 byte getter의 복제 격리와 외부 입력 거부를 보존', () => {
  const source = new Uint8Array([7, 8]);
  const observed = ownObservation({ bytes: source })();
  source[0] = 99;
  assert.equal(typeof Object.getOwnPropertyDescriptor(observed, 'bytes')?.get, 'function');
  assert.equal(copyOwned(observed, true), observed);
  const first = observed.bytes;
  const second = observed.bytes;
  assert.notEqual(first, second);
  first[0] = 42;
  assert.equal(second[0], 7);
  assert.equal(observed.bytes[0], 7);
  assert.throws(() => copyOwned(observed, false), /AccessorPayloadUnsupported/);
  let calls = 0;
  const foreign = Object.freeze({
    get bytes() {
      calls++;
      return source;
    },
  });
  assert.throws(() => copyOwned(foreign, true), /AccessorPayloadUnsupported/);
  assert.throws(() => copyOwned(foreign, false), /AccessorPayloadUnsupported/);
  assert.equal(calls, 0);
});
test('중첩 내부 관측은 build에서 원본 identity와 byte 소유권을 함께 보존', () => {
  const child = ownObservation({ bytes: new Uint8Array([5]) })();
  const parent = ownObservation({ child })();
  assert.equal(parent.child, child);
  parent.child.bytes[0] = 66;
  assert.equal(parent.child.bytes[0], 5);
});

import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const module = new WebAssembly.Module(readFileSync(new URL('./probe.wasm', import.meta.url)));
const imports = WebAssembly.Module.imports(module);
console.log('imports:', imports);
// Deliberately do not supply filesystem, WASI runtime, or Node capabilities.
// Every attempted host call fails, so passing proves this path needs none.
const host = {};
for (const { module: namespace, name, kind } of imports) {
  assert.equal(kind, 'function');
  (host[namespace] ??= {})[name] = () => { throw new Error(`unexpected host call: ${namespace}.${name}`); };
}
const { exports: wasm } = new WebAssembly.Instance(module, host);
wasm._initialize?.();
const fixtures = new URL('../../crates/hwp-core/tests/fixtures/', import.meta.url);
const output = wasm.malloc(32 * 1024 * 1024);
assert.ok(output);
let passed = 0;
let streams = 0;
for (const name of readdirSync(fixtures).filter(name => name.endsWith('.hwp'))) {
  const bytes = readFileSync(new URL(name, fixtures));
  const input = wasm.malloc(bytes.length);
  assert.ok(input);
  new Uint8Array(wasm.memory.buffer, input, bytes.length).set(bytes);
  for (const path of ['FileHeader', 'DocInfo']) {
    const encoded = new TextEncoder().encode(path + '\0');
    const pathPtr = wasm.malloc(encoded.length);
    assert.ok(pathPtr);
    new Uint8Array(wasm.memory.buffer, pathPtr, encoded.length).set(encoded);
    const size = wasm.extract_stream(input, bytes.length, pathPtr, output, 32 * 1024 * 1024);
    assert.ok(size > 0, `${name}: ${path} returned ${size}`);
    if (path === 'FileHeader') {
      assert.equal(size, 256, name);
      assert.equal(new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, output, 17)), 'HWP Document File', name);
    }
    streams++;
    wasm.free(pathPtr);
  }
  wasm.free(input);
  passed++;
}
wasm.free(output);
console.log(JSON.stringify({ passed, streams, hostCalls: 0 }));

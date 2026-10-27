import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
if (!process.argv[2]) throw Error('명시 실행 디렉터리가 필요합니다');
const d = path.resolve(process.argv[2]);
const wasm = fs.readFileSync(path.join(d, 'old455-payload-diagnostic.wasm'));
const input = fs.readFileSync(path.join(d, 'legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
if (sha(input) !== 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f')
  throw Error('입력 SHA 불일치');
const module = await WebAssembly.compile(wasm);
const imports = WebAssembly.Module.imports(module);
if (imports.length) throw Error('진단 외부 import를 허용하지 않습니다');
const instance = await WebAssembly.instantiate(module, {});
const e = instance.exports;
const ptr = e.diagnostic_alloc(input.length);
if (!ptr) throw Error('할당 실패');
let cost;
try {
  new Uint8Array(e.memory.buffer, ptr, input.length).set(input);
  cost = e.diagnostic_payload_cost(ptr, input.length);
  if (!cost) {
    const msg = new TextDecoder().decode(
      new Uint8Array(e.memory.buffer, e.diagnostic_error_pointer(), e.diagnostic_error_length()),
    );
    throw Error(msg);
  }
} finally {
  e.diagnostic_free(ptr, input.length);
}
const result = {
  target: 'wasm32-freestanding-none',
  pointerBits: 32,
  oldCommit: 'ac196c0720a438871af26228051bcd3e738e15c6',
  inputSHA256: sha(input),
  diagnosticWasmSHA256: sha(wasm),
  diagnosticBytes: wasm.length,
  payloadCost: cost,
  imports,
  nodeVersion: process.version,
  currentEngineUsed: false,
  productWasm: false,
};
fs.writeFileSync(path.join(d, 'PAYLOAD32-ACTUAL.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));

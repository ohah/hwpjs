import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
if (!process.argv[2]) throw Error('명시 실행 디렉터리가 필요합니다');
const d = path.resolve(process.argv[2]);
const wasm = fs.readFileSync(path.join(d, 'old455-refusal-diagnostic.wasm'));
const bytes = fs.readFileSync(path.join(d, 'legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
if (sha(bytes) !== 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f')
  throw Error('입력 SHA 불일치');
const module = await WebAssembly.compile(wasm);
if (WebAssembly.Module.imports(module).length) throw Error('외부 import 거부');
const { exports: e } = await WebAssembly.instantiate(module, {});
const ptr = e.diagnostic_alloc(bytes.length);
if (!ptr) throw Error('할당 실패');
const rows = [];
try {
  new Uint8Array(e.memory.buffer, ptr, bytes.length).set(bytes);
  for (const cap of [12665, 12666]) {
    const stage = e.diagnostic_refusal(ptr, bytes.length, cap);
    const error = new TextDecoder().decode(
      new Uint8Array(e.memory.buffer, e.diagnostic_error_pointer(), e.diagnostic_error_length()),
    );
    const revisionRaw = e.diagnostic_revision() >>> 0;
    const saved = Buffer.from(
      new Uint8Array(e.memory.buffer, e.diagnostic_saved_pointer(), e.diagnostic_saved_length()),
    );
    const exact = saved.equals(bytes);
    const attempted = Boolean(e.diagnostic_attempted());
    if (error !== 'LimitExceeded' || !exact) throw Error('거부/원본 보존 실패');
    if (cap === 12665 && (stage !== 1 || attempted || revisionRaw !== 0xffffffff))
      throw Error('초기화 단계 기대 불일치');
    if (cap === 12666 && (stage !== 2 || !attempted || revisionRaw !== 0))
      throw Error('적용 단계 기대 불일치');
    rows.push({
      cap,
      stage: stage === 1 ? 'init' : 'apply',
      error,
      spliceAttempted: attempted,
      revision: revisionRaw === 0xffffffff ? null : revisionRaw,
      savedBytes: saved.length,
      savedSHA256: sha(saved),
      originalExact: exact,
    });
  }
} finally {
  e.diagnostic_free(ptr, bytes.length);
}
const result = {
  oldCommit: 'ac196c0720a438871af26228051bcd3e738e15c6',
  target: 'wasm32-freestanding-none',
  diagnosticWasmSHA256: sha(wasm),
  diagnosticBytes: wasm.length,
  inputSHA256: sha(bytes),
  rows,
  nodeVersion: process.version,
  currentEngineUsed: false,
  productWasm: false,
};
fs.writeFileSync(path.join(d, 'REFUSAL32-ACTUAL.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));

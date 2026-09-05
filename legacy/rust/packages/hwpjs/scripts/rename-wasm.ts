import { renameSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const distDir = join(process.cwd(), 'dist');

// WASM 파일명 변경
const wasmSrc = join(distDir, 'hwpjs.wasm');
const wasmDest = join(distDir, 'hwpjs.wasm32-wasi.wasm');
const wasmDebug = join(distDir, 'hwpjs.debug.wasm');

if (existsSync(wasmSrc)) {
  // 목적지 파일이 이미 있으면 먼저 삭제
  if (existsSync(wasmDest)) {
    unlinkSync(wasmDest);
  }
  renameSync(wasmSrc, wasmDest);
  console.log('✓ Renamed hwpjs.wasm to hwpjs.wasm32-wasi.wasm');

  console.log('✓ Copied hwpjs.wasm32-wasi.wasm to npm/wasm32-wasi/');
}

// hwpjs.debug.wasm 삭제
if (existsSync(wasmDebug)) {
  unlinkSync(wasmDebug);
  console.log('✓ Removed hwpjs.debug.wasm');
}

console.log('✓ WASM rename and copy completed');

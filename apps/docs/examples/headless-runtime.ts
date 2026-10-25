import { createReaderRuntimeFactory, createWasmModuleLoader } from '@ohah/hwpjs/runtime';

// Bun/Node의 fetch 또는 브라우저 fetch가 접근 가능한 WASM URL입니다.
// 파일 읽기와 HTTP 인증 정책은 호출 앱에서 처리합니다.
export function createHeadlessRuntime(wasmURL: string | URL) {
  const loadWasmModule = createWasmModuleLoader({ url: wasmURL });
  return createReaderRuntimeFactory({ loadWasmModule });
}

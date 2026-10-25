import { createEditor } from '@hwpjs/core';
import { createWorkerRuntimeFactory } from '@hwpjs/core/runtime';

export interface BrowserAssets {
  workerURL: string | URL;
  wasmURL: string | URL;
}

// 앱이 배포한 동일 빌드의 worker.js와 hwpjs.wasm URL을 전달합니다.
export function createBrowserEditor(assets: BrowserAssets) {
  const runtimeFactory = createWorkerRuntimeFactory(assets);
  return createEditor({
    runtimeFactory,
    onError: ({ error }) => console.error(error),
  });
}

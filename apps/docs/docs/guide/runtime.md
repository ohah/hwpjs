# Runtime · WASM 설정

`createEditor`는 문서마다 Runtime을 주입받습니다. core를 import하는 것과 브라우저 Worker를 실제 생성하는 시점은 다릅니다. factory는 호출마다 새 runtime을 반환해야 하며, 같은 문서 인스턴스를 여러 editor에 공유하지 않습니다.

## 브라우저 Worker

앱이 배포한 `worker.js`와 `hwpjs.wasm` URL을 전달합니다. 아래 예제의 URL 값은 호출 앱이 결정합니다. 문서 사이트의 `/docs/`와 제품 runtime의 경로를 같다고 가정하지 마세요.

<!-- example:runtime.ts -->
```ts
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
```

같은 빌드에서 나온 worker와 WASM을 사용하세요. `@hwpjs/core/worker`와 `@hwpjs/core/wasm`은 패키지 export 경로이지 모든 번들러가 자동 복사하는 웹 URL은 아닙니다. 앱의 asset 복사 또는 번들러 URL 처리 후 실제 URL을 넘깁니다. Worker는 module worker로 로드되며 CSP·origin·MIME 정책도 호스트가 설정합니다.

현재 데모는 `/hwpjs/worker.js`, `/hwpjs/hwpjs.wasm`을 주입합니다. 이 경로는 데모 서버의 계약이며 모든 소비 앱의 기본 설치 경로가 아닙니다. WASM을 바꾼 뒤 문서 사이트만 재빌드해도 제품 runtime은 갱신되지 않습니다.

## DOM 없이 Reader runtime 사용

브라우저 UI가 필요 없다면 Reader factory를 사용할 수 있습니다. 아래 코드는 Worker나 DOM 없이 fetch로 WASM을 읽습니다. 런타임이 fetch를 제공하고 URL에 접근할 수 있어야 합니다. 로컬 파일 읽기는 앱에서 처리하거나 컴파일한 `WebAssembly.Module`을 Reader factory에 직접 전달하세요.

<!-- example:headless-runtime.ts -->
```ts
import { createReaderRuntimeFactory, createWasmModuleLoader } from '@hwpjs/core/runtime';

// Bun/Node의 fetch 또는 브라우저 fetch가 접근 가능한 WASM URL입니다.
// 파일 읽기와 HTTP 인증 정책은 호출 앱에서 처리합니다.
export function createHeadlessRuntime(wasmURL: string | URL) {
  const loadWasmModule = createWasmModuleLoader({ url: wasmURL });
  return createReaderRuntimeFactory({ loadWasmModule });
}
```

`createWasmModuleLoader`는 WASM 헤더를 검사하고 모듈을 컴파일합니다. 컴파일 결과 재사용과 문서 인스턴스 공유는 별개입니다. `preload()`는 Worker factory의 선택적인 사전 컴파일 수단이며 문서를 열거나 capability를 보장하지 않습니다.

## SSR과 종료

core의 상태/명령은 DOM 없이 사용할 수 있지만 Canvas surface는 클라이언트 마운트 경계에서 생성해야 합니다. Node SSR 중 Worker를 만들지 마세요. 예제는 Markdown의 코드 블록으로만 표시하므로 이 문서 사이트의 SSR 번들에 제품 WASM을 끌어오지 않습니다. Rust/WASI 패키지를 externals로 빼는 과거 설정은 필요하지 않습니다.

어댑터를 먼저 분리한 뒤 `await editor.dispose()`를 호출합니다. dispose된 editor는 재사용하지 말고 새 editor를 생성하세요. [문서 편집](./editing.md)에서 전체 흐름을 확인할 수 있습니다.

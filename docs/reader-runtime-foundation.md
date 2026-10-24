# 구체 HWP5/HWPX reader runtime

`@hwpjs/core/runtime` source 진입점은 기존 Worker 전송 외에 `createReaderEditorRuntime`과 `createReaderRuntimeFactory`를 제공합니다. `packages/core/src/worker.ts`는 같은 backend를 실제 module Worker envelope에 연결합니다. legacy `web/preview/reader-worker.mjs`도 같은 factory의 얇은 경계이며 문서 상태나 명령 구현을 복제하지 않습니다.

`web/preview/reader-runtime.mjs`가 native 세션·현재 원본 bytes·projection·보호 해제·history 활성화와 한 documentWindow를 소유합니다. WASM Module은 주입해 재사용할 수 있지만 문서별 Instance/메모리/상태는 공유하지 않습니다. Node/DOM-free 경계에서 fetch·전역 self·파일시스템을 호출하지 않습니다. URL/fetch는 Worker 또는 host가 맡습니다.

```ts
import {readFile} from 'node:fs/promises';
import {createEditor,detectDocumentFormat} from './packages/core/src/index.ts';
import {createReaderRuntimeFactory} from './packages/core/src/runtime.ts';
const wasmModule=await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_WASM));
const editor=createEditor({runtimeFactory:createReaderRuntimeFactory({wasmModule})});
try {
  const bytes=await readFile('example.hwp');
  await editor.load(bytes,{format:detectDocumentFormat(bytes)});
  console.log(editor.getEditorState().content);
} finally { await editor.dispose(); }
```

Node24 이상의 TypeScript source 실행 환경이 필요합니다. 위 readFile은 host 예시이며 core의 I/O가 아닙니다. 편집의 typed 명령과 토큰은 [헤드리스 코어 기반](headless-core-foundation.md), transport는 [Worker 계약](worker-runtime-transport.md)을 따릅니다.

## 세션과 실패

요청은 호출 시 복사하고 backend 큐로 직렬화합니다. default runtime은 한 후보 load만 받으며, legacy wrapper만 allowReload를 사용합니다. reload는 이전 문서의 window·생성 표 대기 상태를 초기화합니다. dispose는 신규/대기 요청을 차단하고 실제 진행 중 요청의 결과를 먼저 확정한 뒤 native editor를 해제합니다. caller의 버퍼와 반환 projection은 이후 요청이 변경하지 않습니다. 임시 decoder와 password bytes는 해제 전에 지웁니다.

기존 메시지·표시·지원 거부·저장 의미를 유지하고 적용 여부/changed/context는 core adapter의 meta에만 넣습니다. legacy wire에는 이 메타데이터를 추가하지 않습니다. history revision으로 확인한 no-op을 편집 적용으로 추정하지 않습니다. metadata 실패도 단 하나의 최소 오류 응답으로 완료하고, native가 이미 편집했다면 applied 상태를 보존합니다. `refresh`는 native에서 새 관측을 만들며 이전 snapshot을 저장 입력으로 삼지 않습니다.

## 게시 단계의 범위

이 단계는 게시 전 HEAD의 명령/표시 기능을 세션 경계로 옮긴 기반입니다. 작업 트리의 후속 도형·표·서식·현재 참조 확장을 한꺼번에 게시한 것이 아닙니다. 현재 source SDK의 참조 바인딩·실험 query/splice·typed 문자 서식/문단 정렬 경계와 후보 검증은 [HWP5 SDK 현재 참조](hwp5-sdk-current-references.md)를 따릅니다. 원본 currentReference가 없는 HWP5 관측에서 typed 문자 서식·문단 정렬은 UnsupportedFormattingReference로 계속 거부합니다. 참조 증명 없이 ordinal을 ID로 추정해 허용하지 않습니다. 전체 fixture 조판/모든 편집/RN 완료를 뜻하지 않습니다.

private source package의 브라우저용 번들은 다음처럼 생성할 수 있습니다. WASM은 host가 명시적으로 고른 아티팩트를 제공해야 합니다.

```sh
bun build packages/core/src/index.ts packages/core/src/runtime.ts packages/core/src/worker.ts --target=browser --format=esm --outdir=zig-out/core-web
```

각 entry를 같은 디렉터리에 두고 module Worker와 WASM URL을 host에서 지정합니다. 패키지 배포용 자동 빌드·Canvas·React/Svelte 데모 통합의 게이트는 별도입니다.

## 검증

- 원격 HEAD63c018cc 사본의 Worker와 추출 backend를 서로 다른 새 프로세스에서 실행했습니다. charshape2형식 full/window/편집/저장/이력, 암호2형식, PUA 정규화5시나리오의45응답이 전체 버퍼·Map·오류·지원 정보까지 일치했습니다. scope 보정이나 기대값 재생을 하지 않았습니다. 명령 전수조사라는 뜻은 아닙니다.
- 별도 HEAD 사본에서 backend 수명·소유권·문서 격리·종료·metadata 실패·no-op10건과, 실제 core+파서의 독립 저장 oracle2건을 통과했습니다. 기존 기반/전송까지 합친97건, strict 선언 생성과315모듈 browser bundle도 통과했습니다.
- 실제 Chrome module Worker의 시험 호스트에서 두 형식의 업로드·명시 편집·undo/redo·다운로드·재업로드와 독립 oracle을 통과했습니다. HWP5 전체 레코드/메타데이터, HWPX whole ZIP/XML(일반/-O), 잘못된 marker 거부를 검사했습니다. 시험용 host이며 제품 Canvas/물리 IME 검증은 아닙니다. 브라우저와 ephemeral 서버는 모두 종료했습니다.

실행은 명시 `HWPJS_TEST_WASM=/abs/hwpjs.wasm node --test packages/core/tests/runtime/reader-runtime-foundation.test.ts packages/core/tests/integration/reader-editor-fixtures.test.ts`입니다. source/artifact 지문과 evidence는 `zig-out/verification/reader-runtime-publication-*`, `noori-current/reader-final-parity.log`, `headless-parser-worker/2026-10-24T15-08-53-161Z/result.json`에 기록합니다. 구체 byte parity 검사는 `tools/headless-reader-publication-parity.mjs`, 실제 Worker 검사는 `bun tools/headless-parser-worker-browser-audit.mjs --candidate=/abs/copy --wasm=/abs/hwpjs.wasm`이며 candidate/bundle에 세 entry 번들이 필요합니다.

# @ohah/hwpjs

HWP5와 HWPX의 읽기·편집·저장을 제공하는 ESM 패키지입니다. 브라우저·Node.js·CLI·MCP는 공통 Native/WASM 엔진을 사용합니다. 현재 지원하는 명령과 관측 범위 안에서 동작합니다. 모든 한글 문서의 서식·개체·조판을 완전히 재현하는 기능도 지원 예정입니다.

## 설치와 실행

Node.js 24.20.0 이상이 필요합니다. npm에는 TypeScript 원문 대신 JavaScript 실행 파일과 공개 타입 선언이 포함됩니다.

```sh
npm install @ohah/hwpjs@0.1.0
npx --package=@ohah/hwpjs@0.1.0 hwpjs --help
npx --package=@ohah/hwpjs@0.1.0 hwpjs read document.hwpx
npx --package=@ohah/hwpjs@0.1.0 hwpjs-mcp
```

CLI와 stdio MCP 서버는 같은 패키지의 WASM 한 벌을 사용합니다. 로컬 파일 경로를 받으며 HTTP 서버를 열지 않습니다. MCP 클라이언트에서는 위 `hwpjs-mcp` 명령을 stdio 서버로 등록합니다.

## CLI와 MCP 지원 범위

| 기능           | 현재 지원                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 읽기           | 기본 본문 중심 텍스트·Markdown, `--view structure`의 원문 SHA와 Native 문단 ID, 명시한 여러 문서의 배치 읽기                                          |
| 문서 정보·개체 | 정보 관측과 미관측 진단, 본문 개체 참조의 표·이미지·차트·수식 등 상세 조회. 형식별 Native 관측 범위가 다릅니다.                                       |
| 이미지         | 관측된 구역 그림 참조의 목록·원본 바이트 추출. master·brush·미참조 자원까지 전체 이미지 추출을 보장하지 않습니다.                                     |
| 편집           | 문단의 정확한 문자열 교체·삭제와 조건부 명령 배치. 원문 SHA·Native 좌표·원문 조건을 확인하고 새 파일에 저장합니다.                                    |
| 표·서식        | 지원 경계에서 표 생성, 셀 서식·크기, 글자·문단 서식, 기존 이미지 크기 변경을 포함한 `apply` 14종 명령                                                 |
| 새 문서        | 공통 Native 빈 문서로 HWP5/HWPX 생성, 문단 순서·빈줄·Unicode 텍스트 초기화                                                                            |
| 형식 변환      | 명시한 `--loss-policy text-only`의 HWP5↔HWPX 본문 텍스트 이관. 서식·표 구조·개체 등 손실을 보고하며, 기본 정책은 거부입니다.                          |
| OCR            | 이미지 추출과 별도 설치한 Tesseract 또는 macOS Vision 연결. 외부 실행 환경·언어 데이터가 필요하며 OCR 엔진·언어 모델을 이 패키지에 포함하지 않습니다. |

MCP 도구는 `read_document`, `read_documents`, `edit_document`, `get_document_info`, `list_document_images`, `extract_document_image`, `get_document_object`, `get_document_paragraph`, `apply_document_changes`, `create_document`, `convert_document`, `ocr_document`입니다. CLI의 파일·원문·Native 검증과 저장 경계를 재사용합니다.

읽기용 표시 문자열은 편집 좌표가 아닙니다. 편집 대상은 `--view structure`에서 얻은 같은 스냅샷의 SHA와 Native ID를 사용해야 합니다. 개체 참조는 네트워크 주소가 아닙니다. 출력은 새 경로만 허용하며 원본이나 기존 파일을 덮어쓰지 않습니다. HWP5 변경 문서의 오래된 조판 정보는 `--allow-stale-layout` 명시 동의가 필요한 경우가 있으며, 이 옵션은 조판 갱신 완료를 뜻하지 않습니다.

전체 표 삭제, 이미지 삽입·교체, 서식과 개체를 보존하는 일반 형식 변환은 제공하지 않습니다. AI가 빈 문서에서 누리 문서 전체를 동일하게 재생성하는 기능도 완료되지 않았습니다. 알 수 없는 내용과 미지원 기능을 성공으로 숨기지 않습니다.

## SDK 진입점

공개 소비자는 패키지 root와 `/runtime`, `/vanilla`, `/react`, `/svelte`, `/react-native`, `/react-native/canvas`, `/worker`, `/wasm`을 사용합니다. root와 runtime import는 React/Svelte 설치나 DOM 접근을 요구하지 않습니다. React·Svelte·React Native는 해당 진입점 소비자를 위한 선택 peer입니다.

Svelte는 browser 조건에서 client, 기본 Node에서는 SSR 진입점을 사용합니다. React Native 진입점은 JavaScript provider·transport 계약이며 네이티브 기기 바이너리나 OS IME 지원을 자동 설치하지 않습니다. `/worker`는 Worker 환경의 진입점으로 일반 Node main에서 직접 실행하는 파일이 아닙니다.

## 브라우저 WASM 사용

브라우저에서도 같은 WASM으로 HWP5·HWPX를 열 수 있습니다. 번들러가 있는 웹 앱에서 사용하며, Worker·WASM 두 파일을 앱의 정적 자산으로 배포합니다. 아래는 `public/`을 정적 루트로 사용하는 앱의 준비 명령입니다.

```sh
mkdir -p public/hwpjs
cp node_modules/@ohah/hwpjs/dist/worker.js public/hwpjs/worker.js
cp node_modules/@ohah/hwpjs/dist/hwpjs.wasm public/hwpjs/hwpjs.wasm
```

두 파일은 같은 버전에서 가져오세요. 하위 경로에 배포하면 아래 URL에도 배포 base를 포함합니다. HTTP(S) 서버에서 실행하고 WASM은 `application/wasm`, Worker는 JavaScript MIME으로 제공합니다.

```js
import { createEditor, detectDocumentFormat } from '@ohah/hwpjs';
import { createWorkerRuntimeFactory } from '@ohah/hwpjs/runtime';
import { createCanvasSurface } from '@ohah/hwpjs/vanilla';

// root: 높이가 지정된 빈 HTMLElement, file: 파일 선택으로 받은 File
export async function openDocument(root, file) {
  const editor = createEditor({
    runtimeFactory: createWorkerRuntimeFactory({
      workerURL: '/hwpjs/worker.js',
      wasmURL: '/hwpjs/hwpjs.wasm',
    }),
  });
  let surface;
  try {
    surface = createCanvasSurface({ root, editor });
    const bytes = new Uint8Array(await file.arrayBuffer());
    await editor.load(bytes, { format: detectDocumentFormat(bytes), editable: true });
    surface.focus();
    return {
      editor,
      async dispose() {
        try {
          await surface.dispose();
        } finally {
          await editor.dispose();
        }
      },
    };
  } catch (error) {
    try {
      await surface?.dispose();
    } finally {
      await editor.dispose();
    }
    throw error;
  }
}
```

호스트 요소에는 `height: 70vh`처럼 실제 높이를 지정합니다. 파일 선택·리본·저장 다운로드 UI는 앱이 소유합니다. React·Svelte에서는 Vanilla surface 대신 각 프레임워크의 컴포넌트에 같은 editor를 전달합니다. 한 editor에 Canvas를 중복 연결하지 마세요.

| 환경 | 공개 API | 사용 예제 | 실행 데모 |
| --- | --- | --- | --- |
| Vanilla JavaScript | `createCanvasSurface` from `@ohah/hwpjs/vanilla` | [파일 열기·Canvas·종료](https://ohah.github.io/hwpjs/frameworks/vanilla) | [Vanilla](https://ohah.github.io/hwpjs/editor/demo/vanilla/) |
| React | `CanvasSurface`, `useEditorState` from `@ohah/hwpjs/react` | [React 컴포넌트](https://ohah.github.io/hwpjs/frameworks/react) | [React](https://ohah.github.io/hwpjs/editor/demo/react/) |
| Svelte | `CanvasEditor`, `canvasSurface` from `@ohah/hwpjs/svelte` | [Svelte 마운트·종료](https://ohah.github.io/hwpjs/frameworks/svelte) | [Svelte](https://ohah.github.io/hwpjs/editor/demo/svelte/) |

[공통 Runtime 설정](https://ohah.github.io/hwpjs/guide/runtime) · [선택·편집·저장](https://ohah.github.io/hwpjs/guide/editing)

## 문서와 검증

- [CLI 설치·사용 가이드](https://ohah.github.io/hwpjs/guide/cli)
- [MCP 연결 가이드](https://ohah.github.io/hwpjs/guide/mcp)
- [편집·원문 보호와 지원 제한](https://github.com/ohah/hwpjs/blob/main/docs/cli-ai-document-view.md)

Skill은 `npx skills add ohah/hwpjs --skill hwpjs`로 설치합니다. Skill의 CLI·MCP·WASM은 같은 정규 패키지 산출물에서 생성합니다. 브라우저 실습의 공통 엔진 호출은 로컬 Node 프로세스나 실제 stdio 연결과 구분합니다.

빌드 입력과 산출물 지문은 `dist/build-manifest.json`에 기록합니다. 공개 타입 선언은 같은 소스에서 새로 생성하고, 명시한 WASM을 그대로 포함합니다. 로컬 설치 검증·원격 CI·레지스트리 게시·브라우저 검증은 서로 다른 증거이며 패키지 준비를 게시 완료로 표현하지 않습니다.

본 제품은 한글과컴퓨터의 글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.

라이선스는 MIT이며 포함된 의존성의 고지는 `THIRD_PARTY_NOTICES.md`를 참고하세요.

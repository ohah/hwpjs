# 설치와 패키지

HWP5·HWPX용 Zig/WASM 엔진과 CLI·MCP·웹 어댑터는 **`@ohah/hwpjs@0.1.0`**으로 공개되었습니다. Node.js 24.20.0 이상을 사용하세요.

```sh
npm install @ohah/hwpjs@0.1.0
```

이전 Rust 기반 `0.1.0-rc.10`과 현재 공개 API는 다릅니다. 이 가이드에서는 `0.1.0`의 패키지 root와 subpath를 사용합니다. `/react`, `/svelte` 등을 별도 npm 패키지 이름으로 설치하지 않습니다.

## 사용할 환경 선택

| 환경 | import / 실행 | 사용 예제 |
| --- | --- | --- |
| 헤드리스 | `@ohah/hwpjs` | [Runtime · WASM](./runtime.md), [열기·편집·저장](./editing.md) |
| Vanilla JavaScript | `@ohah/hwpjs/vanilla` | [Canvas 예제](../frameworks/vanilla.md) · <a href="__HWPJS_DOCS_BASE__editor/demo/vanilla/">실행 데모</a> |
| React | `@ohah/hwpjs/react` | [CanvasSurface 예제](../frameworks/react.md) · <a href="__HWPJS_DOCS_BASE__editor/demo/react/">실행 데모</a> |
| Svelte | `@ohah/hwpjs/svelte` | [CanvasEditor 예제](../frameworks/svelte.md) · <a href="__HWPJS_DOCS_BASE__editor/demo/svelte/">실행 데모</a> |
| CLI | `npx --package=@ohah/hwpjs@0.1.0 hwpjs --help` | [설치·사용법](./cli.md) |
| MCP | `npx --package=@ohah/hwpjs@0.1.0 hwpjs-mcp` | [stdio 서버 설정](./mcp.md) |
| React Native | `@ohah/hwpjs/react-native` | [네이티브 통합과 현재 지원 경계](../frameworks/react-native.md) |

React·Svelte·React Native는 해당 어댑터를 사용하는 앱에서만 필요한 선택 peer입니다. 웹 Canvas 어댑터는 문서 표시와 입력 호스트를 제공하며, 리본·파일 선택·저장 UI는 앱이 구성합니다.

## 웹에서 Worker와 WASM 제공

설치한 패키지의 두 파일을 앱의 정적 자산 디렉터리에 복사합니다. 아래는 `public/`을 정적 루트로 제공하는 앱의 예입니다. 명령은 프로젝트 루트에서 실행합니다.

```sh
mkdir -p public/hwpjs
cp node_modules/@ohah/hwpjs/dist/worker.js public/hwpjs/worker.js
cp node_modules/@ohah/hwpjs/dist/hwpjs.wasm public/hwpjs/hwpjs.wasm
```

브라우저 runtime에는 실제 제공 주소인 `/hwpjs/worker.js`와 `/hwpjs/hwpjs.wasm`을 전달합니다. 하위 경로에 배포한다면 앱의 배포 base를 포함하세요. 두 파일은 같은 패키지 버전에서 가져오며, 캐시 갱신도 함께 처리합니다. WASM은 `application/wasm`, Worker는 JavaScript MIME으로 제공하고, HTTP(S) 서버에서 실행하세요.

파일을 복사하는 것과 브라우저에서 문서를 여는 것은 별도 단계입니다. 다음 [Runtime helper](./runtime.md)로 editor를 만들고, 위 Vanilla·React·Svelte 예제에 연결합니다. 세 어댑터 모두 동일한 WASM 엔진을 사용하며 운영체제별 `.node` 파일을 설치하지 않습니다.

## 프로젝트 개발자용 빌드

npm 소비자는 Zig나 제품 빌드 도구가 필요하지 않습니다. 엔진·패키지 자체를 수정하는 경우에만 저장소의 [개발·검증 명령](https://github.com/ohah/hwpjs/blob/main/docs/development-commands.md)을 따릅니다. 공개 npm 산출물, 로컬 workspace 소스, 실행 중인 데모는 서로 다른 버전일 수 있습니다.

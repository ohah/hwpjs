# @ohah/hwpjs — 공개 패키지 후보

내부 패키지는 유지하며 공개 소비자는 이 패키지의 root와 `/runtime`, `/vanilla`, `/react`, `/svelte`, `/react-native`, `/worker`, `/wasm`을 사용합니다. root/core와 runtime import는 React/Svelte 설치나 DOM 접근을 요구하지 않습니다. React와 Svelte는 해당 subpath 소비자만 설치하는 optional peer입니다.

ESM 패키지입니다. root/runtime의 browser·node 조건은 같은 core 모듈을 가리킵니다. Svelte는 browser 조건에서 client, 기본 Node에서는 SSR entry를 사용합니다. RN subpath는 JavaScript provider/transport 계약이며 네이티브 기기 바이너리나 OS IME 지원을 설치하지 않습니다. `/worker`는 Worker 환경의 진입점이고 일반 Node main entry가 아닙니다.

빌드: `mise exec -- bun tools/build-public-package.mjs --wasm=/absolute/explicit/hwpjs.wasm`

기존 내부 패키지의 dist는 읽거나 재빌드하지 않습니다. JS는 현재 canonical source에서, 선언은 같은 source의 새 declaration emit으로 생성합니다. WASM은 명시 입력을 바이트 그대로 포함합니다. 빌드 지문은 `dist/build-manifest.json`에 기록됩니다.

현재 private prerelease 후보이며 npm에 게시되지 않았습니다. pack 검증과 npm 공개는 별개입니다. Native/WASM 기능 범위는 명시 엔진과 해당 검증 자료에 한정합니다.

Node CLI 후보는 이 패키지의 `hwpjs` 실행 파일입니다. 설치된 패키지에서는 `hwpjs read document.hwpx`로 머리말·본문·꼬리말·표·이미지의 논리 구조를 읽습니다. 문단의 문자열 교체·삭제와 새 HWP5/HWPX 파일 저장도 지원하며, 원문 SHA256과 대상 식별자를 요구합니다. [실행 방법과 제한](https://github.com/ohah/hwpjs/blob/main/docs/cli-ai-document-view.md)을 따릅니다. CLI 검증 환경은 Node.js 24.20.0과 Bun 1.4.4입니다.

같은 패키지의 `hwpjs-mcp` 실행 파일은 stdio MCP 서버입니다. `read_document`와 `edit_document`가 CLI의 파일·Native 엔진·출력 경계를 재사용합니다. WASM은 두 실행 파일 옆에 한 벌만 포함합니다.

Skill은 `npx skills add ohah/hwpjs --skill hwpjs`로 설치합니다. Skill에 포함된 런처와 CLI·MCP·WASM은 같은 패키지 산출물에서 생성하므로 별도의 실행 엔진을 설치하지 않습니다. [CLI·MCP 설치 가이드와 브라우저 실습](https://ohah.github.io/hwpjs/guide/cli)을 참고하세요. 브라우저 실습은 같은 Native 엔진을 호출하며 로컬 Node 프로세스나 stdio 연결을 실행하는 기능과는 구분합니다.

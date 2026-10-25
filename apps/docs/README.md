# HWPJS 문서 사이트

현재 Zig/WASM 개발 workspace의 공개 API를 설명하는 Rspress 2.0.23 정적 문서입니다. 제품 모노레포 변경은 순차 공개 중이므로 main의 새 clone이나 npm에서 제품을 즉시 설치·빌드할 수 있음을 보장하지 않습니다. 이번 docs-only 커밋에는 루트 package.json/bun.lock과 제품 앱 소스 WIP를 포함하지 않습니다. 설치·Runtime/WASM 설정·열기/선택/입력/저장·Vanilla/React/Svelte 예제와 제한을 제공합니다. `/playground`는 같은 사이트의 정적 Canvas 편집기를 전체화면으로 엽니다. 구 Rust 변환 UI는 포함하지 않으며 기존 HWP/HWPX 샘플 다운로드 경로는 보존합니다.

## 저장소에서 검사

저장소 루트에서 실행합니다.

```bash
bun run --cwd apps/docs typecheck
HWPJS_DOCS_BASE=/hwpjs/ bun run --cwd apps/docs check
```

`bun run --cwd apps/docs typecheck`는 **workspace 전용**입니다. Markdown의 8개 TS/TSX 예제가 실제 예제 파일과 같은지 확인하고 `packages/*/src`의 현재 공개 타입 및 Rspress 설정으로 검사합니다. npm 게시나 실제 Native/브라우저 E2E 검증을 대신하지 않습니다. 제품 패키지나 WASM을 빌드하지 않습니다.

## 독립 GitHub Pages 빌드

`package.json`, **apps/docs/bun.lock**, `rspress.config.ts`, `docs/`, `scripts/`, `components/`, `theme/`를 저장소 밖 작업 디렉터리로 복사하면 문서만 빌드할 수 있습니다. 루트 workspace나 루트 lock이 필요하지 않습니다. Bun 1.4.4와 Python3를 사용합니다.

```bash
bun install --frozen-lockfile
HWPJS_DOCS_BASE=/hwpjs/ bun run build
HWPJS_DOCS_BASE=/hwpjs/ bun run check:links
bun run check:licenses
bun run check:public
```

독립 빌드에서는 workspace 예제 타입 검사를 실행하지 않습니다. 예제와 설정 타입은 저장소에서 별도로 검사합니다. 링크 검사는 생성 HTML의 경로/앵커, CSS 리소스와 샘플 다운로드 파일을 검사합니다. 라이선스 검사는 설치된 npm metadata를 읽으며 과거 기준선이나 루트 잠금파일에 의존하지 않습니다. 외부 URL의 가용성과 실제 서버 동작은 별도입니다.

출력은 작업 디렉터리의 `doc_build`이며, 저장소에서 실행하면 `apps/docs/doc_build`입니다. Pages workflow는 이 폴더를 Pages artifact로 배포합니다.

## base와 정적 파일 제공

`HWPJS_DOCS_BASE`의 기본값은 `/docs/`입니다. GitHub Pages는 `/hwpjs/`를 지정합니다. 같은 base로 빌드와 링크 검사를 실행하세요. base 전환 시 이전 링크가 캐시에 남지 않도록 문서 빌드 캐시는 비활성화했습니다.

`route.cleanUrls=true`이므로 `/hwpjs/guide/installation` 같은 요청은 출력의 `guide/installation.html`로 연결해야 합니다. 첫 페이지는 `index.html`, 리소스는 `static/`, 샘플은 `demo/noori.hwp`와 `demo/noori.hwpx`입니다. 알 수 없는 문서 경로는 `404.html`로 처리하세요.

`/playground`의 전체화면 Canvas와 API 문서의 함수 실행 예제는 같은 Pages 사이트의 `editor/` 정적 파일을 사용합니다. 별도 편집 서버나 사설 네트워크 접근은 필요하지 않습니다. 동일한 편집기 tree를 `/hwpjs/editor/`와 `/docs/editor/` 아래 제공할 수 있습니다.

## 내장 편집기 아티팩트

`docs/public/editor/`는 검증한 웹 편집기·Worker·WASM과 기존 공개 예제 두 개를 포함하는 정적 배포본입니다. 이 디렉터리는 문서 빌드에 포함되며 외부 편집 서버를 요구하지 않습니다. 파일 업로드는 브라우저 안에서 처리합니다.

저장소 루트의 `node tools/build-pages-demo.mjs --verify`는 Node 내장 모듈만으로 배포본의 경로·체크섬·canonical WASM·공개 텍스트 규칙을 확인합니다. 이 검사는 `node_modules`나 제품 재빌드 없이 실행할 수 있습니다.

재생성은 별도로 빌드·검증한 multi-entry 정적 bundle을 명시적으로 입력합니다. `BUNDLE_DIR`는 해당 `manifest.json`이 있는 디렉터리입니다.

```bash
node tools/build-pages-demo.mjs --bundle-dir "$BUNDLE_DIR" --out zig-out/verification/pages-editor-reviewed
node tools/build-pages-demo.mjs --verify --out zig-out/verification/pages-editor-reviewed
```

공개 반영을 승인한 뒤에는 `--out apps/docs/docs/public/editor`로 생성합니다. 기존 출력은 manifest/checksum 및 미기록 파일을 검사한 뒤 교체하며, 수정된 사용자 파일이나 심볼릭 링크가 있으면 거부합니다. 생산 입력 검사에는 설치된 React/ReactDOM/Svelte의 라이선스 원문이 필요하지만 docs CI의 `--verify`에서는 패키지를 resolve하지 않습니다.

옵션 없는 생산은 과거 dist로의 회귀를 막기 위해 거부합니다. `--legacy-dist`는 기존 `apps/demo/dist`와 `packages/core/dist`를 사용하는 별도 과거 파이프라인이며, 현재 multi-entry bundle 재현 명령이 아닙니다. 정적 편집기 배포 성공을 새 clone의 전체 제품·Native 빌드 성공으로 해석하지 않습니다. 새 bundle은 두 형식의 실제 입력·이력·저장·재열기와 두 prefix의 Worker/WASM 경로를 별도로 검증합니다.

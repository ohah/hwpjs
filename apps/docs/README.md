# HWPJS 문서 사이트

현재 Zig/WASM 개발 workspace의 공개 API를 설명하는 Rspress 2.0.23 정적 문서입니다. 제품 모노레포 변경은 순차 공개 중이므로 main의 새 clone이나 npm에서 제품을 즉시 설치·빌드할 수 있음을 보장하지 않습니다. 이번 docs-only 커밋에는 루트 package.json/bun.lock과 제품 앱 소스 WIP를 포함하지 않습니다. 설치·Runtime/WASM 설정·열기/선택/입력/저장·Vanilla/React/Svelte 예제와 제한을 제공합니다. 구 Rust 변환 UI는 포함하지 않으며 기존 HWP/HWPX 샘플 다운로드 경로는 보존합니다.

## 저장소에서 검사

저장소 루트에서 실행합니다.

```bash
bun run --cwd apps/docs typecheck
HWPJS_DOCS_BASE=/hwpjs/ bun run --cwd apps/docs check
```

`bun run --cwd apps/docs typecheck`는 **workspace 전용**입니다. Markdown의 7개 TS/TSX 예제가 실제 예제 파일과 같은지 확인하고 `packages/*/src`의 현재 공개 타입 및 Rspress 설정으로 검사합니다. npm 게시나 실제 Native/브라우저 E2E 검증을 대신하지 않습니다. 제품 패키지나 WASM을 빌드하지 않습니다.

## 독립 GitHub Pages 빌드

`package.json`, **apps/docs/bun.lock**, `rspress.config.ts`, `docs/`, `scripts/`를 저장소 밖 작업 디렉터리로 복사하면 문서만 빌드할 수 있습니다. 루트 workspace나 루트 lock이 필요하지 않습니다. Bun 1.4.4와 Python3를 사용합니다.

```bash
bun install --frozen-lockfile
HWPJS_DOCS_BASE=/hwpjs/ bun run build
HWPJS_DOCS_BASE=/hwpjs/ bun run check:links
bun run check:licenses
```

독립 빌드에서는 workspace 예제 타입 검사를 실행하지 않습니다. 예제와 설정 타입은 저장소에서 별도로 검사합니다. 링크 검사는 생성 HTML의 경로/앵커, CSS 리소스와 샘플 다운로드 파일을 검사합니다. 라이선스 검사는 설치된 npm metadata를 읽으며 과거 기준선이나 루트 잠금파일에 의존하지 않습니다. 외부 URL의 가용성과 실제 서버 동작은 별도입니다.

출력은 작업 디렉터리의 `doc_build`이며, 저장소에서 실행하면 `apps/docs/doc_build`입니다. Pages workflow는 이 폴더를 Pages artifact로 배포합니다.

## base와 정적 파일 제공

`HWPJS_DOCS_BASE`의 기본값은 `/docs/`입니다. GitHub Pages는 `/hwpjs/`를 지정합니다. 같은 base로 빌드와 링크 검사를 실행하세요. base 전환 시 이전 링크가 캐시에 남지 않도록 문서 빌드 캐시는 비활성화했습니다.

`route.cleanUrls=true`이므로 `/hwpjs/guide/installation` 같은 요청은 출력의 `guide/installation.html`로 연결해야 합니다. 첫 페이지는 `index.html`, 리소스는 `static/`, 샘플은 `demo/noori.hwp`와 `demo/noori.hwpx`입니다. 알 수 없는 문서 경로는 `404.html`로 처리하세요.

현재 Canvas 데모 링크는 Tailscale tailnet 접근이 필요합니다. 문서 사이트의 공개 다운로드와 네트워크 제한이 있는 편집기 접근을 구분합니다. Worker/WASM URL은 소비 앱이 별도로 배포·설정하며 문서 사이트 base와 같다고 가정하지 않습니다.

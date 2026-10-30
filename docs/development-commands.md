# 개발·검증 명령

## 관측 소유권·각주 저장 집중 검사

저장소 루트에서 두 진입점을 명시합니다. `HWPJS_TEST_WASM`에는 검증할 생성 WASM의 절대 경로를 지정합니다.

```sh
test -f ./packages/core/tests/state/owned.test.ts || exit 1
test -f ./tests/hwp5/plain-footnote-saved-oracle.test.mjs || exit 1
HWPJS_TEST_WASM=/absolute/path/to/current-build/hwpjs.wasm \
  mise exec -- node --test ./packages/core/tests/state/owned.test.ts ./tests/hwp5/plain-footnote-saved-oracle.test.mjs
```

각주 검사는 기존 `footnote-endnote.hwp` 한 개를 사용합니다. fixture가 없으면 관련 검사는 skip이며, fixture가 있지만 WASM 환경변수가 없으면 Native 검사 한 개만 skip입니다. 명시한 WASM 경로가 잘못되면 실패합니다. 각주별 긴 문자열을 한 번씩 삽입하는 총 두 편집의 전체 section·비대상 stream·컨테이너 metadata와 undo/redo 바이트를 독립 oracle로 비교하며, 저장 정책은 `allowStaleLayout:true`입니다. 실제 Canvas 배치·입력 속도 검사는 별도입니다.

2026-10-30 실제 작업 트리에서 d849 엔진을 명시한 위 두 진입점은 12pass·0fail·0skip이었습니다. 새로운 Native 컴파일이나 미배포 각주 배치 후보의 검증 결과로 합산하지 않습니다.

<a id="paragraph-resource-ui-regression"></a>

## 문단 테두리·배경 UI 집중 검사

core 소스의 공개 목록·타입을 바꾼 뒤 설치된 `packages/core/dist`가 오래됐다면, 선택한 기존 WASM을 명시해 core만 갱신합니다. 아래 명령은 새 Native 컴파일·React Native 빌드·운영 번들 배포가 아닙니다. 공간·작업 소유권을 확인한 뒤 필요한 경우에만 실행합니다.

```sh
test -f ./tools/build-packages.mjs || exit 1
test -f ./apps/docs/docs/public/editor/hwpjs/hwpjs.wasm || exit 1
mise exec -- bun ./tools/build-packages.mjs --package=core --web --wasm="$(pwd)/apps/docs/docs/public/editor/hwpjs/hwpjs.wasm"
```

검사는 전용 UI 세 파일과 기존 문단 다섯 파일이 모두 있는지 먼저 확인한 뒤 저장소 루트에서 명시 실행합니다. `--tsconfig-override`나 후보 폴더의 자동 paths로 오래된 dist 오류를 숨기지 않습니다.

```sh
set -- \
  ./apps/demo/tests/paragraph-resource-input.test.ts \
  ./apps/demo/tests/paragraph-resource-view.test.ts \
  ./apps/demo/tests/paragraph-background-replacement.test.ts \
  ./apps/demo/tests/paragraph-shape-fallback.test.ts \
  ./apps/demo/tests/paragraph-shape-number.test.ts \
  ./apps/demo/tests/paragraph-shape-tool.test.ts \
  ./apps/demo/tests/paragraph-shape-ui.test.ts \
  ./apps/demo/tests/paragraph-spacing-kind.test.ts
for path in "$@"; do test -f "$path" || exit 1; done
mise exec -- bun test --no-install "$@"
```

2026-10-30 명시한 8개 파일의 실제 root 검사는 111pass·0fail·0skip이었습니다. 상세 UI35개·명시 교체 요청18개·기존 문단58개의 고유 집합이며, 초기 root93개에 같은 검사를 중복 합산하지 않습니다. 공식 core dist를 소비하고 paths를 추가하지 않은 엄격 타입 검사와 선택 lint5·format6도 종료0이었습니다. 후보 source-alias 결과와 실제 이전 SDK의 별도 사례는 이 합계에 더하지 않습니다. 실제 브라우저·Canvas 검사는 별도이며, [엔진 저장 조건과 남은 검증](formatting-dialogs.md#paragraph-background-explicit-replacement-request)을 따릅니다.

<a id="javascript-quality-commands"></a>

## JavaScript 품질 검사

기본 범위는 Git 추적·새 staged 파일의 현재 작업 트리 내용이며, 추적 파일의 unstaged 편집도 포함합니다. 미추적 파일은 명시 파일 경로나 `--include-untracked`로만 추가합니다. 정확한 정책·언어 한계·CI 및 검증 상태는 [JavaScript 품질 검사](javascript-quality.md)를 따릅니다.

```sh
mise exec -- bun run quality:files
mise exec -- bun run quality:config
mise exec -- bun run lint
mise exec -- bun run format:check
mise exec -- bun run check
# 아래 두 명령은 선택된 파일을 수정합니다.
mise exec -- bun run lint:fix
mise exec -- bun run format
```

예: `mise exec -- bun run lint tools/quality.mjs`, `mise exec -- bun run format:check --include-untracked`.

<!-- javascript-quality-commands:end -->

Native 서식 증거의 정규 CLI·pure tests와 명시48 입력 준비 조건은 [서식 증거 독립 검증](formatting-evidence-oracle.md#기존-native48-소비와-순수-테스트)을 따릅니다.

## 문단 좌표 선택 집중 검증

[좌표 선택·owner·수명 계약](headless-text-tools.md#좌표-기반-문단-선택)을 따릅니다. 공식 core 테스트 실행기인 Bun에서 명시 두 파일만 실행합니다. 아래 WASM은 호출자가 준비한 호환 엔진의 절대경로여야 하며, 없으면 `ExplicitWasmRequired`로 실패합니다. ignored artifact나 source-only pass/skip로 대체하지 않습니다. Python3는 표준 `zipfile`/`ElementTree`만 사용하고 `-I -B`로 실행합니다. 기존 허용 table/Noori fixture만 읽으며 생성 중복 ZIP은 메모리에만 존재합니다.

```sh
HWPJS_TEST_WASM="/absolute/path/hwpjs.wasm" \
HWPJS_TEST_PYTHON="/usr/bin/python3" \
mise exec -- bun test \
  ./packages/core/tests/state/paragraph-selection-facade.test.ts \
  ./packages/core/tests/integration/paragraph-selection-facade.test.ts \
  --timeout 60000
```

기대는 pure9+실 Runtime8=17개입니다. 이 명시 검사는 Node24 직접 source index 실행에서 기존 JSON import attribute 오류로 case 진입 전 실패한 기록과 구분합니다. 해당 제품 JSON import를 이 작업에서 바꾸지 않았으며, Node 직접 실행 성공을 주장하지 않습니다. 새 WASM/Native 빌드를 수행하는 명령이 아닙니다.

## 소유 관측 문단 선택 인덱스 검증

[내부 브랜드·비용·fallback과 검증 범위](headless-selection-index.md)를 따릅니다. 정규 Bun runner에서 전용20+기존 selection17을 명시 실행합니다. WASM·fixture·새 Native 빌드는 사용하지 않습니다. 후보의 추가 브랜드 통합1은 별도 증거이며 이 명령의 37개에 더하지 않습니다.

```sh
test -f ./packages/core/tests/commands/selection-paragraph-index.test.ts || exit 1
test -f ./packages/core/tests/commands/formatting-selection.test.ts || exit 1
mise exec -- bun test \
  ./packages/core/tests/commands/selection-paragraph-index.test.ts \
  ./packages/core/tests/commands/formatting-selection.test.ts
```

## 입력 표면 응답 검증

[응답·콜백 계약과 검증 범위](input-surface-acknowledgement.md)를 따릅니다. Native 저장·이력 검사는 명시 WASM과 Bun을 사용합니다.

```sh
HWPJS_TEST_WASM=/absolute/path/hwpjs.wasm mise exec -- bun test ./packages/vanilla/tests/core-bridge.test.ts ./packages/vanilla/tests/core-bridge-acknowledgement.test.mjs
```

WASM을 생략하면 실제 Native 2건은 skip되며 프로토콜 검증만 실행합니다.

## plain 각주 연속 페이지 집중 검증

[소유권·예약·지원 범위](plain-footnote-continuation.md)를 따릅니다. 순수 70개(기존 예약 28개·안정 순서화 25개·잠금 helper13 및 실제 측정 진입점4)는 WASM·fixture를 읽지 않습니다.

```sh
test -f ./tests/hwp5/plain-footnote-continuation.test.mjs || exit 1
test -f ./tests/hwp5/plain-footnote-stable-order.test.mjs || exit 1
test -f ./tests/hwp5/plain-footnote-lock-audit.test.mjs || exit 1
mise exec -- node --test --test-concurrency=1 \
  ./tests/hwp5/plain-footnote-continuation.test.mjs \
  ./tests/hwp5/plain-footnote-stable-order.test.mjs \
  ./tests/hwp5/plain-footnote-lock-audit.test.mjs
```

실제 저장·undo/redo·재열기 통합 2개는 명시 엔진을 요구하며 저장소의 기존 `legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwp`만 읽습니다. 엔진을 생략한 일반 실행은 이 2개가 skip되며 Native 통과가 아닙니다. 아래 명시 명령은 엔진이 비었으면 시작 전에 실패합니다. 순수 70개와 명시 통합 2개는 별도 단계이며, 정렬 변경의 Native·Canvas 검증을 순수 결과에서 승계하지 않습니다.

```sh
test -n "$HWPJS_TEST_WASM" || exit 1
test -f ./tests/hwp5/plain-footnote-continuation-native.test.mjs || exit 1
mise exec -- node --test ./tests/hwp5/plain-footnote-continuation-native.test.mjs
```

## 표가 있는 각주의 순수 회귀

[혼합 각주 계약](mixed-footnote-continuation.md)을 따릅니다. 아래 6개 진입점은 기존 plain70과 혼합32를 함께 검사합니다. 기록 JSON3은 테스트 전용이며 WASM·로컬 검증 폴더·추가 환경변수를 요구하지 않습니다.

```sh
set -- \
  ./tests/hwp5/mixed-note-table-continuation.test.mjs \
  ./tests/hwp5/recorded-mixed-note-continuation.test.mjs \
  ./tests/hwp5/source-note-projection-optin.test.mjs \
  ./tests/hwp5/plain-footnote-continuation.test.mjs \
  ./tests/hwp5/plain-footnote-stable-order.test.mjs \
  ./tests/hwp5/plain-footnote-lock-audit.test.mjs
for path in "$@"; do test -f "$path" || exit 1; done
mise exec -- node --test --test-concurrency=1 "$@"
```

2026-10-30 실제 작업 트리에서 102pass·0fail·0skip이었습니다. 독립 저장 oracle와 실제 Canvas의 별도 증거는 계약 문서에 기록하며 이 순수 검사 수에 합산하지 않습니다.

## JS 모노레포 CLI

Bun 1.4.4와 명시 WASM을 사용하는 경로입니다. 내부 core·vanilla·react·svelte·react-native 5개는 private/dist 계약이고 외부 package 진입점은 `@ohah/hwpjs`입니다.

```sh
mise exec -- bun install --frozen-lockfile --ignore-scripts
export HWPJS_BUILD_WASM=/absolute/path/hwpjs.wasm
mise exec -- bun run build:web --wasm="$HWPJS_BUILD_WASM"

# 새 umbrella dist/pack이 필요할 때만 실행합니다.
mise exec -- bun tools/build-public-package.mjs --wasm="$HWPJS_BUILD_WASM"

mise exec -- bun run typecheck
HWPJS_TEST_WASM="$HWPJS_BUILD_WASM" mise exec -- bun run test:packages
mise exec -- bun run build:demo
mise exec -- bun run docs:typecheck
mise exec -- bun run docs:check
mise exec -- bun run dev 8082
```

- 캐시가 모두 있으면 frozen install에 `--offline`을 추가할 수 있습니다. 실제 검증은 캐시가 있는 macOS에서 수행했으며 다른 OS·빈 캐시 설치의 성공으로 확대하지 않습니다.
- `build:web`는 core→vanilla→react→svelte 순서로 private dist를 생성합니다. 기본 `build`는 RN까지 포함하며 실제 `packages/react-native/native-artifacts.json`과 일치하는 Native 파일이 없으면 `NativeArtifactsRequired`입니다. 가짜 manifest로 대체하지 않습니다. 이 JS 재현 경로는 새 Zig/Native 빌드 성공을 요구하거나 증명하지 않습니다.
- `test:core`는 core 범위만 실행하는 별도 root script입니다. `test:packages`는 core·vanilla·react·svelte 및 RN src unit 범위이며 RN fake-transport unit 성공을 실제 JSI/기기 성공으로 세지 않습니다. `HWPJS_TEST_WASM` 미지정 시 일부 테스트가 참조하는 로컬 verification WASM은 source-only clone에 자동 생성되지 않습니다.
- 옛 parity 이름은 `hwp5: pre-extraction wire exact session-scope delta and frozen remainder`, `hwpx: pre-extraction full/window/edit/save/history wire baseline`입니다. `artifact !== baseline.artifact` 경로 문자열 비교로 skip되며 pass가 아닙니다. 독립 CFB oracle는 module import 외에도 HEAD의 `legacy/cfb.js` 파일을 읽습니다.
- demo/dev는 private 4개 dist와 `apps/demo/dist`를 선행 입력으로 사용합니다. 공개 umbrella dist는 이 demo 경로의 필수 입력이 아니며 public producer는 private dist를 소비하지 않고 source에서 별도 출력합니다.
- root `docs:build`는 문서 빌드만 실행합니다. `docs:typecheck`는 source에 연결된 예제를 검사하며, `docs:check`는 예제 타입→빌드→링크→설치 license metadata→공개 출력 검사를 수행합니다. `apps/docs/`의 추적 파일 전체와 기존 `docs/public/editor` 정적 자산이 입력입니다. 새 umbrella producer가 그 정적 자산을 갱신하는 것은 아닙니다. CI의 정적 자산 확인은 `mise exec -- bun tools/build-pages-demo.mjs --verify`입니다.
- Native shared-snapshot은 별도 ABI/archive/빌드 flag 계약입니다. 기능이 없는 binding은 `NativeSnapshotUnavailable`로 거부하며, plain-body snapshot 검증을 전체 Canvas·실기기·IME 완료로 표시하지 않습니다.


## 데모 서버 실행 모드

기존 `mise exec -- bun run dev 8082`는 dev/dist 모드를 유지합니다. 검증된 bundle을 제공할 때만 다음 옵션을 명시합니다. 예시 경로는 준비된 실제 bundle 경로로 바꿉니다.

```sh
mise exec -- bun tools/serve-demo.mjs 8082 --bundle-dir /path/to/public-bundle
mise exec -- bun tools/serve-demo.mjs 8082 --bundle-dir /path/to/private-bundle --private-fixtures
```

모드별 검증·public 기준 manifest/동일 worker/WASM·라우팅·시작 시 snapshot과 **업데이트 후 재시작** 절차는 [데모 서버 모드](demo-server-modes.md)를 따릅니다. private catalog의 관측 개수는 정책 기본값이 아닙니다. bundle/문서 파일을 바꿔도 실행 중 서비스에 자동 반영되지 않습니다.


WASM HTTP 압축 검사는 `mise exec -- node --test tests/hwpx/preview-wasm-compression.test.mjs`와 `mise exec -- bun test ./tests/hwpx/preview-wasm-compression.test.mjs`입니다. Bun 파일 인수의 `./`를 유지합니다. [전송 크기와 실측 범위](wasm-transfer.md)를 따릅니다.

HWP5 Native 텍스트 편집·실패 주입 단위 검사는 `mise exec -- zig build test-text-splice -j1 --summary all`과 `mise exec -- zig build test-text-splice -Doptimize=ReleaseSafe -j1 --summary all`입니다. WASM 설치나 선택적 외부 JSON oracle를 실행하지 않는 집중 단계이며 전체 `zig build test`를 대체하지 않습니다.

5.0.3.0 그림 효과 전용 꼬리는 `HWPJS_TEST_WASM=/absolute/verified.wasm mise exec -- node --test tests/hwp5/effects-only-picture-tail.test.mjs`로 검사합니다. 실제14개 고정 offset·Worker geometry·미지 프로필 거부 검사이며 정규 hwp5-editor-audit에도 등록합니다. 계약은 [effects-only 꼬리](hwp5-effects-only-picture-tail.md)를 따릅니다.

[예약 본문 callback](reserved-body-callbacks.md)은 `mise exec -- node --test tests/hwpx/reserved-body-callbacks.test.mjs tests/hwpx/reserved-picture-page-flow.test.mjs tests/hwpx/reserved-body-row.test.mjs tests/hwpx/table-picture-reservation-check.test.mjs`로 검사합니다. 새 도형 감싸기 지원 완료와 구분합니다.

[구역별 실제 Canvas 왕복](section-object-layout.md)은 `HWPJS_TEST_WASM=/absolute/hwpjs.wasm node tools/page-area-object-browser-audit.mjs --case=sections`입니다. 기본 복합 셀/꼬리말 모드와 같은58886·전용 세션을 쓰므로 직렬 실행합니다. 문서 전체 문단 번호로 구역1 입력·독립 저장·재업로드·소유 브라우저/서버 종료를 확인합니다.

[반복 영역 인스턴스](page-area-object-instances.md)의 실제 복합 셀·꼬리말 왕복은 `HWPJS_TEST_WASM=/absolute/hwpjs.wasm node tools/page-area-object-browser-audit.mjs`입니다. 전용58886을 사용하는 다른 검사와 직렬 실행하며 신뢰된 Canvas 입력·독립 전체 저장·재업로드 및 소유 브라우저/서버 종료를 확인합니다. 원본 조판 동치와 구분합니다.

[데모 WASM 로딩 수명](preview-wasm-loading.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwpx/wasm-module-loader.test.mjs tests/hwpx/preview-wasm-compression.test.mjs tests/hwpx/shared-wasm-worker.test.mjs`로 검사합니다. 단일 fetch/compile·재시도·gzip·실제 Worker 응답/무재다운로드를 검사하며 사용자 WAN·원본 조판과 구분합니다.

[쪽·단 UI](paragraph-break-menu.md)는 `HWPJS_TEST_WASM=/absolute/flow-candidate.wasm node --test --test-concurrency=1 tests/hwp5/paragraph-break-menu.test.mjs tests/hwp5/paragraph-break-browser-arguments.test.mjs`로 검사합니다. 실제 브라우저 도구 `tools/flow-break-browser-audit.mjs`(키보드), `tools/flow-break-menu-browser-audit.mjs`, `tools/flow-break-search-browser-audit.mjs`, `tools/flow-break-ribbon-browser-audit.mjs`는 같은 환경변수로 직렬 실행하고 소유 세션/58879 서버의 종료를 확인합니다.

[Canvas 단축키 수정키](canvas-shortcut-modifiers.md)는 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwp5/canvas-editor.test.mjs`와 같은 후보의 `node tools/document-menu-browser-audit.mjs`로 모사 Canvas/native 회귀 및 실제 Alt 조합 비소비·수정키+Enter의 잘못된 분할 방지·입력/저장 왕복을 구분해 검사합니다. 쪽/단 나누기 명령 구현 완료를 뜻하지 않습니다.

[편람178범위 명시 정책](hwp5-unselected-field-preservation.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwp5/manual-range-policy-reference.test.mjs`로 실행합니다. 기본 거부 유지·명시적 half-open 입력·독립 Section/비대상 stream·이력·재열기를 검사하며 한글 affinity/조판 또는 기본 정책의 무거부 지원과 구분합니다.

[참조 HWP5 숫자 입력](hwp5-reference-chart-numeric-input.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwp5/numeric-formula-corpus.test.mjs`로 실행합니다. 실제12입력/3수식의 두 규모 숫자 치환·독립 산술·비대상 stream·이력·재열기를 검사하며 문자 prefix 거부와 전체 편집/조판 완료를 구분합니다.

[누름틀 중간 Canvas 입력](canvas-field-interior-input.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/field-interior-browser-audit.mjs`로 실행합니다. 실제 키보드 범위 치환·Worker 좌표·메뉴 이력·독립 XML/ZIP·다운로드·같은 문단 재업로드·소유 브라우저/서버 종료를 확인하며 전체 필드/IME/조판 완료와 구분합니다.

[실제 저장 단축키](canvas-document-download.md)는 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/document-menu-browser-audit.mjs`와 같은 환경의 `node tools/below-sum-input-browser-audit.mjs`를 직렬 실행합니다. 입력 반영 대기 저장 차단·신뢰된 Ctrl/Cmd+S·실제 파일/메뉴 snapshot 일치·독립 XML/ZIP·재업로드·종료를 검사하며 OS IME·전체 fixture 조판과 구분합니다.

[BELOW 연속 편집](hwpx-below-sum-input-corpus.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwpx/below-sum-sequence.test.mjs tests/hwpx/below-sum-input-corpus.test.mjs`로 두 입력의 같은 수식/다른 열/다른 표·역순·분기 이력·독립 전체 XML/ZIP·재열기를 검사합니다. 여덟 경로의 실측이며 모든 입력 조합/임의 길이 명령 검사는 아닙니다.

[BELOW Canvas 실제 왕복](hwpx-below-sum-input-corpus.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/below-sum-input-browser-audit.mjs`입니다. 원본89번 문단의 신뢰된 입력·메뉴 이력·독립 XML/ZIP·재업로드의 정확한 원본 위치·소유 브라우저/서버 종료를 검사하며 전체50입력·기본 배포·조판 동치와 구분합니다.

[BELOW 입력](hwpx-below-sum-input-corpus.md)과 [공통 숫자 oracle 봉투](hwpx-numeric-oracle-envelope.md)는 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwpx/below-sum-input-corpus.test.mjs tests/hwpx/numeric-package-oracle.test.mjs`로 실제50입력/설명·normal/-O 전체 XML/ZIP·변조 거부·이력/재열기를 검사합니다. 공통 봉투만 검사하려면 두 번째 테스트 파일을 단독 실행하며 후보 WASM은 필요하지 않습니다.

[여러 표의 SUM·ABOVE 입력](hwpx-nested-sum-input-corpus.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwpx/nested-sum-input-corpus.test.mjs`로 실제22입력·표별 분모·normal/-O XML/ZIP·거부/이력/재열기를 검사합니다. 모든 방향 수식/브라우저/원본 조판 검증은 아닙니다.

[연쇄 SUM 입력](hwpx-cascaded-sum-input-corpus.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwpx/cascaded-sum-input-corpus.test.mjs`로 실제28입력의 직접/후속 결과·normal/-O XML/ZIP·이력/재열기를 검사합니다. 후보는 명시적으로 지정하며 모든 숫자 포맷/편집 명령 완료와 구분합니다.

[장시간 감사의 진행 출력](hwpx-plain-prefix-verification.md)은 일반 `hwpx-edit-corpus-audit.mjs` 명령에 선택적으로 `--progress-every=100`을 추가합니다. 검증을 마친 시도 수와 accepted/refused를 구분하며 범위/검증/최종 종료 조건을 줄이지 않습니다. 옵션이 없으면 기존 출력 그대로입니다.

[원격 후보 브라우저 검증](hwpx-chart-numeric-input-corpus.md)은 기존 숫자/수식 결과 브라우저 명령에 `HWPJS_BROWSER_ORIGIN=https://host:port`와 정확한 `HWPJS_TEST_WASM`을 명시합니다. HTTPS origin·선택 UI 소스·WASM을 대조하며 원격 서버를 생성/종료하지 않습니다. 환경변수가 없으면 기존 격리 로컬 서버 검사입니다.

[숫자 셀 Canvas 브라우저 왕복](hwpx-chart-numeric-input-corpus.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/numeric-input-browser-audit.mjs`입니다. 실제 숫자 치환·독립 SUM/XML·메뉴 이력·다운로드·재업로드를 검사하며 전체 숫자 셀/조판 검증은 아닙니다.

[수식 결과 Canvas 브라우저 왕복](canvas-formula-result-input.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/manual-result-browser-audit.mjs`입니다. 실제 참조 원본의 결과 입력·메뉴 이력·독립 XML/ZIP·다운로드·재업로드와 소유 세션 종료를 검사하며 수식 재계산/전체 조판 검증과 구분합니다.

[수동 결과 참조 감사](hwpx-manual-result-reference-audit.md)의 고정 회귀는 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwpx/manual-result-corpus-audit.test.mjs tests/hwpx/manual-result-oracle-section.test.mjs`입니다. 실제 chart13/참조 copay5곳의 명시적 수동 결과 입력과 산출물 파일 교체 거부를 검사하며, 참조 부재 skip이나 수식 재계산을 성공으로 혼동하지 않습니다.

[HWPX prefix 원본 소속](hwpx-prefix-insertion-affinity.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwpx/anchor-empty-run-oracle.test.mjs`로 합성/실제 원본·normal/-O 변조 거부·저장/이력을 검사합니다. 참조 파일이 없을 때의 skip을 실제 원본 통과로 계수하지 않습니다. 실제 원본 전체 전용 입력 감사는 `node tools/hwpx-specialized-input-audit.mjs --wasm=/absolute/candidate.wasm --fixture=reference/rhwp/samples/hwpx_sample2.hwpx`입니다.

[픽스쳐 요청 수명](fixture-request-lifetime.md)의 집중 회귀는 `node --test --test-concurrency=1 tests/hwpx/fixture-request-lifetime.test.mjs tests/hwpx/fixture-response.test.mjs tests/hwpx/file-input-events.test.mjs tests/hwpx/document-menu-browser-arguments.test.mjs`입니다. 실제 브라우저 검사는 아래 문서 도구 탭 명령의 지연 본문 취소·실제 파일 선택 경로를 포함하며 단위 테스트와 구분합니다.

[문서 도구 탭의 실제 웹 왕복](document-ribbon.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/document-menu-browser-audit.mjs`로 실행합니다. 픽스쳐 선택/열기·메뉴 입력/이력/저장·독립 XML/ZIP·재업로드를 검사합니다. 보호 개체는 같은 환경의 `node tools/unknown-object-browser-audit.mjs`이며 두 실행은 직렬로 수행합니다. 각 도구가 소유 브라우저/서버 종료를 확인합니다. 집중 guard는 `node --test --test-concurrency=1 tests/hwpx/document-menu-browser-arguments.test.mjs tests/hwp5/browser-click-target.test.mjs tests/hwp5/browser-session-close.test.mjs`입니다. 실제 브라우저/전체 fixture 검증과 guard 통과를 구분합니다.

Zig 버전은 `.mise.toml`의 0.17.0입니다. mise 환경에서는 `mise exec -- zig`로 실행합니다. 0.16/0.17 표준 native runner의 wire·검증 범위와 업그레이드 근거는 [Zig 0.17 이관](zig-0.17-upgrade.md)을 따릅니다. 아래 기존 `ReleaseSafe`/`Debug`/`ReleaseFast` 명령은 0.17에서도 허용되는 최적화 모드 별칭입니다.

HWPX 일반 prefix 감사는 `node tools/hwpx-edit-corpus-audit.mjs --wasm=/absolute/candidate.wasm --fixture=/absolute/document.hwpx --history --paragraphs=196:197`로 한 문단만 검사할 수 있습니다. 문서 전체의1기반 문단 번호이며 끝은 제외합니다. 범위는 명시적 WASM·단일 fixture와 함께만 허용하고, 범위를 생략하면 기존 전체 inventory를 유지합니다. 부분 결과는 전체 문서 통과가 아닙니다. 경계·분모·실측은 [후보 공개 감사의 범위 실행](unknown-candidate-public-checks.md)을 따릅니다.

[원본 소속 조회 인덱스](hwp5-source-ownership-index.md)의 대조는 `HWPJS_BASELINE_WASM=/absolute/frozen-baseline.wasm zig build hwp5-ownership-query-parity -Doptimize=ReleaseSafe`입니다. 설치 경로와 다른 동결 baseline이 필요하며 후보는 현재 빌드의 설치 산출물을 명시합니다. 추적48fixture·참조3원본의 전체 표/문단 흐름/단 조회 배열·독립 셀 소속·원본 불변을 검사합니다. 기본 암호/배포 거부3개는 지원 성공이 아닙니다. 관련 문단/단 편집 회귀는 정규 `hwp5-editor-audit`에 등록하며 이 대조가 전체 native·브라우저·기본 WASM 승격을 대신하지 않습니다.

[로컬 개체 번호 보존](hwp5-object-number-retention.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwp5/object-number-text.test.mjs tests/hwp5/object-number-canvas.test.mjs tests/hwp5/unselected-cross-reference-gate.test.mjs`로 실제7구역/반례/Canvas를 검사합니다. 실제 Chromium은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/hwp5-reference-browser-audit.mjs --root=/absolute/verified-source --case=roadmap --port=58851`입니다. `zig build hwp5-editor-audit -Doptimize=ReleaseSafe`는 참조 회귀/guard를 포함한 등록 묶음을 직렬 실행하고 설치 산출물을 명시하며, 집중 통과가 전체 gate 완료를 뜻하지는 않습니다.

[표 참조 실제 브라우저 검증](hwp5-selected-table-number-text.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/hwp5-reference-browser-audit.mjs --root=/absolute/verified-source --port=58851`입니다. 전용 agent-browser 세션·독립 저장 oracle·원본 hwpspec.hwp를 사용하며 한 원본의 실제 입력/이력/저장/재업로드와 종료를 검사합니다. `node --test tests/hwp5/browser-click-target.test.mjs tests/hwp5/browser-session-close.test.mjs`는 클릭/종료 guard의 음성 대조이며 실제 브라우저 검사의 대체가 아닙니다.

위 명령에 `--paragraph=12 --occurrence=1`을 추가하면 검정 본문 위치를 실제 브라우저에서 검사합니다. `node --test tests/hwp5/reference-browser-arguments.test.mjs`는 잘못된 CLI가 브라우저 실행 전에 거부되는지 검사합니다.

[사본 Canvas 원문 보존](hwp5-available-section-copy.md)은 `HWPJS_TEST_WASM=/absolute/copy-api-candidate.wasm node --test tests/hwp5/available-section-copy-canvas.test.mjs`로 3원본·4저장 구역의 제어 경계·대기 입력·독립 전체 Section·이력을 검사합니다. [추적 암호 fixture 경로](fixture-editor-coverage.md)는 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwp5/fixture-password-edit-paths.test.mjs`로 실행합니다. 후자는 정상 암호의 명시적 보호 해제 사본이며 재암호화 저장/브라우저 검사가 아닙니다.


[사본 선택 UI·경고](hwp5-available-section-copy.md)는 `node --test tests/hwp5/available-section-copy-controls.test.mjs tests/hwp5/available-sections-controls.test.mjs`로 동의·취소·파일 수명·지연 실패·잘못된 경고를 검사합니다. native/Worker 묶음에는 `HWPJS_TEST_WASM=/absolute/copy-api-candidate.wasm HWPJS_BASELINE_WASM=/absolute/legacy.wasm`을 명시합니다. 실제 브라우저·전체 조판과 별도입니다.

[저장 구역 사본 API·Worker](hwp5-available-section-copy.md)는 `HWPJS_TEST_WASM=/absolute/copy-api-candidate.wasm HWPJS_BASELINE_WASM=/absolute/legacy.wasm node --test tests/hwp5/available-section-copy-api.test.mjs tests/hwp5/available-section-copy-worker.test.mjs tests/hwp5/normalization-abi.test.mjs tests/hwp5/normalized-open.test.mjs tests/hwp5/available-sections-worker.test.mjs`로 검사합니다. 새 native 사본 API 후보가 필요하며 기본 배포·실제 브라우저 검증과 구분합니다.

[저장 구역 편집 사본 후보](hwp5-available-section-copy.md)의 CLI는 후보 소스에서 `zig build-exe src/hwp5_available_section_copy_probe.zig -O ReleaseSafe -femit-bin=/absolute/copy-probe`로 빌드합니다. `HWPJS_SECTION_COPY_CLI=/absolute/copy-probe HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwp5/available-section-copy-oracle.test.mjs tests/hwp5/section-count-fixtures.test.mjs`로 독립 CFB·DEFLATE·원본 불변을 확인합니다. CLI/reference 부재의 skip은 통과가 아니며 전체 native·웹 편집 검증과 구분합니다.

[저장 구역 읽기 전용](hwp5-available-sections-preview.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm HWPJS_BASELINE_WASM=/absolute/legacy.wasm node --test tests/hwp5/available-sections.test.mjs tests/hwp5/available-sections-worker.test.mjs tests/hwp5/available-sections-controls.test.mjs tests/hwp5/section-count-reference.test.mjs`로 실제 파일·기본 거부·선택 UI·구형 ABI를 검사합니다. 새 native 구현을 가진 후보가 필요하며 구형 baseline 부재는 명시적 skip입니다. native 집중 명령은 해당 후보 소스에서만 유효하며 전체 지원/기본 배포 완료 검사는 아닙니다.

[Native 범위 재개](native-test-range-audit.md)는 `node tools/zig-native-batch-audit.mjs --binary=/absolute/tests --batch-size=1 --start-index=2532 --expected-sha256=<original-lowercase-sha256>`처럼 실행합니다. 선택적인 `--end-index`는 배타적 끝이며 부분 성공은 전체 gate가 아닙니다. `node --test tests/hwp5/native-test-range.test.mjs`로 인자·inventory 경계를 검사합니다.

[차트 혼합 현재값](hwpx-chart-mixed-current-values.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwpx/chart-mixed-current-values.test.mjs`로 검사합니다. 계열 이름 API가 있는 후보와 RHWP issue6037 원본·기존 Python oracle이 필요하며 전체 native/브라우저 검사는 아닙니다.

[구역 불일치 열기 안내](hwp5-section-count-refusals.md)는 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwp5/load-failure-guidance.test.mjs tests/hwp5/document-save.test.mjs tests/hwp5/document-failure-order.test.mjs tests/hwpx/preview-startup.test.mjs`로 검사합니다. 안내만 추가하며 파서 거부·저장·런타임 오류 정책을 변경하지 않습니다.

[차트 포인트 통합 기록](hwpx-chart-main-integration.md)의 재현은 `node tools/wasm-export-parity.mjs /absolute/baseline.wasm /absolute/candidate.wasm`과 `HWPJS_TEST_WASM=/absolute/candidate.wasm HWPJS_BASELINE_WASM=/absolute/baseline.wasm node --test --test-concurrency=1 tests/wasm/export-parity.test.mjs tests/hwpx/chart-baseline-parity.test.mjs tests/hwpx/chart-current-editor.test.mjs tests/hwpx/chart-string-editor.test.mjs tests/hwpx/chart-string-api-boundary.test.mjs tests/hwpx/chart-ole-policy-boundary.test.mjs`입니다. export 이름·종류 검사는 signature·동작 전체 동일성 검사가 아니며 baseline/reference 부재의 skip은 통과로 세지 않습니다.

[Worker fixture 재열기](hwpx-worker-fixture-roundtrip.md)는 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwpx/worker-fixtures.test.mjs`입니다. Git 추적 HWPX inventory·실제 fixture·계산 결과가 있는 후보의 경우 테스트용 Python oracle을 사용합니다. 기존 기본 WASM도 같은 명령으로 비교하며 계산 결과 편집과 보호 분기를 구분합니다.

참조 reader 전수 대조는 `node tools/reference-reader-parity-audit.mjs --before-wasm=/absolute/baseline.wasm --after-wasm=/absolute/candidate.wasm --root=reference/rhwp/samples`입니다. `node --test tests/hwp5/reference-reader-parity-result.test.mjs`로 결과 분류·변조·잘못된 CLI를 검사합니다. 동일 거부와 범위 제외는 지원 성공이 아니며 [실측 범위](hwp5-section-count-refusals.md)를 따릅니다.

[구역 개수 원본 검사](hwp5-section-count-refusals.md)는 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test tests/hwp5/section-count-reference.test.mjs`입니다. RHWP 원본 3개와 테스트용 Python olefile이 필요합니다. reference 부재는 명시적 skip이며 제품 자동 복구·전체 필드 지원 검사가 아닙니다.

[차트 UI·Worker 연결](hwpx-chart-ui-main-integration.md)은 `HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwpx/chart-query-readiness.test.mjs tests/hwpx/chart-series-text-controls.test.mjs tests/hwpx/chart-series-text-worker.test.mjs tests/hwpx/chart-current-worker.test.mjs tests/hwpx/chart-controls.test.mjs tests/hwpx/chart-ole-policy-worker.test.mjs tests/hwpx/chart-ole-policy-password-worker.test.mjs tests/hwpx/chart-point-table.test.mjs tests/hwpx/chart-point-grid.test.mjs`로 검사합니다. reference와 해당 native 기능을 갖춘 후보가 필요합니다. 기존 기본 WASM 비교는 계열 이름 Worker 사례를 제외하며 실제 Chromium·전체 native 검사와 구분합니다.

[HWP5 원본 입력 적격성](hwp5-text-source-eligibility.md)은 구역 간 native 정책의 조회·부분 할당 실패·optional ABI·Canvas 읽기 전용/서식 분리 검증 명령을 소유합니다.

[표 번호 참조의 글자 서식 보존](hwp5-table-number-format-retention.md)은 native 부분 할당 실패·실제 원본과 별도 후보 WASM의 공개 API/독립 저장 대조 명령을 소유합니다. 텍스트 편집·번호 갱신 허가와 구분합니다.

[XML 속성 동일 뷰](xml-normalized-attribute-view.md)의 명령은 해당 문서에서 관리합니다. 디코더와 값·오류·길이 경계를 대조하고 실제 중첩 표 조회 할당량을 측정합니다.

`zig test src/root.zig -O ReleaseSafe --test-filter 'table number '`는 [표 번호 원본 대상](hwp5-table-number-targets.md)의 ID·캡션·코드18 연결, 전체 부분 할당 실패, 실제137개 선언과 캐시 숫자 변조 반례를 검사합니다. Debug도 같은 필터입니다. `node --test tests/hwp5/table-number-source-oracle.test.mjs`는 독립 CFB/레코드 oracle을 실행합니다. reference 없는 원본 검사는 skip을 표시하며 편집 허용 검사와 구분합니다.

`HWPJS_TEST_WASM=/absolute/candidate/bin/hwpjs.wasm node --test tests/hwp5/normalized-open.test.mjs tests/hwp5/normalized-distribution.test.mjs tests/hwp5/normalization-abi.test.mjs`는 [보정본 열기 API](hwp5-normalized-open.md)의 실제 파일·이력·ABI 부재·정밀도 검사를 실행합니다. `zig test src/root.zig -O ReleaseSafe --test-filter 'normalized open preserves strict baseline'`는 전체 할당 실패와 strict 기준을 검사하며 Debug도 같은 필터를 사용합니다. reference 없는 실파일 skip은 통과와 구분합니다.

`node --test tests/hwp5/document-save.test.mjs tests/hwp5/document-menu-save.test.mjs`는 [저장 실패 안내](save-failure-guidance.md)의 포커스·전체 라벨 스크롤·직접 동의 유지와 기존 저장 경계를 검사합니다. 실제 WASM 검사는 `HWPJS_TEST_WASM`으로 후보를 명시합니다.

`zig test src/root.zig -O ReleaseSafe --test-filter 'actual compact empty bullet' --test-filter 'bullet compact' --test-filter 'bullet image is nine'`는 [빈 이미지 글머리표](hwp5-bullet-compatibility.md)의 실제 24바이트 레코드와 기존 이미지 절단·16비트 ID·꼬리 보존을 함께 검사합니다. Debug도 같은 필터를 사용하며 fixture skip을 실제 통과로 세지 않습니다.

`node --test tests/hwp5/character-spacing-arithmetic.test.mjs tests/hwp5/line-spacing-compat.test.mjs`는 [자간 정수 산술](character-spacing-arithmetic.md)의 signed delta·overflow·공통 함수 동일성과 기존 행간 회귀를 검사합니다. 아직 자간 표시 연결을 검증하는 명령은 아닙니다.

`HWPJS_TEST_WASM=/absolute/candidate/bin/hwpjs.wasm node --test tests/hwp5/horizontal-font-scale.test.mjs tests/hwp5/relative-font-size-reference.test.mjs`는 [장평](horizontal-font-scale.md)과 상대 크기의 실제 리소스·통제 측정·caret/선택·Canvas transform 수명을 검사합니다. 실제 한글 글꼴 폭·전체 shaping 검사를 대신하지 않습니다.

`HWPJS_TEST_WASM=/absolute/candidate/bin/hwpjs.wasm node --test tests/hwp5/relative-font-size-reference.test.mjs`는 [상대 글자 크기](relative-font-size.md)를 실제 양 형식 API·기존 CSS와 대조합니다. 원값 조회를 지원하는 후보가 필요하며 글리프 크기와 명목 줄 높이를 구분합니다.

`HWPJS_TEST_WASM=/absolute/candidate/bin/hwpjs.wasm HWPJS_METRICS_BASELINE_WASM=/absolute/baseline/bin/hwpjs.wasm node --test tests/hwp5/character-font-metrics.test.mjs`는 [언어별 조판 원값](character-font-metrics.md)의 양 형식 실제 API·Worker·이력과 구형 ABI를 검사합니다. `node --expose-gc tools/character-font-metrics-audit.mjs --format=hwp5 --wasm=/absolute/candidate/bin/hwpjs.wasm --inventory=/absolute/font-inventory.json`는 이전 font inventory의 verified 집합만 재검사합니다. HWPX는 format=hwpx로 실행하며 제외된 경로·coverageComplete를 함께 보고합니다. inventory 없는 전체 파일 성공으로 해석하지 않습니다.

`node --test tests/hwpx/font-height-reference.test.mjs tests/hwp5/font-height-reference.test.mjs tests/hwp5/line-spacing-compat.test.mjs tests/hwp5/pdf-font-reference.test.mjs`는 [공통 글꼴 높이 정책](font-layout-metrics.md)의 실제 XML/HTML·CFB·혼합 크기·행간·PDF 선언 크기를 검사합니다. PDF 조건부 skip과 실제 실행 통과를 구분합니다.

`HWPJS_TEST_WASM=/absolute/candidate/bin/hwpjs.wasm node --test tests/hwpx/font-face-metadata.test.mjs tests/hwpx/font-face-metadata-editor.test.mjs`는 [HWPX 메타데이터](hwpx-font-face-metadata.md)의 decoder·표시·실제 API·Worker·이력을 검사합니다. `node tools/hwpx-font-metadata-audit.mjs --wasm=/absolute/candidate/bin/hwpjs.wasm --root=reference/rhwp/samples --baseline-wasm=/absolute/baseline/bin/hwpjs.wasm`로 독립 ZIP/XML 전수를 실행하며 coverageComplete와 states를 함께 확인합니다.

`zig test src/root.zig -O ReleaseSafe --test-filter 'HWP5 font metadata' --test-filter 'HWP5 font name display' --test-filter 'HWP5 font face snapshot'`는 [글꼴 메타데이터](hwp5-font-face-metadata.md)의 소유권·할당 실패·부재/손상·직렬화 검사를 수행하며 Debug도 같은 필터를 사용합니다. 새 후보로 `HWPJS_TEST_WASM=/absolute/candidate/bin/hwpjs.wasm node --test tests/hwp5/font-face-metadata.test.mjs tests/hwp5/font-face-metadata-editor.test.mjs`를 실행해 실제 ABI·Worker·저장/이력·기존 응답 호환을 검사합니다. 전체 native·브라우저 조판 검사를 대신하지 않습니다.

`node --expose-gc tools/hwp5-font-metadata-audit.mjs --wasm=/absolute/candidate/bin/hwpjs.wasm --root=reference/rhwp/samples --baseline-wasm=/absolute/baseline/bin/hwpjs.wasm`는 [메타데이터 전수](hwp5-font-face-metadata.md)의 native 응답·무변경 저장·기존 open 결과를 독립 원문과 대조합니다. baseline 인자는 선택적이며 출력 states/coverageComplete를 반드시 함께 확인합니다.

`node --test tests/hwp5/pdf-font-reference.test.mjs tests/hwp5/font-height-reference.test.mjs`는 [PDF 글꼴 기준 대조](hwp5-font-layout-reference.md)의 선언 크기를 검사합니다. PDF 검사는 RHWP reference와 외부 분석 명령 `pdftohtml`이 없으면 명시적으로 skip합니다. skip과 실제 실행 통과를 구분하며 Canvas 시각 검사가 아닙니다.

`node --test tests/hwp5/font-height-reference.test.mjs tests/hwp5/line-spacing-compat.test.mjs`는 [기존 글꼴·행간 기준](hwp5-font-layout-reference.md)의 실제46줄과 HWP 호환 레코드 inventory·작은 글꼴/빈 줄 경계를 검사합니다. 브라우저·전체 조판 검사가 아닙니다.

[행간 집중검사](hwp5-line-spacing.md)는 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWP5 paragraph spacing' --test-filter 'HWP5 effective paragraph spacing'`이며 Debug도 같은 필터입니다. 빌드는 `zig build -Doptimize=ReleaseSafe`입니다. JS 검사는 `HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwp5/line-spacing-compat.test.mjs tests/hwp5/line-spacing-worker.test.mjs`입니다. 전체 root/브라우저 검증과 구분합니다.

`node tools/run-selected-node-tests.mjs tests/hwp5/native-guard-error.test.mjs`는 [RSS 감시](native-core-rss-monitor.md)의 관측 오류·자손 소유 범위·실제 테스트 프로세스 격리를 검사하며 전체 native 실행을 대신하지 않습니다.

후보 EMF/CFB와 검증용 bridge를 명시적으로 짝지어 검사할 때는 `HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm HWPJS_TEST_HWP5_PROBE=/absolute/probe/hwp5-probe.wasm node --test tests/hwp5/emf-corpus.test.mjs tests/hwp5/emf-corpus-artifacts.test.mjs`를 사용합니다. `zig build emf-corpus-audit -Doptimize=ReleaseSafe`는 설치된 제품/probe 경로를 두 환경변수에 지정하고 경로 부정 대조도 함께 실행합니다. probe는 제품 ABI가 아닌 test-only bridge이며 [EMF 검증 기록](emf-framing.md)을 따릅니다.


`zig test src/root.zig -O ReleaseSafe --test-filter 'dutmal' --test-filter 'inline string source report' --test-filter 'XML content source span'`는 덧말 leaf/현재값/저장/필드/구조 가드·전체 실패 주입의 집중 진입점입니다. `HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test --test-concurrency=2 tests/hwpx/dutmal-text-editor.test.mjs tests/hwpx/dutmal-text-worker.test.mjs tests/hwpx/dutmal-sites.test.mjs tests/hwpx/inline-string-source-wire.test.mjs tests/hwpx/inline-string-source-reference.test.mjs tests/hwpx/dutmal-edge-publication.test.mjs`는 실제 API/Worker·독립 XML/ZIP·BOM/이력 검사입니다. Canvas paint/선택의 대역 검사는 `tests/hwpx/dutmal-renderer-worker.test.mjs`이며 정규 hwpx-text-audit에도 등록합니다. [후보·미지원 경계](hwpx-dutmal-text-changes.md)를 따릅니다.

`zig test src/root.zig -O ReleaseSafe --test-filter 'picture owner batch'`는 그림 단일/일괄 조회 동치·빈 요청·행별 실패·전체 할당 실패/JSON 해제를 검사합니다. `HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test --test-concurrency=2 tests/hwpx/picture-owners-reference.test.mjs tests/hwpx/picture-owners-history.test.mjs tests/hwpx/picture-owners-wire.test.mjs tests/hwpx/picture-owner-batch-content.test.mjs`는 실제 그림·현재 소유 위치/이력·독립 객체 XML/ZIP·변조 거부·wire/fallback 검사이며 정규 hwpx-text-audit에도 등록합니다. [후보·실측 경계](hwpx-picture-owner-batch.md)를 따릅니다.

`zig test src/root.zig -O ReleaseSafe --test-filter 'field label local lease' --test-filter 'field local source filtering' --test-filter 'nested source label edits' --test-filter 'nested field scope' --test-filter 'nested field source ownership' --test-filter 'nested label empty' --test-filter 'field text ranges known pairs' --test-filter 'source field analysis'`는 중첩 소유·미해결 목록 보호·원본 진단 캐시·실패 주입 검사입니다. `HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwpx/nested-field-reference.test.mjs tests/hwpx/nested-field-canvas.test.mjs`는 두 실제 규제분석 문서의 API/Worker·Canvas 대역·독립 저장/이력 검사이며 정규 hwpx-text-audit에도 등록합니다. [후보·실측 경계](hwpx-nested-field-labels.md)를 따릅니다.

`zig test src/root.zig -O ReleaseSafe --test-filter 'field host query' --test-filter 'field queries retain' --test-filter 'field owned and uncached' --test-filter 'HWPX field label splice'`는 필드 query/setter의 현재 위치·보호 경계·실패 주입을 검사합니다. `HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwpx/field-query-publication.test.mjs`는 실제 표 호스트·원본/분할 hyperlink·선두 BOM·독립 XML/이력 검사이며 정규 hwpx-text-audit에도 등록합니다. [후보·지원 경계](hwpx-field-range-target.md)를 따릅니다.

`zig test src/text_range_disjoint_probe.zig -O ReleaseSafe --test-filter 'disjoint range'`는441좌표 조합·현재/원본 우선순위·빈 마커·전체 할당 실패를 검사합니다. Debug/ReleaseFast도 같은 선언을 선택합니다. `HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwp5/reference-range-prefix.test.mjs tests/hwp5/onsaemiro-range-prefix.test.mjs tests/hwp5/disjoint-range-marker.test.mjs tests/hwp5/disjoint-range-suffix.test.mjs`는 실제 prefix/suffix·독립 저장·파생 빈 마커 반례입니다. [후보/정책/브라우저 경계](hwp5-plain-text-edit-experiment.md)를 따릅니다.

`zig test src/hwp5_unselected_field_tests.zig -O ReleaseSafe --test-filter 'unselected field policy'`는 비대상 구역의 실제 필드 연결·전체 실패 주입·종류 불일치/미지 제어 거부를 검사합니다. `HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwp5/unselected-field-sections.test.mjs tests/hwp5/unselected-cross-reference-gate.test.mjs`는 14구역 입력/서식/속성·독립 저장/이력과 비대상 상호참조 보호입니다. [후보와 검증 경계](hwp5-unselected-field-preservation.md)를 따릅니다.

`zig test src/hwp5_object_metadata_tests.zig -O ReleaseSafe --test-filter 'object control metadata' --test-filter 'actual object metadata'`는 객체 CTRL_DATA 소유권/스키마/실패 주입을 선택합니다. `HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwp5/object-metadata-numeric-retention.test.mjs tests/hwp5/numeric-formula-corpus.test.mjs`는 실제 숫자 의존 셀·독립 산술·원문 메타데이터·거부 후 redo를 검사합니다. [분리 후보와 미완료 경계](hwp5-object-metadata-retention.md)를 따릅니다.

`zig test src/root.zig -O ReleaseSafe --test-no-exec --test-filter 'HWPX empty protected merge' --test-filter 'HWPX styled protected' --test-filter 'HWPX protected merge actual' --test-filter 'HWPX protected splice actual' --test-filter 'HWPX anchored split history' --test-filter 'HWPX protected structure actual line' -femit-bin=/absolute/protected-tests`는 보호 문단 모듈8선언과root를 선택합니다. 이어 `node tools/zig-native-footprint-audit.mjs --binary=/absolute/protected-tests --batch-size=1 --max-physical-mib=1024`로 감시하며, 전체 바이너리에서의 개별 선택/비교 경계는 [할당자 자원 기록](native-allocator-resource-regression.md)을 따릅니다.

`zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX empty protected merge allocation' --test-no-exec -femit-bin=/absolute/empty-merge-tests` 후 `node tools/zig-native-footprint-audit.mjs --binary=/absolute/empty-merge-tests --batch-size=1 --max-physical-mib=1024`로 보호 병합 전체 실패 주입의 자원 대조를 실행합니다. [중단·수정·검증 경계](native-allocator-resource-regression.md)를 따르며 전체 native 완료나 제품 메모리 개선으로 해석하지 않습니다.

`zig test src/form_source_fixture_test.zig -O ReleaseSafe --test-filter 'observed form source'`는 관측 양식 원문 연결·버전/꼬리/ID 거부·전체 할당 실패를 검사합니다. `HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwp5/form-source-retention.test.mjs tests/hwp5/form-source-worker.test.mjs tests/hwp5/form-token-boundaries.test.mjs`는 실제7파일1,446문단의 독립 Section/CFB/이력·Worker 대역 입력과1,712토큰 거부입니다. 명시적 후보가 필요하며 [계약·실측·미지원 경계](hwp5-form-source-retention.md)를 따릅니다.

`zig test src/hwpx_created_table_formula_validation_tests.zig -O ReleaseSafe --test-filter 'created table flat formula inputs' --test-filter 'created table saved formula validation'`는 기존 생성 표·수식 저장 의미/OOM 검사를 선택합니다. `HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwpx/created-table-formula-host.test.mjs tests/hwpx/manual-formula-dependency-preservation.test.mjs`는 의미 검증과 표시 보존의 정합성을 함께 검사합니다. [회귀 원인과 경계](hwpx-preserved-formula-dependencies.md)를 따릅니다.

`zig test src/hwpx_formula_preserved_dependency_tests.zig -O ReleaseSafe --test-filter 'HWPX preserved dependency'`는 표시 전용 의존 수식 저장·전체 할당 실패·실제 정의 변경 거부·숫자 입력 재계산을 검사합니다. `HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwpx/manual-formula-dependency-preservation.test.mjs`는 실제 issue5543의 독립 XML/ZIP·이력 반례입니다. [보존 경계와 실측](hwpx-preserved-formula-dependencies.md)을 따르며 전체 native/브라우저 완료와 구분합니다.

`node tools/hwpx-manual-result-input-audit.mjs --wasm=/absolute/candidate/hwpjs.wasm --fixture=/absolute/document.hwpx`는 원본 수식별 native 결과 입력·독립 XML/ZIP·재열기/이력을 검사합니다. `--fixture` 생략은 추적 HWPX 목록이며 참조 root 전체가 아닙니다. `node --test tests/hwpx/manual-result-oracle-section.test.mjs`는 구역 선택/변조/CLI 반례입니다. 성공·실패와 dependency 제한은 [참조 수식 결과 감사](hwpx-manual-result-reference-audit.md)를 따릅니다.

`zig test src/hwpx_manual_formula_result_tests.zig -O ReleaseSafe --test-filter 'HWPX manual formula result' --test-filter 'HWPX source formula display' --test-filter 'HWPX source result seed'`는 결과 소유/표시 provenance·원자성/OOM 집중 진입점입니다. [분리 검증 기록](hwpx-manual-result-publication.md)의 전체 native와 구분합니다.

`zig test src/hwpx_formula_result_splice_tests.zig -O ReleaseSafe --test-filter 'HWPX partial manual result splice'`, `zig test src/hwpx_formula_result_target_tests.zig -O ReleaseSafe --test-filter 'HWPX formula result target'`, `zig test src/hwpx_formula_exterior_override_tests.zig -O ReleaseSafe --test-filter 'HWPX exterior'`는 각각 [부분 치환](hwpx-formula-result-splice.md)·[현재 좌표/표시](hwpx-formula-result-targets.md)·[바깥 텍스트 보존](hwpx-formula-exterior-display-preservation.md)의 집중 native/OOM/fixture 검증입니다. root에도 등록하며 집중 결과를 전체 gate로 합산하지 않습니다.

`HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwpx/manual-formula-result-editor.test.mjs tests/hwpx/manual-formula-result-splice.test.mjs tests/hwpx/manual-formula-result-targets.test.mjs tests/hwpx/manual-formula-result-worker.test.mjs tests/hwpx/manual-formula-result-text-worker.test.mjs tests/hwpx/manual-formula-result-edge.test.mjs tests/hwpx/manual-formula-result-exterior.test.mjs`는 선택적 수동 결과 ABI를 갖춘 명시적 후보의 API/Worker/독립 XML/ZIP/이력 검사입니다. 이 파일들은 `zig build hwpx-text-audit -Doptimize=ReleaseSafe`의 정규 목록에도 포함합니다. 실제 브라우저·물리 IME·조판 검증 범위는 [Canvas 결과 입력](canvas-formula-result-input.md)을 따릅니다.

`zig test src/hwpx_formula_preservation_test.zig -O ReleaseSafe --test-filter 'untouched formula preservation'`는 최종 flat 원문 보존·내부 derive·실제 숫자 입력 후 재계산을 전체 할당 실패 지점에서 검사하는 별도 native 진입점입니다. 정규 root 전체 검사와 합산하지 않으며 [copay 저장 계약](hwpx-copay-below-investigation.md)을 따릅니다.

`HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwpx/copay-below-editor.test.mjs tests/hwpx/empty-formula-reference.test.mjs`는 실제 RHWP 참조4파일의 BELOW 입력/독립 XML·Decimal·이력과 수식 없는 구역의 반복 빈 목록·원문 저장 보존을 검사합니다. 참조 누락은 실패이며 기본 등록 묶음·전체 참조 편집·브라우저 검증과 구분합니다. [빈 수식 조회](hwpx-empty-formula-query.md)의 후보/실측 경계를 따릅니다.

`node tools/hwpx-query-parity-audit.mjs --before-wasm=/absolute/before.wasm --after-wasm=/absolute/candidate.wasm --root=reference/rhwp/samples --max-rss-mib=512 --max-duration-ms=15000`는 문서별 제한된 자식 프로세스로 전체 구역 조회·저장 응답을 비교합니다. 같은 오류는 지원이 아니며 원본과 다른 무변경 저장·저장 오류·미완료는 exit1입니다. [조회 감사 계약](hwpx-query-parity-audit.md)의 관측 한도와 판정을 따릅니다.

`zig test src/testing_checked_allocator_probe.zig -O ReleaseSafe --test-filter 'probe positive' --test-filter 'checked allocator retains'`는 범위 테스트 할당자의 안전한 양성 대조입니다. `deliberate leak`/`deliberate assertion` 필터는 실제 native 실패·exit1이 예상되는 별도 음성 대조이며 정규 root에 import하지 않습니다. [자원 재현과 진단 손실](native-allocator-resource-regression.md)을 먼저 읽습니다.

`zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX formula expression' --test-filter 'HWPX formula command plan'`는 공유 문법의 MAX 양성·MEDIAN 음성·성공 Plan 해제 및 기존 전체 할당 실패를 검사합니다. [잘못된 기대값의 원인과 범위](formula-max-test-regression.md)를 따릅니다.

`HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwpx/created-source-scene-worker.test.mjs tests/hwpx/source-table-control-coverage.test.mjs`는 추적 noori의 원본 표5개/그림4개와 별도 본문 생성 표의 조립·독립 XML/ZIP·이력 및 원본 제어 coverage 반례를 검사합니다. 두 파일은 기본 hwpx-text-audit에도 포함하며 [소유권과 범위](generated-source-table-pages.md)를 따릅니다.

`HWPJS_TEST_WASM=/absolute/candidate/hwpjs.wasm node --test tests/hwpx/created-source-table-host.test.mjs tests/hwpx/created-source-table-worker.test.mjs`는 원본 인라인 표와 생성 표의 동일 호스트/identity 격리·원본 XML/ZIP·입력/저장/이력을 검사합니다. Worker 검사는 `reference/rhwp/samples/task1763/cell_trailing_ls_expand.hwpx`가 실제로 있어야 하며 누락을 skip하지 않습니다. 이 참조 검사는 기본 hwpx-text-audit와 별도이고 순수 host 반례만 기본 목록에 등록합니다. 지원/미지원 경계는 [원본·생성 표 페이지](generated-source-table-pages.md)를 따릅니다.

`node tools/hwp5-merge-corpus-audit.mjs`는 제품 WASM 빌드 후 추적 HWP의 모든 인접 문단 쌍에 병합을 시도합니다. 독립 전체 Section·비대상 스트림·저장 후 재열기 전체 raw text·native undo/redo와 거부 뒤 원본/redo 보존을 검사하며 미지원·보호 파일 거부를 별도 집계합니다. 상세 계약과 한계는 [문단 구조 편집](paragraph-structure-edit.md)이 소유합니다.

`node tools/hwp5-split-corpus-audit.mjs`는 제품 WASM 빌드 후 모든 추적 HWP 문단에서 시작·중간·끝 분할을 시도하고 독립 전체 Section·비대상 스트림·native undo/redo와 거부 뒤 원본/redo 보존을 검사합니다. 보호 및 컨트롤 미지원 거부는 별도 집계하며 전체 선택 영역·조판 완료 증거는 아닙니다. 상세 계약은 [문단 구조 편집](paragraph-structure-edit.md)이 소유합니다.

`node tools/hwp5-edit-corpus-audit.mjs --history`는 모든 추적 HWP5 문단 prefix 시도에 native undo/redo와 전체 저장값·reflow 복원을 추가합니다. 최종 문단 텍스트·비본문 스트림은 독립 CFB.js/Node로 검사합니다. 숫자 입력 및 보호 파일 거부는 별도 집계하며 전체 편집 위치·서식·조판 지원의 증명은 아닙니다. HWPX 편집은 별도 HWPX corpus 명령이 소유합니다.

`node tools/hwpx-edit-corpus-audit.mjs --history`는 모든 추적 HWPX 일반 문단의 prefix 시도에 native undo/redo·원본/편집 ZIP 일치·거부 후 redo 보존을 추가합니다. 암호화·컨트롤·숫자 입력 거부를 별도로 집계하며 전체 컨트롤 지원이나 독립 decoder 비교의 대체가 아닙니다. 이력 없이 기존 편집 복원 조사는 같은 명령에서 --history를 생략합니다.

[HWPX native 이력](hwpx-edit-history.md)은 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX native history'`와 `'HWPX checkpoint'`로 집중 검사합니다. Debug·ReleaseFast도 같은 필터를 사용합니다. 제품 빌드 후 `node --test tests/hwpx/history-editor.test.mjs tests/hwpx/canvas-preview.test.mjs tests/hwp5/history-controls.test.mjs tests/hwp5/canvas-editor.test.mjs`는 공개 이력·Worker·Canvas·버튼 경계를 검사하며 정규 두 editor audit에도 포함됩니다. 실제 브라우저·OS IME·전체 조판 검증은 별도입니다.

[Canvas 편집본 다운로드](canvas-document-download.md)는 `node --test tests/hwp5/document-save.test.mjs tests/hwp5/canvas-editor.test.mjs tests/hwpx/canvas-preview.test.mjs`로 저장 위임·초안 대기·조합·다운로드 정리 및 실제 HWPX Worker snapshot을 검사합니다. 정규 hwp5-editor-audit와 hwpx-text-audit에도 포함되며 실제 브라우저 파일 다운로드·OS IME는 별도입니다.

HWPX 개체의 빈 run 입력 경계는 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX run text boundaries'` 및 Debug·ReleaseFast로 검사합니다. 제품 빌드 후 `node --test tests/hwpx/object-boundary-editor.test.mjs`는 실제 shapeline의 세 입력 위치·독립 전체 XML/ZIP·개체 속성 손상 반례를 검사하며 정규 hwpx-text-audit에도 포함됩니다. `node tools/hwpx-anchor-corpus-audit.mjs --leading-boundary`는 일반 편집 불가 문단의 위치 0 삽입을 조사합니다. 모든 위치·조판·실제 OS IME 검증은 아닙니다.

[HWPX 머리말·꼬리말 소유 문단 편집](hwpx-header-footer-edit.md)은 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX header footer edit'` 및 Debug·ReleaseFast로 소유·거부·할당 실패를 검사합니다. 제품 빌드 후 `node --test tests/hwpx/header-footer-editor.test.mjs`는 실제 소유 문단 세 개의 공개 편집과 Python 일반/최적화 전체 XML/ZIP 비교를 실행하며 `hwpx-text-audit`에도 포함됩니다. 실제 브라우저·영역 조판 검증은 별도입니다.

[HWPX 개체 앵커 위치](hwpx-anchor-text-positions.md)는 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX anchor positions'`로 위치를, `'HWPX anchored paragraph'` 필터로 정책·거래·할당 실패를 검사합니다. Debug·ReleaseFast도 같은 필터를 사용합니다. 기존 회귀는 `'HWPX field'`·`'HWPX plain paragraph'`·`'HWPX formula splice'` 필터로 별도 실행합니다. 제품 빌드 후 `node --test tests/hwpx/anchor-editor.test.mjs tests/hwpx/canvas-preview.test.mjs`는 공개 API·독립 XML/ZIP·Worker를 검사하고 `node tools/hwpx-anchor-corpus-audit.mjs`는 일반 편집 불가 문단의 보호 앵커 경계 편집·저장·재열기·복원을 시도합니다. 전체 위치 물질화·조판 검증은 아닙니다.

[HWPX 주석 본문 편집](hwpx-note-text-edit.md)은 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX note edit'`로 실제 네 본문·번호 원문 보존·거부 반례·할당 실패를 검사합니다. Debug·ReleaseFast도 같은 필터를 사용합니다. 제품 빌드 후 `node --test tests/hwpx/note-editor.test.mjs`는 공개 편집·독립 Python 일반/최적화 전체 XML·ZIP 비교를 실행하며 `hwpx-text-audit`에도 포함됩니다. 실제 브라우저·번호 생성·주석 조판은 별도입니다.

`node tools/hwpx-edit-corpus-audit.mjs`의 임의 한글 prefix 검사는 계산 입력 셀의 `InvalidFormulaNumber`를 구조적 미지원과 별도로 집계합니다. canEdit=true여도 모든 문자열이 유효한 숫자는 아닙니다. 거부 뒤 원본 ZIP 일치는 그대로 검사하며 임의 prefix 거부를 숫자 편집 미구현으로 해석하지 않습니다.

계산 필드 구역의 편집 거래 실패 검사는 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX formula splice'`, 실제 chart 세션 저장·거부 원자성은 `'HWPX editor session formula'` 필터로 실행합니다. Debug·ReleaseFast도 같은 필터를 사용합니다. 전체 corpus·제품 공개 API·브라우저는 별도 검증입니다.

HWPX 실제 chart 계산 기대값은 `python3 tools/hwpx-formula-cell-oracle.py`와 `python3 -O tools/hwpx-formula-cell-oracle.py`로 독립 산출합니다. native HWPX formula 집중 검사가 해당 13개 값과 셀 수를 대조합니다. 이 oracle은 일반 편집/저장 검증의 대체가 아닙니다.

[HWPX 계산 필드 편집과 저장](hwpx-formula-parameters.md)은 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX formula'`로 실제 chart 13개 정의와 매개변수·공유 문법·현재 셀 재계산·XML/ZIP 저장 및 거래 할당 실패를 검사합니다. Debug·ReleaseFast에도 같은 필터를 사용합니다. 공개 API 검사는 제품 빌드 후 `node --test tests/hwpx/formula-editor.test.mjs`로 별도 실행하며 실제 브라우저·전체 수식 문법·조판 검증은 아닙니다.

[HWPX 필드 라벨 편집](hwpx-field-text-edit.md)은 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX field'`로 마커·범위·현재 위치·소유·라벨 거래·dirty 검사를, `'HWPX editor session field'` 필터로 native 조회/명령과 할당 실패를 검사합니다. Debug·ReleaseFast에서도 같은 필터를 사용합니다. 제품 빌드 후 `node --test tests/hwpx/editor.test.mjs tests/hwpx/canvas-preview.test.mjs`는 공개 API·독립 XML/ZIP 대조·7개 라벨 왕복·44개 Worker 로드를 포함합니다. 실제 브라우저·OS IME·전체 필드 종류/조판 검증은 별도입니다.

[HWPX 탭 위치](hwpx-paragraph-text-positions.md)는 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX paragraph positions'` 및 일반 문단 필터로 검사합니다. `python3 tools/hwpx-tab-edit-oracle.py --self-test`와 Python `-O`는 독립 탭 oracle 반례를, 제품 빌드 후 공개 HWPX editor 검사와 `hwpx-text-audit`는 실제 네 경계의 XML/ZIP 대조를 포함합니다. 전체 컨트롤 편집·조판 증명은 아닙니다.

[HWPX native 편집 세션](hwpx-editor-session.md)은 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX editor session'`로 실제 파일의 소유·편집·저장·재열기·복원, 한도·암호화 거부, 전체 할당 실패를 검사합니다. 공개 API·브라우저 편집 검증은 별도입니다.

HWPX 공개 세션은 제품 WASM 빌드 후 `node --test tests/hwpx/editor.test.mjs tests/hwpx/canvas-preview.test.mjs`로 검사하며 `hwpx-text-audit`에도 포함됩니다. `node tools/hwpx-edit-corpus-audit.mjs`는 모든 추적 fixture 문단에 공개 API 삽입·저장·재열기·원본 복원을 시도하고 미지원 거부를 별도로 집계합니다. 제품 자체 재열기 검사이며 독립 XML/ZIP oracle이나 실제 브라우저 E2E의 대체가 아닙니다.

[HWPX 일반 문단 편집](hwpx-plain-paragraph-edit.md)은 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX plain paragraph'` 및 Debug·ReleaseFast로 무변경 서식·다중 사이트 원자성·할당 실패·컨트롤 거부를 검사합니다. `zig test src/hwpx_paragraph_edit_survey.zig -O ReleaseSafe --test-filter 'HWPX selected paragraph edit fixture survey'`는 모든 fixture section 문단의 prefix 삽입·저장·재파싱·복원을 시도하고 거부를 분리합니다. 한정적 native XML 조사이며 공개 편집·조판 완료 증명은 아닙니다.

[HWPX 텍스트 조각 편집](hwpx-text-site-edit.md)은 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX text sites'`, `'HWPX text site edit'`, `'HWPX XML source writer'`, `'XML text writer'`로 책임별 집중 검사를 실행합니다. Debug·ReleaseFast에서도 동일 필터를 사용합니다. `python3 tools/zip-replacement-oracle.py --text-edit`와 Python `-O` 실행은 44개 파일의 첫 텍스트 사이트 삽입·ZIP 저장을 독립 XML/ZIP 구현으로 비교합니다. 같은 도구의 `--self-test`와 Python `-O` 실행은 oracle 자체 반례를 검사합니다. 전체 문단·활성 분기·공개 편집 UI 완료 증명은 아닙니다.

[ZIP 선택 항목 교체 저장](zip-replacement-writer.md)은 `zig test src/root.zig -O ReleaseSafe --test-filter 'ZIP replacement writer'`로 집중 반례·할당 실패를 검사합니다. Debug·ReleaseFast도 같은 필터로 실행합니다. `python3 tools/zip-replacement-oracle.py`와 `python3 -O tools/zip-replacement-oracle.py`는 추적 비암호화 HWPX 44개의 생성 ZIP을 독립 decoder로 비교합니다. 전체 native test에도 집중 검사가 포함되며 HWPX 문서 편집·조판 증명은 아닙니다.

[HWPX 공개 텍스트 이벤트](hwpx-text-api.md)는 `zig build hwpx-text-audit -Doptimize=ReleaseSafe --summary all`로 제품 WASM과 추적 픽스처/전송·읽기 전용 Canvas·Worker 반례를 검사합니다. Debug·ReleaseFast도 같은 단계로 실행하며 기본 audit에 포함됩니다. native 모든 할당 실패는 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX public text transport'`와 기본 `zig build test`가 검사합니다.

Root 문단 간 하이퍼링크의 공개 open/apply/save/reopen 할당 실패는 `zig test src/root.zig -O ReleaseSafe --test-filter 'public crossing hyperlink session'`로 검사하며 기본 `zig build test`에도 포함됩니다. 실제 교차 필드의 독립 Section·다른 스트림·재열기 및 손상 반례는 제품 빌드 후 `node --test tests/hwp5/control-editor.test.mjs`와 `hwp5-editor-audit`가 검사합니다. 책임과 현재 제한은 [필드 수정 속성](hwp5-field-attribute-edit.md)을 따릅니다.

[계산식 command](hwp5-formula-command.md)의 envelope·실제 chart 13개 필드 검사는 `zig test src/root.zig -O ReleaseSafe --test-filter 'formula command'`로 실행합니다. 실제 셀에서의 SUM/AVG 계산·현재 모델 값 읽기·출력 준비의 할당 실패와 chart의 공개 숫자 편집/CFB 재열기도 포함합니다. 범위·숫자·출력 형식 및 공개 세션 할당 실패의 개별 반례까지 실행하려면 필터를 `'formula'`로 지정합니다. 기본 root 테스트에도 포함되지만 모든 수식 문법·조판·UI 지원의 완료 증명은 아닙니다.

공개 수식 거래의 모든 open/apply/save/reopen 할당 실패는 `zig test src/root.zig -O ReleaseSafe --test-filter 'public formula session'`로 검사하며 기본 `zig build test`에도 포함됩니다. 실제 chart 숫자 셀의 공개 JS/WASM 편집·독립 Section/스트림 대조·복원/재열기 및 Worker 의존 표시 갱신은 제품 빌드 후 `node --test tests/hwp5/control-editor.test.mjs tests/hwp5/reader-worker.test.mjs` 또는 `hwp5-editor-audit`로 검사합니다. 실제 브라우저 검증과 수식 문법 전체 지원은 별도입니다.

[필드 수정 속성](hwp5-field-attribute-edit.md)의 실제 파일/독립 Section 대조는 제품 WASM 빌드 후 `node --test tests/hwp5/control-editor.test.mjs` 및 `hwp5-editor-audit`에 포함합니다. native 실패 경로는 `zig test -O ReleaseSafe --dep hwpjs -Mroot=tests/hwp5/style-preservation/text.test.zig -Mhwpjs=src/root.zig --test-filter 'retained anchor linkage'`와 기본 `zig build test`로 검사합니다.

[Canvas 제어 위치 연결](canvas-control-offsets.md)은 제품 WASM 빌드 후 `node --test tests/hwp5/canvas-preview.test.mjs tests/hwp5/canvas-editor.test.mjs tests/hwp5/reader-worker.test.mjs`로 표시 경계·실제 native 위치·대기 입력·거부 복원을 검사합니다. 실제 브라우저 검증은 별도입니다.

[제어 포함 편집 경계](hwp5-control-text-edit.md)는 `zig test src/root.zig --test-filter 'control splice boundaries'`와 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 검사합니다. 기본 root 테스트에도 포함되며 이 경계 검사만으로 공개 편집·저장 검증을 대신하지 않습니다.

기존 탭 보존 splice와 Worker 재투영은 제품 WASM 빌드 후 `node --test tests/hwp5/control-editor.test.mjs tests/hwp5/reader-worker.test.mjs`로 검사하며 `hwp5-editor-audit`에도 포함합니다. 실제 브라우저 직접 입력 검증은 아닙니다.

[기존 빈 문단 편집](hwp5-empty-text-edit.md)은 제품 WASM 빌드 후 `node --test tests/hwp5/empty-editor.test.mjs`로 검사하며 `hwp5-editor-audit`에도 포함합니다. 표시 후보 반례는 `canvas-preview.test.mjs`, native 할당 실패 원자성은 기본 `zig build test`가 검사합니다.

[추적 픽스쳐 편집 전수 검사](fixture-editor-coverage.md)는 제품 WASM 빌드 후 `node tools/hwp5-edit-corpus-audit.mjs`로 실행합니다. 모든 추적 HWP 문단에 실제 삽입을 시도하고 저장 텍스트·비본문 스트림을 독립 CFB.js로 대조합니다. 정상 종료는 지원 거부가 없다는 뜻이 아닙니다. HWPX 공개 연결 미구현도 별도 집계합니다. 검사 도구의 반례는 `node --test tests/hwp5/edit-corpus.test.mjs` 및 `hwp5-editor-audit`에 포함합니다.

[중첩 목록 문단 편집](hwp5-nested-text-edit.md)은 `node --test tests/hwp5/nested-editor.test.mjs` 및 `hwp5-editor-audit`에서 실제 software 제목/중간/끝 셀의 전체 레코드 대조와 소유 관계 반례를 검사합니다. `text-splice-audit`는 별도 native 중첩 삽입/서식을, 기본 `zig build test`는 중첩 소유 파싱의 할당 실패 원자성을 포함합니다. 실행 전 제품 WASM을 해당 모드로 빌드합니다.

[Canvas 직접 입력](canvas-direct-input.md)의 순수 좌표/입력 차이 검사는 `node --test tests/hwp5/canvas-edit.test.mjs`, 모사 DOM와 제품 WASM 연결 검사는 빌드 후 `node --test tests/hwp5/canvas-editor.test.mjs`입니다. 기존 `hwp5-editor-audit`와 기본 audit에도 포함합니다. 실제 브라우저/OS 한글 입력기는 이 테스트로 검증됐다고 보지 않습니다.

[실험용 HWP5 편집 JS/WASM API](hwp5-editor-api.md)는 `zig build hwp5-editor-audit -Doptimize=ReleaseSafe --summary all`로 제품 WASM·Node 경계/UI 상태 집중 검사를 실행합니다. `Debug`·`ReleaseFast`도 같은 단계로 검사할 수 있으며 기본 `zig build audit`에도 포함합니다. 기존 native 실파일/Rust 대조는 별도 `text-splice-audit`가 소유합니다. 웹에서는 Canvas의 일반 텍스트를 클릭하거나 접힌 고급 폼의 ‘편집 실험 켜기’를 누릅니다. 일반 편집·서식 렌더링·웹 다운로드 지원은 아닙니다.

[Canvas 텍스트 미리보기](canvas-text-preview.md)는 `zig build -Doptimize=ReleaseSafe` 후 `node tools/serve-preview.mjs`로 실행합니다. 주소는 `http://127.0.0.1:8080/web/preview/index.html`이며 포트 인수를 지정할 수 있습니다. `node --test tests/hwp5/canvas-preview.test.mjs`는 표시 projection/실험용 줄 흐름을 검사하고 정규 `zig build audit`의 미리보기 Node 검사에도 포함됩니다. 브라우저 통합 검증은 별도이며, 텍스트 전용 표시 성공을 문서 조판 성공으로 보지 않습니다.

[기존 글자 모양 적용](hwp5-character-format-edit.md) 검증도 아래 `text-splice-audit` 단계에 포함됩니다. 같은 probe를 사용하며 서식 전용 독립 oracle 결과를 별도로 출력합니다. 기본 `zig build test`에도 혼합 명령·서식 할당 실패 집중 검사가 포함됩니다.

[단순 문단 텍스트 편집 실험](hwp5-plain-text-edit-experiment.md)은 `zig build text-splice-audit --summary all` 및 `-Doptimize=ReleaseSafe`·`-Doptimize=ReleaseFast`로 실행합니다. 집중 Zig 검사와 실제 HWP 5개·파생 반례의 CFB.js/Node/Rust 대조를 포함하며 임시 출력 경로를 표시합니다. 집중 Zig 검사는 기본 `zig build test`에도 포함됩니다. 실파일 audit은 기존 native Rust oracle이 필요해 기본 test/audit 밖에 있습니다. 조판·미리보기 갱신·한컴 GUI·HWPX 편집 검증은 아닙니다.

[스타일 참조 편집·원본 보존 실험](hwp5-style-preservation-experiment.md)은 `zig build style-preservation-audit --summary all`과 `-Doptimize=ReleaseSafe`·`-Doptimize=ReleaseFast`로 실행합니다. 집중 Zig 검사와 실파일의 CFB.js·Node zlib·Rust `toJson` 대조가 포함되며 출력 HWP의 임시 경로를 표시합니다. Rust oracle은 `legacy/rust/packages/hwpjs/dist/index.js`와 현재 플랫폼의 기존 native binding이 필요합니다. 이 audit은 기본 test/audit 밖에 있으며, 일반 편집·한컴 조판·HWPX 저장 동등성을 검증하지 않습니다.

[HWP5 읽기 전용 문서 모델 첫 연결](hwp5-model-projection.md)은 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWP5 projection'`로 합성·실파일·할당 실패 경계를 검사합니다. 공개 JSON 동등성 검사는 아직 없습니다.

[HWP5 문단 텍스트 미리보기 API](hwp5-text-preview-api.md)는 `zig build -Doptimize=ReleaseSafe` 후 `node tools/hwp5-text-preview.mjs legacy/rust/crates/hwp-core/tests/fixtures/example.hwp`로 직접 확인합니다. `node --test tests/hwp5/text-preview.test.mjs tests/hwp5/preview-record-oracle.test.mjs`는 추적 실파일 48개 중 45개의 독립 레코드·raw DEFLATE 원시 바이트 대조, 합성 zlib DocInfo/Section 호환성, 미리보기 전용 projection·caret 생략·손상 반례와 오라클 자체 반례를 검사합니다. `node tools/hwp5-preview-corpus-audit.mjs`는 선택적 로컬 `reference`·`legacy` corpus를 파일별로 분류하고 허용 문단의 원시 바이트를 Node raw/zlib 디코더로 독립 대조하며, `--files`는 파일별 분류를 출력합니다. 마지막 명령은 기본 audit에 포함되지 않습니다. 명령 출력은 문서 전체 조판 결과가 아닌 문단 토큰 미리보기입니다.

[프로젝트 문서 검증 현황](verification-progress.md)은 `node tools/docs-audit-status.mjs`로 확인합니다. `--list-pending`은 경로별 상태를, `--require-complete`는 모든 추적 프로젝트 Markdown이 현재 해시로 검증됐고 누락·미추적 문서가 없는지 검사합니다. `node tools/docs-inline-links.mjs`는 일반 인라인 로컬 링크의 대상 파일만 검사합니다. `node --test tests/docs/*.test.mjs`로 두 도구의 반례를 검증합니다. 이 명령들은 문서 내용의 정확성을 자동 증명하지 않으며 최종 적대적 검증을 대신하지 않습니다.

[HWP5 각주·미주 원문 표식 위치](hwp5-note-source-sites.md)는 `zig build hwp5-audit -Doptimize=ReleaseSafe`에서 추적 `footnote-endnote.hwp`의 4건과 합성 ID·코드·누락·위치 이동 반례를 검증합니다. 로컬 `reference/rhwp/samples`가 있으면 같은 audit의 `noteControlReferenceResults`에서 추가 9·6·2건의 위치도 대조하고, 없으면 `skipped`로 구분합니다. `control_links`의 제품 코드는 재사용하며 새 파서 모드는 없습니다.

[HWP5 각주·미주 안 자동 번호 관계](hwp5-note-number-links.md)는 `zig test src/root.zig --test-filter 'HWP5 note number links'` 및 `-O ReleaseSafe`·`-O ReleaseFast`로 소유 범위와 진단 반례를 검사합니다. `node --test tests/hwp5/note-number-links.test.mjs`는 oracle 자체의 변이 반례를 검사합니다. `zig build audit -Doptimize=ReleaseSafe`의 HWP5 테스트용 WASM 문서 보고서는 `tests/hwp5/note-number-links.mjs`의 원시 Section 레코드 독립 대조를 포함합니다. 해당 실파일 검사는 로컬 HWP corpus에 한정됩니다.

[HWPX 각주·미주 원문 위치](hwpx-note-sites.md)는 `zig test src/root.zig --test-filter 'HWPX note site'`와 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 직접 `ctrl`·바깥 주석·foreign namespace·UTF-16 원본 오프셋을 검사합니다. `zig test src/hwpx_note_bodies_survey.zig -O ReleaseFast --test-filter 'HWPX note bodies real files known integration'`은 단독/known 반환값을, `python3 tools/hwpx-note-sites-diff.py`는 허용 파일별 조상 인덱스를 독립 ZIP/XML과 대조합니다. Oracle 반례는 `python3 tools/hwpx-note-sites-diff.py --self-test` 및 `python3 -O tools/hwpx-note-sites-diff.py --self-test`로 확인합니다. 실파일 검사는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[HWPX 각주·미주 텍스트 소유](hwpx-note-text.md)는 `zig test src/root.zig --test-filter 'HWPX note text'`와 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 namespace·중첩 소유·XML 정규화·빈 요소·한도·OOM·UTF-16을 검증합니다. `zig test src/hwpx_note_text_survey.zig -O ReleaseFast --test-filter 'HWPX note text real files standalone and known integration'`은 실파일의 단독/known 결과를, `python3 tools/hwpx-note-text-diff.py`는 허용 파일별 독립 ZIP/XML 해시와 거부/암호화 분류를 대조합니다. Oracle 변이는 `python3 tools/hwpx-note-text-diff.py --self-test`와 `python3 -O tools/hwpx-note-text-diff.py --self-test`로 확인합니다. 실파일 검사는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[전체 `zig build test`의 stderr 표기 해석](zig-test-stderr.md)은 성공 요약과 함께 나타나는 `failed command:` 러너 문구의 재현 및 판정 근거를 소유합니다. 이 문구만으로 실패라고 판단하거나 종료 코드·테스트 실패 수를 무시하지 않습니다.

[HWPX 각주·미주 본문](hwpx-note-bodies.md)은 `zig test src/root.zig --test-filter 'HWPX note bodies'`와 `-O ReleaseSafe`·`-O ReleaseFast`로 원값·직접 목록/문단·한도·OOM·소유권을 검증합니다. `zig test src/hwpx_note_bodies_survey.zig -O ReleaseFast --test-filter 'HWPX note bodies real files known integration'`은 실파일의 단독/known 경로를, `python3 tools/hwpx-note-bodies-diff.py`는 전체 허용 파일별 독립 ZIP/XML 해시와 분류를 대조합니다. `python3 tools/hwpx-note-bodies-diff.py --self-test`와 `python3 -O tools/hwpx-note-bodies-diff.py --self-test`는 oracle 변이 검출을 확인합니다. 실파일 명령에는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[HWPX 각주·미주 안 번호 관계](hwpx-note-number-links.md)는 `zig test src/root.zig --test-filter 'HWPX note number links'`와 `-O ReleaseSafe`·`-O ReleaseFast`로 부모 관계·진단·한도·OOM을 확인합니다. `zig test src/hwpx_note_number_links_survey.zig -O ReleaseFast --test-filter 'HWPX note number links real files standalone and known integration'`은 단독/known 경로를, `python3 tools/hwpx-note-number-links-diff.py`는 허용 파일별 독립 ZIP/XML 해시를 검사합니다. Oracle 변이는 `python3 tools/hwpx-note-number-links-diff.py --self-test`와 `python3 -O tools/hwpx-note-number-links-diff.py --self-test`로 확인합니다. 실파일 검사는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[HWPX 번호 컨트롤 원값](hwpx-number-controls.md)은 `zig test src/root.zig --test-filter 'HWPX number controls'`와 `-O ReleaseSafe`·`-O ReleaseFast`로 속성·자식 순서·한도·OOM·수명·known 연결을 검증합니다. `zig test src/hwpx_number_controls_survey.zig -O ReleaseFast --test-filter 'HWPX number controls real files known integration'`은 실파일의 단독/known 경로를, `python3 tools/hwpx-number-controls-diff.py`는 전체 후보 분류와 허용 파일별 독립 ZIP/XML 해시를 대조합니다. `python3 tools/hwpx-number-controls-diff.py --self-test`와 `python3 -O tools/hwpx-number-controls-diff.py --self-test`는 oracle 변이 검출을 확인합니다. 실파일 명령은 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[HWPX 단 설정 원값](hwpx-column-definitions.md)은 `zig test src/root.zig --test-filter 'HWPX column definitions'`와 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 원값·편차·숫자/Boolean·한도·OOM·수명을 검증합니다. `zig test src/hwpx_column_definitions_survey.zig -O ReleaseFast --test-filter 'HWPX column definitions real files known integration'`은 두 편차 실파일의 standalone/known 일치를 확인하고, `python3 tools/hwpx-column-definitions-diff.py`는 전체 후보 분류와 허용 파일별 독립 ZIP/XML 해시를 대조합니다. `python3 tools/hwpx-column-definitions-diff.py --self-test`와 `python3 -O tools/hwpx-column-definitions-diff.py --self-test`는 오라클 변이를 검사합니다. 실파일 명령에는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[HWPX 필드 시작·끝 마커](hwpx-field-markers.md)는 `zig test src/root.zig --test-filter 'HWPX field markers'`와 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 어휘·명시적 ID 연결·한도·OOM·패키지 수명을 확인합니다. `zig test src/hwpx_field_markers_survey.zig -O ReleaseFast --test-filter 'HWPX field markers real files known integration'`은 끝이 없는 시작이 관측된 실제 3개 파일의 단독/known 결과를, `python3 tools/hwpx-field-markers-diff.py`는 두 corpus의 파일별 독립 ZIP/XML 해시를 대조합니다. `python3 tools/hwpx-field-markers-diff.py --self-test` 및 `python3 -O tools/hwpx-field-markers-diff.py --self-test`는 오라클 변이 검출을 확인합니다. 실파일 명령에는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

[HWPX indexmark·dutmal 문자열 컨트롤](hwpx-inline-string-controls.md)은 `zig test src/root.zig --test-filter 'HWPX inline string controls'` 및 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 어휘·문자 정규화·수명·한도·OOM을 확인합니다. 실제 양성 2개는 `zig test src/hwpx_inline_string_controls_survey.zig -O ReleaseFast --test-filter 'HWPX inline string controls two real files known integration'`으로 known 연결을 확인하고, 전체 484개 후보 분류와 허용 476개 파일별 결과는 `python3 tools/hwpx-inline-string-controls-diff.py`로 독립 ZIP/XML에 대조합니다. `python3 tools/hwpx-inline-string-controls-diff.py --self-test`와 `python3 -O tools/hwpx-inline-string-controls-diff.py --self-test`는 oracle 변이 검출을 확인합니다. 실파일 명령은 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함되지 않습니다.

[HWPX section metaTag 직접 텍스트](hwpx-meta-tags.md)는 `zig test src/root.zig --test-filter 'HWPX meta tags'`와 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 합성·소유권·예산·OOM을 확인합니다. 실제 양성 4건의 known 연결은 `zig test src/hwpx_meta_tags_survey.zig -O ReleaseFast --test-filter 'HWPX meta tags four real files known integration'`으로, 전체 후보 분류와 허용 파일 해시는 `python3 tools/hwpx-meta-tags-diff.py`로 독립 ZIP/XML과 대조합니다. `python3 tools/hwpx-meta-tags-diff.py --self-test` 및 `python3 -O tools/hwpx-meta-tags-diff.py --self-test`는 oracle 변이 검출을 확인합니다. 실파일 명령은 로컬 `reference/rhwp`가 필요하고 기본 audit 밖입니다.

[HWPX section 파라미터 목록](hwpx-parameter-lists.md)은 `zig test src/root.zig --test-filter 'HWPX parameter lists'` 및 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 재귀·값·한도·OOM·패키지 수명을 확인합니다. 실파일 양성은 `zig test src/hwpx_parameter_lists_survey.zig -O ReleaseFast --test-filter 'HWPX parameter lists three real files independent XML digest'`, `zig test src/hwpx_parameter_lists_survey.zig -O ReleaseFast --test-filter 'HWPX parameter lists three real files known integration'`, `zig test src/hwpx_parameter_lists_survey.zig -O ReleaseFast --test-filter 'HWPX parameter lists real fieldBegin known integration'`, `python3 tools/hwpx-parameter-lists-diff.py`로 파일별 독립 XML 해시와 known 연결을 확인합니다. 전체 484개 후보 분류와 허용 476개의 파일별 해시는 `python3 tools/hwpx-parameter-lists-diff.py --all`로 대조합니다. `python3 tools/hwpx-parameter-lists-diff.py --self-test`와 `python3 -O tools/hwpx-parameter-lists-diff.py --self-test`는 oracle 변이 검출을 확인합니다. 실파일 명령은 로컬 `reference/rhwp`가 필요하고 기본 audit 밖입니다.

[HWPX 수식 shapeComment 직접 텍스트](hwpx-equation-comments.md)는 `zig test src/root.zig --test-filter 'HWPX equation comment'` 및 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 합성·예산·OOM을 확인합니다. `zig test src/hwpx_equation_corpus.zig --test-filter 'HWPX equation comment independent XML digest fixture'`는 독립 XML 고정 해시를, `python3 tools/hwpx-equation-corpus-diff.py --self-test`와 인자 없는 실행은 변이 반례 및 실파일 파일별 대조를 확인합니다. 실파일 대조는 로컬 두 corpus가 필요하고 기본 audit 밖입니다.

[HWPX 수식 caption 목록](hwpx-equation-captions.md)은 `zig test src/root.zig --test-filter 'HWPX equation caption'`으로 필드·원문·한도·OOM을, 같은 필터의 `-O ReleaseSafe`·`-O ReleaseFast`로 최적화 모드를 검사합니다. 공통 순회로 바뀐 표의 합성 회귀는 아래 `HWPX table shape` 필터, 실파일 회귀는 `HWPX known document inspections shard N` 8개 별도 프로세스로 검사합니다. 독립 Python XML과 고정한 수식 caption 예제 해시는 `zig test src/hwpx_equation_corpus.zig --test-filter 'HWPX equation caption independent XML digest fixture'`로 확인합니다. Python equation oracle의 `--self-test`는 caption 변이도 포함하며 실파일 파일별 해시는 현재 수식 caption 0개를 확인합니다.

[HWPX 수식 도형 자식·필드](hwpx-equation-shapes.md)도 아래 `HWPX equation` 필터에 포함됩니다. 단독으로는 `zig test src/root.zig --test-filter 'HWPX equation shape'`를 사용합니다. `-O ReleaseSafe`와 `-O ReleaseFast`를 추가해 최적화 모드별 같은 반례를 검사합니다. 공유 어휘·자식 선택의 표 회귀는 `zig test src/root.zig --test-filter 'HWPX table shape'`, 실파일 문서 연결은 아래 known survey의 8개 shard로 검사합니다. 독립 equation corpus 해시는 공통 도형 자식의 종류·위치·필드까지 포함하며, `python3 -O tools/hwpx-equation-corpus-diff.py --self-test`로 Python 최적화 모드에서도 반례 검사가 유지되는지 확인합니다.

[HWPX 본문 수식 원문·script](hwpx-equations.md)는 `zig test src/root.zig --test-filter 'HWPX equation'`으로 합성·패키지·소유권·할당 실패를 검사합니다. 로컬 두 HWPX corpus가 있으면 `python3 tools/hwpx-equation-corpus-diff.py --self-test`와 `python3 tools/hwpx-equation-corpus-diff.py`로 독립 ZIP/ElementTree 파일별 결과를 대조합니다. 마지막 명령은 ReleaseFast Zig 제품 조사를 내부에서 실행하며 기본 audit에는 포함되지 않습니다.

[HWPX 마스터페이지 텍스트 소유 스냅샷](hwpx-master-text-snapshot.md)은 `zig test src/root.zig --test-filter 'HWPX master text snapshot'`으로 합성 범위·한도·선택 분기·전 할당 실패를 확인합니다. 로컬 `reference/rhwp`가 있을 때만 `zig test src/hwpx_master_text_snapshot_survey.zig -O ReleaseFast --test-filter 'HWPX master text snapshot real file'`로 실제 한 파일의 스트리밍/소유 집계와 이벤트 내부 일관성을 검사합니다.

같은 스냅샷의 파일별 corpus 대조는 `python3 tools/hwpx-master-text-snapshot-corpus-diff.py --self-test`와 `python3 -O tools/hwpx-master-text-snapshot-corpus-diff.py --self-test`로 검증기 반례를 확인한 뒤, `python3 tools/hwpx-master-text-snapshot-corpus-diff.py`, `python3 tools/hwpx-master-text-snapshot-corpus-diff.py --selected-default`, `python3 tools/hwpx-master-text-snapshot-corpus-diff.py --selected-chart`로 각각 실행합니다. 스크립트가 ReleaseFast Zig 조사를 실행하며 두 로컬 corpus가 필요합니다. 기본 audit에는 포함되지 않습니다.

[HWPX section 텍스트 소유 스냅샷](hwpx-section-text-snapshot.md)은 `zig test src/root.zig --test-filter 'HWPX section text snapshot'`으로 합성·한도·할당 실패를, `zig test src/hwpx_section_text_snapshot_survey.zig -O ReleaseFast --test-filter 'HWPX section text snapshot known'`으로 실파일 보고서를, `python3 tools/hwpx-section-text-snapshot-diff.py`로 독립 XML 본문 바이트를 검사합니다. 실파일 두 명령은 로컬 `reference/rhwp`가 필요하고 기본 audit 밖입니다.

같은 스냅샷의 파일별 corpus 대조는 `python3 tools/hwpx-text-snapshot-corpus-diff.py --self-test`와 `python3 -O tools/hwpx-text-snapshot-corpus-diff.py --self-test`로 검증기 반례를 먼저 실행하고, `python3 tools/hwpx-text-snapshot-corpus-diff.py`로 실제 484개 후보를 독립 ZIP/XML 결과와 비교합니다. 마지막 명령이 내부에서 ReleaseFast Zig corpus 조사를 실행하며 두 로컬 corpus가 필요합니다. Git의 기본 audit에는 포함되지 않습니다.

같은 corpus의 조건부 분기 결과는 `python3 tools/hwpx-text-snapshot-corpus-diff.py --selected-default`와 `python3 tools/hwpx-text-snapshot-corpus-diff.py --selected-chart`로 각각 검증합니다. 지원 capability가 없는 기본 분기와 명시적 차트 namespace case를 분리하며, 둘 다 기본 audit 밖의 로컬 corpus 검사입니다.

[PNG RGBA 픽셀 조립](png-rgba.md)은 `zig test src/root.zig --test-filter 'PNG RGBA'`로 색 타입·저비트/16비트·투명도·Adam7·한도·OOM·위조 레이아웃을 검사합니다. 독립 실파일 대조 `python3 tools/png-rgba-corpus-diff.py`는 로컬 `reference/rhwp`, Pillow 11.3.0, BSD `olefile` 0.47이 필요합니다. 이 선택 대조는 기본 audit에 포함되지 않습니다.

[HWP5 BinData PNG RGBA](hwp5-bin-data-png-rgba.md)와 [HWPX PNG RGBA](hwpx-png-rgba.md)는 `zig test src/root.zig --test-filter 'PNG RGBA'`로 합성 컨테이너·예산·오류·OOM을 검사합니다. 실제 HWP/HWPX 제품 보고서는 `zig test src/png_rgba_product_survey.zig -O ReleaseFast --test-filter 'PNG RGBA known'`, 각 이미지의 독립 픽셀 바이트는 `python3 tools/png-rgba-product-diff.py`로 대조합니다. 선택 실파일 검사에는 로컬 `reference/rhwp`, Pillow 11.3.0, `olefile` 0.47이 필요하며 기본 audit에는 포함되지 않습니다.

[HWPX JPEG 선택 픽셀 검사](hwpx-jpeg-pixels.md)는 `zig test src/root.zig --test-filter 'HWPX manifest JPEG'`, `--test-filter 'HWP JPEG'`, `--test-filter 'HWPX known inspections opt into JPEG'`로 공유 코어·ZIP 연결·실파일 단일 사례를 검사합니다. `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--jpeg-readiness`는 독립 후보·Pillow 해제 분포를 조사합니다. `python3 tools/hwpx-jpeg-pixel-diff.py`는 추적 fixture의 실제 RGB 바이트와 Zig 복호화 계수 기반 독립 IDCT 결과를 Pillow와 대조합니다(Pillow 필요, 기본 audit 밖). `zig test src/hwpx_jpeg_pixel_survey.zig -O ReleaseFast --test-filter 'HWPX JPEG pixel shard N'`의 N=0..7은 로컬 두 corpus가 필요한 선택 실파일 검사이며 기본 audit에 포함되지 않습니다.

[JPEG 관측 성분 ID 호환 정책](jpeg-component-id-compatibility.md)은 `zig test src/root.zig --test-filter 'HWPX manifest JPEG zero-based component IDs'`와 `--test-filter 'JPEG JFIF layout reports explicitly selected'`로 합성·한도·OOM을 검사합니다. 선택 실파일은 `zig test src/hwpx_jpeg_pixel_survey.zig -O ReleaseFast --test-filter 'HWPX JPEG observed zero-based'`로 세 문서·예산·거부 반례를 확인합니다. 이 검사는 로컬 `reference/rhwp`가 필요하며 기본 audit 밖입니다.

같은 선택 실파일의 실제 RGB는 `python3 tools/hwpx-jpeg-observed-pixel-diff.py --case zero-based`로 Pillow 11.3.0과 대조합니다. 로컬 `reference/rhwp`와 Pillow가 필요하며 픽셀 내용 동치가 아닌 차이 분포를 검사합니다.

[Exif 선두 Adobe 색 선언 JPEG](jpeg-exif-adobe-rgb.md)은 `zig test src/root.zig --test-filter 'HWPX manifest Exif Adobe JPEG'`로 ZIP 연결·색 선언 오류·한도·OOM·progressive를, `zig test src/hwpx_jpeg_pixel_survey.zig -O ReleaseFast --test-filter 'HWPX JPEG Exif Adobe'`로 두 corpus 34개와 실제 `(0,1,2)` 옵션 교차를 검사합니다. 실파일 픽셀 차이는 `python3 tools/hwpx-jpeg-observed-pixel-diff.py --case exif-adobe`로 확인합니다. 두 선택 검사에는 로컬 `reference/rhwp`가 필요하고 Python 검사에는 Pillow 11.3.0이 필요합니다. 기본 audit에는 포함되지 않습니다.

[Adobe 4성분 JPEG](jpeg-adobe-four-component.md)는 `zig test src/root.zig --test-filter 'JPEG Adobe complemented CMYK'`, `--test-filter 'JPEG RGB raster uses all four Adobe'`, `--test-filter 'HWPX manifest Exif Adobe four-component'`로 색 산술·4평면·HWPX 연결을 검사합니다. 위 Exif corpus 검사와 `python3 tools/hwpx-jpeg-observed-pixel-diff.py --case exif-ycck`는 실제 YCCK 2건의 해제 개수·길이 및 한 건의 Pillow 11.3.0 RGB 차이를 독립 대조합니다. 선택 실파일 검사에는 로컬 `reference/rhwp`가 필요합니다.

[Exif IFD0 방향 원값](jpeg-exif-orientation.md)은 `zig test src/root.zig --test-filter 'JPEG Exif TIFF'`와 `--test-filter 'HWPX manifest Exif TIFF orientation'`으로 양 endian·오류·한도·OOM·픽셀과 독립된 보고를 검사합니다. `python3 tools/hwpx-fill-brush-image-oracle.py --exif-orientation`은 Pillow의 독립 분포를, 위 Exif Adobe 선택 실파일 조사는 Zig의 34개 **제품 보고서** IFD0 분포와 픽셀 실패 3건의 메타데이터 보존을 비교합니다. 두 corpus와 Pillow 11.3.0이 필요한 실파일 검사는 기본 audit 밖입니다.

[HWPX BMP 픽셀 검사](hwpx-bmp-pixels.md)는 `zig test src/root.zig --test-filter 'HWPX manifest BMP'`와 그림·브러시의 기존 `HWPX picture image payloads`·`HWPX fill brush image payloads` 필터로 공유 경로를 검사합니다. 독립 Pillow 11.3.0 조사 `python3 tools/hwpx-fill-brush-image-oracle.py --bmp-pixels`와 `zig test src/hwpx_bmp_pixel_survey.zig -O ReleaseFast --test-filter 'HWPX BMP pixel shard N'`의 N=0..7은 로컬 `reference/rhwp`가 필요한 선택 실파일 검사이며 기본 audit에 포함되지 않습니다.

[CFB 관측 편차 복사본 검사](hwpx-ole-observed-repairs.md)는 `zig test src/root.zig --test-filter 'CFB observed repairs'` 및 `--test-filter 'HWPX OLE payloads'`로 strict 분리·한도·OOM을 확인합니다. HWP5 후속 실파일 7개의 활성 스트림 바이트 대조는 `zig test src/cfb_observed_repair_survey.zig -O ReleaseSafe`로 실행합니다. 독립 `python3 tools/hwpx-ole-payload-oracle.py --self-test` 및 로컬 BSD olefile 0.47이 있는 경우 `--compat`를 실행합니다. 8개 실파일 shard는 `zig test src/hwpx_ole_repair_survey.zig -O ReleaseFast --test-filter 'HWPX OLE normalized shard N'`을 N=0..7 각각 실행합니다. 실파일 검사는 기본 audit에 포함되지 않습니다.

[HWPX OLE 패키지 사본 검사](hwpx-ole-payloads.md)는 `zig test src/root.zig --test-filter 'HWPX OLE payloads'`와 `--test-filter 'HWPX known inspections retain packaged OLE'`로 경계·소유권·실파일 연결을 검사합니다. 독립 봉투 조사 `python3 tools/hwpx-ole-payload-oracle.py --self-test` 및 인자 없는 전체 조사 결과는 아래 HWPX known shard 0~7과 대조합니다. 실파일 shard는 로컬 `reference/rhwp`가 필요하고 기본 audit에는 포함되지 않습니다.

[OPF 이미지 후보 전수 검사](hwpx-manifest-image-payloads.md)는 `zig test src/root.zig --test-filter 'HWPX manifest image payloads'`와 `--test-filter 'HWPX known inspections include unreferenced'`로 합성·소유권·한도를 확인합니다. 독립 corpus 조사 `python3 tools/hwpx-fill-brush-image-oracle.py --self-test` 및 `--manifest-images` 결과는 아래 HWPX known shard 0~7과 대조합니다. 선택 shard는 로컬 `reference/rhwp`가 필요하고 기본 audit에는 포함되지 않습니다.


[HWPX SVG 구조](hwpx-svg-image-payloads.md)는 `zig test src/root.zig --test-filter 'SVG structure'`, `zig test src/root.zig --test-filter 'HWPX picture image payloads'`, `zig test src/root.zig --test-filter 'HWPX fill brush image payloads'`로 합성·공통 연결을, `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--picture-payloads`로 독립 분류를 검사합니다. 로컬 `reference/rhwp`가 있는 경우 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`을 N=0..7 각각 실행해 전체 corpus를 대조합니다. 실파일 8개 shard는 기본 audit에 포함되지 않습니다.

[HWP BMP 32비트 상위 바이트](hwp5-bmp-high-byte.md)는 `zig test src/root.zig --test-filter 'BMP'`로 구조·컨테이너 합성 계약을, `zig test src/hwp5_bmp_seven_known_survey.zig -O ReleaseFast --test-filter 'HWP known seven BMP'`와 `node tests/hwp5/bmp-seven-survey.mjs`로 실제 HWP 7건의 독립 DocInfo·압축·픽셀/상위 바이트 대조를 확인합니다. 실파일 두 명령은 로컬 `reference/rhwp`가 필요하며 기본 audit에 포함되지 않습니다.

[HWP5 PNG 선언·JPEG 바이트 불일치](hwp5-png-declared-jpeg.md)는 `zig test src/root.zig --test-filter 'PNG-declared JPEG'`로 합성·CFB 경로·한도·OOM을, `node tests/hwp5/png-declared-jpeg-survey.mjs`로 독립 DocInfo·JPEG 프레임 분포를 검사합니다. 실파일 전체 검사 `zig test src/hwp5_png_jpeg_mismatch_known_survey.zig -O ReleaseFast --test-filter 'HWP PNG-declared JPEG known'`과 Node 조사는 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함되지 않습니다.

[HWP5 PNG IEND 뒤 0 패딩](hwp5-png-post-iend.md)은 `zig test src/root.zig --test-filter 'PNG post-IEND'`와 `--test-filter 'HWP container PNG post-IEND'`, HWPX 기본 strict의 `--test-filter 'HWPX picture image payloads keep post-IEND'`, 독립 `node --test tests/hwp5/png-post-iend-evidence.test.mjs`로 검증합니다. 선택 실파일은 `zig test src/hwp5_png_post_iend_known_survey.zig -O ReleaseFast --test-filter 'HWP PNG known zero tail'`, 선언 PNG 전수 조사는 `node tests/hwp5/png-post-iend-survey.mjs`로 재현합니다. 마지막 두 명령은 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함되지 않습니다.

[HWP5 BinData WMF](hwp5-bin-data-wmf.md)는 `zig test src/root.zig --test-filter 'HWP WMF'`, `--test-filter 'HWP container WMF'`로 선택·컨테이너 연결을, `node --test tests/hwp5/wmf-framing-evidence.test.mjs`로 독립 framing 반례를 확인합니다. 실파일은 `zig test src/hwp5_wmf_known_survey.zig -O ReleaseFast --test-filter 'HWP WMF known'`, 독립 DocInfo·압축·WMF framing 대조는 `node tests/hwp5/wmf-corpus.mjs`, 선언 WMF 전수 분류는 `node tests/hwp5/wmf-corpus-survey.mjs`입니다. 세 실파일 명령은 로컬 `reference/rhwp`가 필요하고 기본 audit에 포함되지 않습니다.

공통 WMF 헤더·객체·상태·도형·텍스트의 집중 회귀는 `zig test src/root.zig -O Debug --test-filter WMF`로 실행하고, 같은 명령의 `-O ReleaseSafe`·`-O ReleaseFast`도 실행합니다. 고정 HWP/OLE `CONTENTS` 실파일과 공개 API 합성 계약은 `zig build wmf-contents-audit -Doptimize=ReleaseSafe --summary all`로 검증하며, 다른 모드는 `-Doptimize` 값만 바꿉니다. 이 audit은 hash-pinned 로컬 `reference/rhwp` 표본이 없으면 실패하고 명세 밖 비준수 escape를 EMF로 추정하지 않습니다. 계약과 범위는 [WMF 헤더](wmf-header.md) 및 연결된 주제 문서가 소유합니다.

[WMF 내장 EMF](wmf-enhanced-metafile.md)는 `zig test src/root.zig -O Debug --test-filter 'WMF enhanced'`와 `--test-filter 'WMF embedded'`를 각각 실행하고 `-O ReleaseSafe`·`-O ReleaseFast`에서도 반복합니다. [EMF comment envelope](emf-comment-envelope.md)는 같은 세 모드에서 `zig test src/root.zig -O Debug --test-filter COMMENT`를 실행합니다. 실제 HWP의 EMF signature 후보 조사는 `zig build emf-corpus-audit -Doptimize=ReleaseFast --summary all`로 재현하며 로컬 `reference/rhwp` corpus가 필요합니다. 다중 조각 EMF의 실제 호환성이나 EMF 렌더링을 입증하는 명령은 아닙니다.

[HWP5 BinData PCX](hwp5-bin-data-pcx.md)는 `zig test src/root.zig --test-filter 'HWP PCX'`, `--test-filter 'HWP container PCX'`로 단위·컨테이너 연결을 검사합니다. 선택 실파일은 `zig test src/hwp5_pcx_known_survey.zig -O ReleaseFast --test-filter 'HWP PCX known'`, 독립 해시·압축 정책 조사는 `node tests/hwp5/pcx-corpus.mjs`로 재현합니다. 두 실파일 명령에는 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함하지 않습니다.

[HWP5 BinData 인코딩 정책](hwp5-bin-data-encoding.md)은 `zig test src/root.zig -O ReleaseSafe --test-filter 'BinData encode'`로 여섯 압축 조합·오류·할당 실패를 검사합니다. `-O Debug`·`-O ReleaseFast`도 같은 필터로 실행할 수 있습니다. 상위 CFB 다중 교체 연결은 `zig test src/root.zig -O ReleaseSafe --test-filter 'outer HWP BinData batch resolves'`로 별도 확인합니다. 이 집중 명령은 실파일 저장 동치나 과거 변이 시험을 재현하지 않습니다.

[HWP5 바깥 BinData 교체](hwp5-bin-data-replacement.md)는 `zig test src/root.zig -O ReleaseSafe --test-filter 'outer HWP BinData'`, `--test-filter 'DocInfo-bound replacement'`, `--test-filter 'outer HWP replacement resolves'`를 각각 실행해 압축/CFB·순번/리소스·batch 오류를 검사합니다. 같은 세 필터를 `-O Debug`·`-O ReleaseFast`로도 실행할 수 있습니다. `zig build chart-ownership-audit -Doptimize=ReleaseSafe --summary all`은 실제 추출 `Contents`와 합성 HWP/OLE CFB를 잇는 차트 통합 검사도 포함합니다. 이는 실제 HWP 전체 편집/재열기나 과거 변이 시험을 재현하지 않습니다.

[CFB 원자적 다중 stream 교체](cfb-atomic-stream-replacement.md)는 `zig test src/root.zig -O ReleaseSafe --test-filter 'CFB exact batch replacement'`로 합성 v3/v4의 다중 exact 교체·중복/오류·compact node 매핑을 검사합니다. 같은 필터를 `-O Debug`·`-O ReleaseFast`로도 실행할 수 있습니다. 과거 변이 시험과 실제 HWP 저장 동치의 재현 명령은 아닙니다.

[CFB 읽기·검증·쓰기](cfb-reader.md)의 현재 네이티브·레거시 비교는 `zig build test -Doptimize=ReleaseSafe --summary all` 및 `zig build compare -Doptimize=ReleaseSafe --summary all`로 실행합니다. `node tests/cfb/serve.mjs`는 수동 Chromium 검사용 서버만 시작하며 브라우저 검사를 대신하지 않습니다. 과거 WASM 변이 sweep은 `zig build audit -Doptimize=ReleaseSafe`의 기본 시드 12,000건과 `CFB_MUTATION_SEED=3735928559 node tests/cfb/mutations.mjs`, `CFB_MUTATION_SEED=305419896 node tests/cfb/mutations.mjs`로 다시 실행할 수 있지만, 이 세 명령은 2026-09-27 재검증에서는 실행하지 않았습니다.

[CFB 레거시 호환성·예외](cfb-compatibility.md)는 같은 `zig build compare -Doptimize=ReleaseSafe --summary all`에 포함됩니다. 예외만 재현하려면 `node --test tests/cfb/exceptions.test.mjs`, 과거 비준수 17건의 기본/strict 분리를 재현하려면 `node --test --test-name-pattern 'strict rejects spec violations' tests/cfb/writer.test.mjs`를 실행합니다. 두 직접 Node 명령은 현재 `zig-out/bin/hwpjs.wasm`이 있어야 하므로 깨끗한 체크아웃에서는 먼저 `zig build -Doptimize=ReleaseSafe`를 실행합니다.

[Raw DEFLATE stored encoder](raw-deflate-stored-encoder.md)는 `zig test src/root.zig -O ReleaseSafe --test-filter 'raw DEFLATE stored encoder'`로 블록 wire·경계·한도·할당 실패를 검사합니다. 같은 필터를 `-O Debug`·`-O ReleaseFast`에서도 실행할 수 있습니다. 과거 변이 실행이나 외부 구현과의 실파일 저장 비교는 포함하지 않습니다.

[PCX 헤더·RLE 경계](pcx-structure.md)는 `zig test src/root.zig --test-filter 'PCX structure'`로 단위·반례를 검사하고, `--test-filter 'HWPX picture image payloads'`로 ZIP·MIME·오류 연결을 확인합니다. 독립 `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--picture-payloads` 및 아래 known survey ReleaseFast shard 7이 실파일 PCX 1건의 RLE 경계를 대조합니다.

[HWPX 그림 이미지 바이트 검사](hwpx-picture-image-payloads.md)는 `zig test src/root.zig --test-filter 'HWPX picture image payloads'`로 형식·WMF framing·TIFF 연결·중복·한도·오류·OOM·추적 파일·master 조립을 검사합니다. [TIFF 구조](tiff-structure.md)는 `zig test src/root.zig --test-filter 'TIFF structure'`로 별도 검사합니다. 기존 브러시의 동일 코어 회귀는 `--test-filter 'HWPX fill brush image payloads'`로 확인합니다. `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--picture-payloads`는 독립 반례·실파일 형식/바이트 분포, WMF framing과 TIFF 구조 진단을 제공하며, 아래 known survey의 ReleaseFast 8개 shard가 제품 결과와 대조합니다.

[HWPX 그림 이미지 OPF 연결](hwpx-picture-image-links.md)은 `zig test src/root.zig --test-filter 'HWPX picture image links'`로 다섯 상태·직접 부모/namespace·한도·OOM·추적 실파일을 검사합니다. `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--pictures`가 직접 `pic/img`의 독립 대조값을 생성합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 ReleaseFast 프로세스로 실행해 1993개 section/35개 마스터페이지 사이트와 OPF 항목 인덱스 합계를 확인합니다.

[HWPX fillBrush 이미지 바이트 검사](hwpx-fill-brush-image-payloads.md)는 `zig test src/root.zig --test-filter 'HWPX fill brush image payloads'`로 형식·MIME 편차·중복·한도·내부 체크섬·OOM·추적 실파일을 검사합니다. `python3 tools/hwpx-fill-brush-image-oracle.py --self-test`와 `--payloads`가 선택 실파일의 형식·고유 대상·바이트·MIME 불일치를 독립 조사합니다. 아래 known survey의 8개 ReleaseFast shard를 N=0..7 각각 실행해 대조합니다.

[HWPX fillBrush 이미지 OPF 연결](hwpx-fill-brush-image-links.md)은 `zig test src/root.zig --test-filter 'HWPX fill brush image links'`로 다섯 상태·출처·예산·OOM을, `--test-filter 'HWPX master fill brushes connect known'`으로 마스터페이지와 스트리밍 범위 차이를 검사합니다. `python3 tools/hwpx-fill-brush-image-oracle.py --self-test` 및 인자 없는 실행이 독립 반례와 8개 shard의 manifest 대상 인덱스 합계를 제공합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행해 실파일 390건을 대조합니다.

[HWPX 공통 fillBrush](hwpx-fill-brush.md)는 `zig test src/root.zig --test-filter 'HWPX fill brushes'`로 합성·한도·OOM, `--test-filter 'HWPX known inspections compose'`와 실제 presentation 통합 테스트로 문서 API를 검사합니다. `zig test src/hwpx/xml_values.zig`는 공통 float 어휘를, `python3 tools/hwpx-fill-brush-oracle.py --self-test` 및 인자 없는 실행은 독립 반례·8개 shard 기대값을 확인합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행합니다.

[HWPX 마스터페이지 fillBrush](hwpx-master-fill-brush.md)는 `zig test src/root.zig --test-filter 'HWPX master fill brushes'`로 파트·원값·한도·OOM 및 문서 API를 검사합니다. `python3 tools/hwpx-fill-brush-oracle.py --self-test`와 `--master`는 별도 manifest 선택 반례 및 독립 마스터페이지 census를 확인합니다. 아래 known survey 8개 ReleaseFast shard가 파트·브러시 수와 색상 원값 합계를 대조합니다.

[HWPX 구역 프레젠테이션 원값](hwpx-section-presentation.md)은 `zig test src/root.zig --test-filter 'HWPX section presentation'`으로 합성·실파일·한도·OOM을 검사합니다. `python3 tools/hwpx-section-presentation-oracle.py --self-test`와 `python3 -O tools/hwpx-section-presentation-oracle.py --self-test` 및 인자 없는 실행은 독립 반례·8개 shard 기대값을 생성합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행해 속성·직접 브러시 분포를 대조합니다.

[HWPX 구역 각주·미주 모양](hwpx-section-note-shapes.md)은 `zig test src/root.zig --test-filter 'HWPX section note shapes'`로 합성·한도·OOM 및 편차 실파일을 검사합니다. `python3 tools/hwpx-section-note-shapes-oracle.py --self-test`와 `python3 -O tools/hwpx-section-note-shapes-oracle.py --self-test` 및 인자 없는 실행이 독립 반례·8개 shard 기대값을 생성합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행해 원값 분포를 대조합니다.

[HWPX 구역 쪽 테두리 ID 참조](hwpx-section-page-border-references.md)는 `zig test src/root.zig --test-filter 'HWPX page border references'`로 ID 0/표 부재/미해결 및 실파일을 확인합니다. `python3 tools/hwpx-section-page-border-oracle.py --self-test`와 `python3 -O tools/hwpx-section-page-border-oracle.py --self-test`로 header ID 집합·section 참조 조사기의 일반·최적화 반례를 확인하고, 인자 없는 실행으로 실파일을 대조합니다. 아래 known survey 8개 ReleaseFast shard가 문서별 해결 분할과 첫 미해결 위치를 검증합니다.

[HWPX 구역 쪽 테두리·배경](hwpx-section-page-borders.md)은 `zig test src/root.zig --test-filter 'HWPX section page borders'`로 합성·한도·할당 실패를, `--test-filter 'HWPX known inspections compose'`로 실파일 조립을 확인합니다. 위 조사기의 일반·최적화 자체 반례와 인자 없는 실행은 독립 반례·8개 shard 기대값을 제공합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행해 대조합니다.

[HWPX 구역 직접 설정](hwpx-section-direct-settings.md)은 `zig test src/root.zig --test-filter 'HWPX section direct settings'`로 합성·한도·할당 실패를, `--test-filter 'HWPX known inspections preserve observed grid'`로 확장 속성 실파일을 검사합니다. `python3 tools/hwpx-section-direct-settings-oracle.py --self-test`와 `python3 -O tools/hwpx-section-direct-settings-oracle.py --self-test`로 독립 조사기의 일반·최적화 반례를 확인하고, 인자 없는 실행으로 8개 shard 기대값을 생성합니다. 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행해 대조합니다.

[HWPX 구역 번호·메모 모양 ID 참조](hwpx-section-definition-references.md)는 `zig test src/root.zig --test-filter 'HWPX section definition references'`, `--test-filter 'HWPX header resources index memo'`, `--test-filter 'HWPX known inspections resolve real memo'`로 합성 분기·header 색인·실파일 연결을 검사합니다. `python3 tools/hwpx-section-definition-reference-oracle.py --self-test`와 `python3 -O tools/hwpx-section-definition-reference-oracle.py --self-test`로 독립 조사기의 일반·최적화 반례를 확인하고, 인자 없는 실행으로 8개 shard 기대값을 생성합니다. 실제 Zig 대조는 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 프로세스로 실행합니다.

[HWPX 구역 정의](hwpx-section-definitions.md)는 `zig test src/root.zig --test-filter 'HWPX section definition'`으로 필드·자식·한도·OOM을, `--test-filter 'HWPX known inspections preserve tracked section definition fields'`로 추적 HWPX의 전 필드를 검사합니다. `python3 tools/hwpx-section-definition-oracle.py --self-test`와 `python3 -O tools/hwpx-section-definition-oracle.py --self-test`로 독립 조사기의 일반·최적화 반례를 확인하고, 인자 없는 실행으로 두 corpus 기대값을 생성합니다. 실제 파일 Zig 대조는 아래 `HWPX known document inspections shard N`을 N=0..7 각각 별도 프로세스로 실행합니다.

[HWPX 구역 쪽 설정](hwpx-page-geometry.md)은 `zig test src/root.zig --test-filter 'HWPX page geometry'`로 합성·숫자 경계·할당 실패를, `--test-filter 'HWPX known inspections expose page geometry'`와 기존 known-inspections 합성 테스트로 문서 API 연결 및 추적 HWPX 3개의 독립 XML 조사값을 대조합니다. `python3 tools/hwpx-page-geometry-oracle.py --self-test`와 `python3 -O tools/hwpx-page-geometry-oracle.py --self-test`로 독립 조사기의 일반·최적화 반례를 확인하고, 인자 없는 실행으로 로컬 두 corpus의 XML 원값·8개 shard 기대값을 산출합니다. Zig 실파일 대조는 아래 `HWPX known document inspections shard N`을 N=0..7 각각 실행합니다.

[HWPX 문단 직접 자식 구조](hwpx-paragraph-children.md)는 `zig test src/root.zig --test-filter 'HWPX paragraph children'`로 합성·한도 검사를, `python3 tools/hwpx-section-text-oracle.py`와 선택 실파일 known survey 8개 shard로 독립 집계를 대조합니다. 실파일 표본은 로컬 `reference/rhwp`가 필요합니다.

[HWPX 문단 줄 조각](hwpx-line-segments.md)은 `zig test src/root.zig --test-filter 'HWPX line segments'`로 합성·숫자 경계·할당 실패를, 같은 독립 조사기와 선택 실파일 known survey 8개 shard로 원값 합계·부재·음수·상위 비트 편차를 대조합니다.

[HWPX 마스터페이지 문단 줄 조각](hwpx-master-line-segments.md)은 `zig test src/root.zig --test-filter 'HWPX master line segments'`로 합성·예산·할당 실패를, `python3 tools/hwpx-manifest-xml-oracle.py --self-test`와 인자 없는 corpus 조사 및 선택 실파일 known survey 8개 shard로 독립 원값 합계를 대조합니다.

[HWPX 마스터페이지 문단 직접 자식](hwpx-master-paragraph-children.md)은 `zig test src/root.zig --test-filter 'HWPX master paragraph children'`로 합성·전역 예산·할당 실패를, `python3 tools/hwpx-manifest-xml-oracle.py --self-test`와 인자 없는 corpus 조사 및 선택 실파일 known survey 8개 shard로 독립 자식 분포를 대조합니다.

[HWPX 마스터페이지 텍스트 이벤트](hwpx-master-text.md)는 `zig test src/root.zig --test-filter 'HWPX master text'`와 기존 `HWPX section text` 필터로 합성·공통 스캐너 회귀를 확인합니다. `python3 tools/hwpx-manifest-xml-oracle.py --self-test` 및 인자 없는 corpus 조사와 `HWPX known document inspections shard N` 8개 선택 검사는 텍스트 개수·UTF-8 바이트·문서별 순서 지문 합계를 대조합니다. 선택 shard는 로컬 `reference/rhwp`가 필요하고 기본 audit에는 포함되지 않습니다.

[HWPX 마스터페이지 이진 리소스 참조](hwpx-master-binary-references.md)는 `zig test src/root.zig --test-filter 'HWPX master binary'`로 합성·한도·할당 실패를 확인합니다. 독립 `python3 tools/hwpx-manifest-xml-oracle.py --self-test` 및 인자 없는 corpus 조사와 `HWPX known document inspections shard N` 8개 선택 검사는 출처별 대상 분포를 대조합니다. 선택 shard는 로컬 `reference/rhwp`가 필요합니다.

[HWPX 마스터페이지 차트 경로·XML 검사](hwpx-master-chart-references.md)는 `zig test src/root.zig --test-filter 'HWPX master chart links'`로 합성·원문/선택·오류·할당 실패를 검사합니다. 기존 `HWPX chart links` 필터도 재실행합니다. 독립 `python3 tools/hwpx-manifest-xml-oracle.py --self-test`와 인자 없는 corpus 조사에서 `master_chart_elements`·`master_chart_attributes`를 확인하고, 선택 실파일 known survey 8개 shard를 각각 실행해 0건 및 파트 범위를 대조합니다. 이 corpus는 양성 마스터페이지 차트를 포함하지 않습니다.

[HWPX 마스터페이지 표 격자](hwpx-master-table-geometry.md)는 `zig test src/root.zig --test-filter 'HWPX master table geometry'`로 범위·병합·예산·할당 실패를 검사합니다. `python3 tools/hwpx-table-oracle.py --self-test`와 인자 없는 corpus 조사에서 `master_shards`를 만들고, `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`을 N=0..7 각각 실행해 대조합니다. 실파일 조사는 로컬 `reference/rhwp`가 필요합니다.

[HWPX 선택 분기 표 격자](hwpx-selected-table-geometry.md)는 `zig test src/root.zig --test-filter 'HWPX selected table geometry'`로 양쪽 원문/활성 선택·중첩·한도·할당 실패를 확인합니다. 기존 선택 참조·텍스트·서식 회귀 필터도 다시 실행합니다. `python3 tools/hwpx-table-oracle.py --self-test`와 인자 없는 corpus 조사의 `section_switch_tables`·`master_switch_tables`를 확인하고, `HWPX known document inspections shard N`을 N=0..7 각각 실행해 실파일 switch 문서의 원문/선택 표 동치를 확인합니다. 실파일에는 양성 조건부 표가 없습니다.

[HWPX 조건부 참조 선택](hwpx-switch-selection.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX selected references'`로, 실제 corpus 대조는 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`을 N=0..7 각각 별도 프로세스로 실행합니다. 후자는 로컬 `reference/rhwp`가 필요합니다.

[HWPX 표 격자 구조](hwpx-table-geometry.md)는 `zig test src/root.zig --test-filter 'HWPX table geometry'`로 합성·할당 실패를, 위 known survey 8개 shard로 실파일 표·행·셀 개수와 진단을 검사합니다. 독립 조사기 반례는 `python3 tools/hwpx-table-oracle.py --self-test`, 실파일 집계는 인자 없이 실행합니다. 실파일 조사는 기본 audit에 포함되지 않습니다.

[표 셀 크기·여백·속성·테두리 참조](hwpx-table-cell-fields.md)는 `zig test src/root.zig --test-filter 'HWPX table cell fields'`, `--test-filter 'HWPX table cell attributes'`, `--test-filter 'HWPX table cell border references'`와 `--test-filter 'HWPX known inspections distinguish missing border target'`로 합성·오류·참조 분기·할당 실패를 확인합니다. `zig test src/hwpx/xml_values.zig`는 공통 숫자 어휘를 검사합니다. 같은 known survey 8개 shard로 독립 Python 조사기의 크기·여백·속성 분포와 테두리 ID 해결을 대조합니다. 기본 audit에는 실파일 분할이 포함되지 않습니다.

[표 셀 직접 subList](hwpx-table-cell-sublists.md)는 `zig test src/root.zig --test-filter 'HWPX cell subLists'`로 합성·오류·한도·할당 실패를, 위의 `HWPX known inspections include table geometry`로 전체 문서 연결을 확인합니다. 같은 known survey 8개 shard에서 독립 Python 조사기의 목록·직접 문단·속성 분포를 대조합니다.

[표 자체 속성](hwpx-table-attributes.md)은 `zig test src/root.zig --test-filter 'HWPX table attributes'`로 합성·오류·할당 실패를 확인합니다. 독립 `python3 tools/hwpx-table-oracle.py --self-test` 및 인자 없는 corpus 집계와 위 known survey 8개 shard를 대조합니다. 특히 표 `borderFillIDRef=0`의 미해결 5건을 셀 참조 결과와 혼동하지 않습니다.

[표 직접 여백·셀 구역](hwpx-table-children.md)은 `zig test src/root.zig --test-filter 'HWPX table children'`로 합성·오류·예산·할당 실패를 검사합니다. 위 독립 표 조사기와 선택 실파일 known survey 8개 shard에서 여백·구역 수와 좌표·테두리 ID 합계를 대조합니다.

[표 상속 shape 필드·자식](hwpx-table-shape.md)은 `zig test src/root.zig --test-filter 'HWPX table shape'`로 합성·오류·예산·할당 실패를, `python3 tools/hwpx-table-oracle.py --self-test`로 독립 반례를 검사합니다. 선택 실파일 known survey 8개 shard에서 `sz`·`pos`·`outMargin`·`caption`·`label` 분포와 원값 합계, 모델 밖 `textWrap=THROUGH`를 대조합니다.

[표 행·셀 직접 자식 topology](hwpx-table-child-topology.md)는 `zig test src/root.zig --test-filter 'HWPX table child topology'`로 합성·한도·할당 실패를, 같은 독립 표 조사기와 선택 실파일 8개 shard로 미등록 자식·속성 및 알려진 직접 자식의 정확한 두 관측 순서와 나머지 순서 분포를 대조합니다.

[선택 분기 section 텍스트](hwpx-selected-section-text.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX selected section text'`로 실행합니다. 조건부 분기가 있는 실파일의 텍스트 보존 대조는 같은 known survey 8개 shard에 포함됩니다.

[선택 분기 서식 참조](hwpx-selected-style-references.md)는 `zig test src/root.zig --test-filter 'HWPX selected style references'`로 합성·할당 실패를 검사합니다. 실파일의 선택 텍스트·서식 참조 교차 대조는 위 known survey 8개 shard를 별도 프로세스로 실행합니다.

[선택 분기 마스터페이지 서식 참조](hwpx-selected-master-style-references.md)는 `zig test src/root.zig --test-filter 'HWPX selected master style references'`로 합성·한도·할당 실패를 검사합니다. `HWPX master style references`와 `HWPX selected style references` 필터도 회귀 실행하고, 선택적 known survey 8개 shard를 각각 실행해 마스터페이지 선택 텍스트와 문단·run 수를 대조합니다. 실파일 조사는 로컬 `reference/rhwp`가 필요합니다.

```sh
zig fmt --check build.zig src
zig build test
zig build -Doptimize=ReleaseSafe
zig build compare -Doptimize=ReleaseSafe
zig build audit -Doptimize=ReleaseSafe
```

파서·writer 변경에는 정상 입력뿐 아니라 잘림·잘못된 참조·크기 경계 테스트를 추가합니다. WASM ABI 변경은 실제 WebAssembly 인스턴스에서 확인합니다. 문서만 변경한 경우 관련 링크·경로·내용 검증으로 충분합니다.

HWPX 전용 테스트는 `zig test src/root.zig --test-filter HWPX`로 실행합니다. ZIP 엔트리·손상 경계·할당 실패와 두 corpus의 패키지 관계·버전 XML·[암호화 분류](hwpx-protection.md), 대표 표본의 [header·spine 구조](hwpx-document-structure.md)와 [header 리소스 ID 색인](hwpx-header-resources.md), [section p/run 서식 참조](hwpx-section-references.md), [header 내부 서식 참조](hwpx-header-references.md), [언어별 글꼴 ID](hwpx-font-references.md), [번호·글머리표 내부 참조](hwpx-list-references.md), [이진 리소스 manifest 연결](hwpx-binary-references.md), [차트 경로·XML 경계](hwpx-chart-references.md)를 검사합니다. 기존 패키지 테스트 일부가 Git에 추적되지 않는 로컬 `reference/rhwp` 예제를 사용하므로 이 명령과 `zig build test`도 깨끗한 체크아웃에서 그대로 재현되지는 않습니다. 나머지 내부 참조나 공개 JS API 검사는 아닙니다. ZIP 범위는 [HWPX ZIP 컨테이너](hwpx-zip-container.md), 패키지 관계 범위·실측은 [HWPX 패키지 관계 검증](hwpx-package-relationships.md), 버전 필드 변형은 [HWPX 버전 XML 검증](hwpx-version.md)을 참조합니다.

[차트 데이터 캐시 구조](hwpx-chart-cache.md) 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX chart cache'`로 선택할 수 있습니다. 차트 경로 검사와 결합된 캐시 진단 및 두 차트 간 한도 테스트는 `--test-filter 'HWPX chart'`로 함께 확인합니다.

[차트 수식 참조 구조](hwpx-chart-formula.md) 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX chart formula'`로 선택합니다. 경로와의 통합 테스트는 `--test-filter 'HWPX chart'`에 포함됩니다.

다단계 차트 범위는 `zig test src/root.zig --test-filter 'HWPX chart caches'`, `--test-filter 'HWPX chart formulas'`, `--test-filter 'HWPX chart links'`로 각각 검사하고, `python3 tools/hwpx-chart-text-oracle.py --self-test` 및 인자 없는 전체 차트 조사의 `multilevel_*` 집계와 대조합니다. 양성 실파일은 현재 로컬 corpus에 없습니다.

[차트 값·수식 텍스트 관측](hwpx-chart-text.md)의 공통 XML 이벤트 테스트는 `zig test src/root.zig --test-filter 'XML content visitor'`, 차트의 텍스트 한도·집계는 `zig test src/root.zig --test-filter 'HWPX chart'`로 확인합니다. 선택 실파일 제품 조사와 독립 대조는 각각 아래 `hwpx_structure_survey.zig`의 차트 필터와 `python3 tools/hwpx-chart-text-oracle.py`를 실행합니다. Python oracle은 제품·기본 audit 의존성이 아닙니다.

[차트 ST_Xstring](hwpx-xstring.md)의 해독기 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX Xstring'`, 차트 통합 테스트는 위 `HWPX chart` 필터로 실행합니다. corpus에는 해당 이스케이프가 없으므로 독립 oracle의 원문 값 길이 대조를 해독 정확성의 증거로 사용하지 않습니다.

[HWPX section 텍스트·내부 요소 이벤트](hwpx-section-text.md)는 `zig test src/root.zig --test-filter 'HWPX section text'`로 합성·오류 경계를 검사합니다. 선택 실파일 제품 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus section text and inline token read-only survey'`, 직접 run이 없는 실파일 회귀 검사는 같은 명령의 필터를 `HWPX layout-only paragraph keeps its real section diagnostic`으로 바꿔 실행합니다. 독립 조사기 자체 반례는 `python3 tools/hwpx-section-text-oracle.py --self-test`와 `python3 -O tools/hwpx-section-text-oracle.py --self-test`로, 전체 corpus 대조는 인자 없는 실행으로 확인합니다. 이 선택 검사들은 Git에 없는 로컬 `reference/rhwp`가 필요하며 기본 audit에 포함되지 않습니다.

[HWPX section 원문·요소 인덱스](hwpx-section-tree.md)의 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX section tree'`로 실행합니다. 선택 실파일 조사는 `HWPX corpus section tree shard 0`부터 `shard 7`까지의 이름을 각각 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter '<이름>'`에 넣어 **별도 프로세스**로 실행합니다. 한 프로세스에서 전 shard를 실행하면 메모리 압박으로 종료될 수 있습니다. 이 조사는 위와 같은 로컬 corpus가 필요하며 기본 audit에는 포함되지 않습니다. 독립 요소 수와 shard별 기대값은 `python3 tools/hwpx-section-text-oracle.py`의 `section_elements`·`section_tree_shards`와 대조합니다. 선택한 문단·run 속성 6개의 정규화 값과 부재는 `section_tree_shards[].attribute_digest_sum`, 출현·빈 값 수는 `section_attribute_counts`로 독립 대조합니다.

[HWPX header 원문·요소 인덱스](hwpx-header-tree.md)의 단위 테스트는 `zig test src/root.zig --test-filter 'HWPX header tree'`로 실행합니다. 선택 실파일 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX corpus header tree read-only survey'`로 별도 실행하고, `python3 tools/hwpx-section-text-oracle.py`의 `header_elements`·`header_ordered_digest_sum`을 독립 대조합니다. Git에 없는 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함되지 않습니다.

[HWPX 문서 XML 트리 조립](hwpx-document-trees.md)의 합성·할당 실패 검사는 `zig test src/root.zig --test-filter 'HWPX XML trees'`로 실행합니다. 선택 실파일은 `HWPX owned XML document trees shard 0`부터 `shard 7`까지를 각각 `zig test src/hwpx_document_trees_survey.zig -O ReleaseFast --test-filter '<이름>'`에 넣어 **별도 프로세스**로 실행합니다. `python3 tools/hwpx-section-text-oracle.py`의 `section_tree_shards[]`에 있는 `accepted`·`sections`·`header_elements`·`elements`·`header_bytes`·`section_bytes`와 독립 대조합니다. 이 조사는 로컬 `reference/rhwp`가 필요하며 기본 audit에는 포함되지 않습니다.

[HWPX 문단 메타 속성](hwpx-paragraph-metadata.md)의 단위 검사는 `zig test src/root.zig --test-filter 'HWPX paragraph metadata'`로 실행합니다. 위의 같은 8개 선택 shard가 `section_tree_shards[].paragraph_metadata`의 문단·ID·Boolean 집계도 독립 대조합니다. 기본 audit에는 이 실파일 대조가 포함되지 않습니다.

[HWPX header 시작 번호](hwpx-header-begin-numbers.md)의 단위 검사는 `zig test src/root.zig --test-filter 'HWPX begin numbers'`로 실행합니다. 위의 8개 선택 shard가 `section_tree_shards[].begin_numbers`의 요소·속성 존재 및 값 합계와 독립 대조합니다. 이 실파일 대조도 기본 audit에는 포함되지 않습니다.

[HWPX 현재 지원 검사 묶음](hwpx-known-inspections.md)의 합성·실예제·할당 실패 테스트는 `zig test src/root.zig --test-filter 'HWPX known'`로 실행합니다. 선택 실파일은 `HWPX known document inspections shard 0`부터 `shard 7`까지를 각각 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter '<이름>'`에 넣어 별도 프로세스로 실행합니다. 로컬 `reference/rhwp` corpus가 필요하고 기본 audit에는 포함되지 않습니다. 이 검사는 반복 파싱으로 비용이 높으며 전체 문서 유효성 판정이 아닙니다.

[HWPX 모든 ZIP 엔트리 무결성](hwpx-payload-integrity.md)의 합성 손상·한도·소유권 테스트는 `zig test src/root.zig --test-filter 'HWPX payload integrity'`로 실행합니다. 이 검사는 `inspectKnown`에도 포함되므로 위 8개 선택 shard는 미선택 BinData·부가 ZIP 엔트리의 해제·CRC도 거칩니다. 바이너리 내부 포맷·XML 스키마까지 검증하는 것은 아닙니다.

[HWPX OPF 선언 XML 전수 문법 검사](hwpx-manifest-xml.md)는 `zig test src/root.zig --test-filter 'HWPX manifest XML'`로 단위 검사를 실행합니다. `inspectKnown`의 위 8개 선택 shard가 전체 내장 `application/xml` 엔트리의 수·바이트·요소 및 settings/masterpage 수를 `python3 tools/hwpx-manifest-xml-oracle.py`의 독립 ZIP/ElementTree 결과와 대조합니다. 외부/비XML 항목이나 XML 의미 검증으로 확대하지 않습니다.

[HWPX settings 원값 검사](hwpx-settings.md)는 `zig test src/root.zig --test-filter 'HWPX settings'`와 `zig test src/root.zig --test-filter 'HWPX known'`로 합성 ZIP·묶음 경로를 확인합니다. 위 `HWPX known document inspections shard 0`부터 `shard 7`까지의 선택 실파일 검사는 `python3 tools/hwpx-manifest-xml-oracle.py`의 settings 존재·Caret/config 개수·값 합계와 대조합니다. 전체 설정 의미 검증은 아닙니다.

[HWPX masterpage 파트·참조](hwpx-master-pages.md)는 `zig test src/root.zig --test-filter 'HWPX master'`로 합성 ZIP·오류·한도·할당 실패를 확인합니다. 위의 8개 `HWPX known document inspections shard N` 선택 검사에서 `python3 tools/hwpx-manifest-xml-oracle.py`의 루트 타입·subList 개수·pageNumber 합계·section 참조·선언 수를 대조합니다. `masterPageCnt`와 실제 참조 개수의 동치는 주장하지 않습니다.

[HWPX ParaListType 직접 속성](hwpx-para-list.md)도 같은 `HWPX master` 합성 검사를 사용합니다. 독립 Python 조사의 subList 직접 문단 수·속성 존재·폭/높이 합계는 위 8개 실파일 shard와 대조합니다. 기본 audit에 실파일 조사가 포함되지는 않습니다.

[마스터페이지 문단 메타 값](hwpx-paragraph-metadata.md)도 `HWPX master` 합성 검사와 위 8개 shard에서 확인합니다. 독립 Python 조사의 `master_paragraphs`·ID 부재/0·`paraTcId` 부재·Boolean true 집계와 대조하며, section 기존 경로는 `zig test src/root.zig --test-filter 'HWPX paragraph metadata'`로 확인합니다.

[마스터페이지 서식 참조](hwpx-master-style-references.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX master style'`, 기존 section 규칙의 회귀는 `zig test src/root.zig --test-filter 'HWPX section references'`로 확인합니다. 위 `HWPX known document inspections shard N` 8개 선택 검사는 독립 `python3 tools/hwpx-manifest-xml-oracle.py`의 `master_style_*` 집계와 대조하며 기본 audit에는 포함되지 않습니다.

[run 변경 추적 ID 원값](hwpx-run-metadata.md)의 합성 section·마스터페이지 검사는 `zig test src/root.zig --test-filter 'HWPX run metadata'`로 실행합니다. 위의 8개 선택 shard는 독립 `python3 tools/hwpx-manifest-xml-oracle.py`의 `section_run_metadata`·`master_run_metadata`와 대조합니다. 실파일에서는 두 속성이 전부 부재하므로 명시적 값 분기는 합성 테스트만 검증합니다.

[run 위치·자식 진단](hwpx-run-topology.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX run topology'`로 실행합니다. 같은 8개 선택 shard에서 독립 Python oracle의 `*_run_non_direct`, `*_run_secpr_*`, `*_run_child_classes`와 대조하며, 공개 모델 미등록 요소를 오류로 강제하지 않습니다.

[`hp:t` 원값·자식 진단](hwpx-text-nodes.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX text node'`로 실행합니다. 같은 8개 선택 shard에서 독립 Python oracle의 `*_text_nodes`·`*_text_child_classes`와 대조합니다. 선택 검사에는 로컬 corpus가 필요하고 기본 audit에는 포함되지 않습니다.

[조건부 switch 구조](hwpx-switch-shape.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX switch shape'`로 실행합니다. 선택 실파일 8개 shard에서 독립 oracle의 `section_switch_shape`·`master_switch_shape` 21개 슬롯과 대조합니다. 기본 audit에는 실파일 shard가 포함되지 않습니다.

[`hp:tab` 속성 진단](hwpx-inline-tab.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX tab attributes'`로 실행합니다. 같은 8개 선택 shard에서 독립 oracle의 `section_tab_fields`·`master_tab_fields` 21개 슬롯과 대조합니다. 기본 audit에는 실파일 shard가 포함되지 않습니다.

[인라인 주석 마커 속성](hwpx-inline-annotations.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX inline annotation'`으로 실행합니다. 같은 8개 선택 shard에서 독립 oracle의 `section_markpen_fields`·`master_markpen_fields` 9개 슬롯과 `section_title_mark_fields`·`master_title_mark_fields` 6개 슬롯을 대조합니다.

[인라인 변경 추적 태그](hwpx-track-change-tags.md)의 합성 검사는 `zig test src/root.zig --test-filter 'HWPX track change tag'`로 실행합니다. 같은 8개 선택 shard에서 독립 oracle의 `section_track_change_tag_fields`·`master_track_change_tag_fields` 20개 슬롯을 대조합니다. 현재 corpus에는 네 태그가 없어 실파일 속성값은 검증되지 않았습니다.

[HWPX section 직접 문자 콘텐츠](hwpx-section-content.md)의 단위 테스트도 위의 `HWPX section tree` 필터에 포함됩니다. 같은 8개 선택 shard에서 `section_tree_shards[].content_digest_sum`을 독립 Python Expat의 직접 콘텐츠 합계와 대조합니다. 이 합계는 요소별 정규화 문자 값의 검증이며 개별 콜백 경계의 동치 주장은 아닙니다.

요소와 문자를 섞어 전달하는 `visitOrdered`도 같은 테스트·shard 명령으로 검사합니다. 독립 Expat의 경계별 문자·시작/끝 순서 해시는 `section_tree_shards[].ordered_digest_sum`으로 대조하며, 빈 태그는 시작+끝으로 정규화합니다. 순서 해시의 반례 테스트는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast --test-filter 'HWPX ordered digest detects moved text'`로 실행합니다. 주석·처리 지시문과 콜백 분할은 포함하지 않습니다.

[HWPX XML 네임스페이스 버전 경계](hwpx-namespace-profiles.md)는 `zig test src/root.zig --test-filter 'HWPX namespace profile'`로 합성 루트·패키지 오류를 검사합니다. 로컬 corpus의 header·spine 루트 분포는 `python3 tools/hwpx-section-text-oracle.py`의 `header_root_names`·`spine_xml_root_names`로 확인합니다. 해당 corpus에 후속 OWPML 루트가 없으므로 이 검사는 후속 버전 실파일 호환성 검사가 아닙니다.

전체 corpus의 header/section XML 문법·namespace, 제품 header·spine 구조, header 리소스 ID 색인, section 및 header 서식 참조, 언어별 글꼴·번호·글머리표·이진 리소스·차트 경로 연결 조사는 `zig test src/hwpx_structure_survey.zig -O ReleaseFast`로 명시적으로 실행합니다. 이 선택 조사는 Git에 추적되지 않는 로컬 `reference/rhwp` 클론이 있어야 재현됩니다. 수백 MB의 해제 XML을 읽으므로 기본 `zig build test`·`audit`에는 포함하지 않습니다. 묶음 실행은 큰 메모리 사용량으로 중단될 수 있어 `--test-filter 'HWPX corpus chart path and XML read-only survey'`처럼 corpus 항목별 단독 실행 결과를 구분해 기록합니다. 원본은 변경하지 않으며 선행 XML 관측은 [HWPX XML 구조 조사](hwpx-xml-structure-evidence.md), 제품 구조 검증 결과는 [header·spine 구조](hwpx-document-structure.md), ID 색인 결과는 [header 리소스](hwpx-header-resources.md), 참조 결과는 [section 서식 참조](hwpx-section-references.md)·[header 내부 참조](hwpx-header-references.md)·[글꼴 ID 참조](hwpx-font-references.md)·[번호·글머리표 참조](hwpx-list-references.md)·[이진 리소스 연결](hwpx-binary-references.md)·[차트 경로 검증](hwpx-chart-references.md)이 각각 소유합니다.

테스트용 문서 보고서의 기대 바이트 간격/필드 위치는 `tests/hwp5/document-report-wire.mjs`에서 공유합니다. 제품 serializer로부터 생성하지 않아 독립 대조를 유지하며, 다른 테스트에 구역 stride·필드 offset 숫자를 다시 복제하지 않습니다. 구역 인덱스 정렬 검증은 서로 다른 진단값을 가진 입력으로 수행합니다.

일반 컨테이너 보고서(mode 25)의 마지막 decoded bytes/uninspected streams 위치는 `tests/hwp5/container-report-wire.mjs`가 소유합니다. 선택적 추가 보고서를 붙이기 전의 기본 보고서에만 적용하며, 제품 serializer에서 기대 위치를 생성하지 않습니다.

`zig build line-cache-audit`는 변경 추적 병합 문단의 읽기 전용 실파일 조사와 조사 도구의 적대적 테스트를 실행합니다. 전체 `audit`에도 포함됩니다. 해석 범위와 실측은 [병합 줄 캐시 조사](hwp5-merged-line-cache.md)가 소유합니다.

`zig build history-xml-audit`는 별도 설치된 `xmllint`가 PATH에 있을 때 이력의 읽기 전용 XML 조사를 실행합니다. 자동 설치하거나 제품/WASM에 링크하지 않습니다. 외부 도구가 필요 없는 안전 경계 단위 테스트만 기본 `audit`에 포함하며, 실제 XML 조사는 명시적으로 실행합니다. 계약과 실측은 [이력 XML 조사](hwp5-history-xml-evidence.md)가 소유합니다.

[HWP5 문서 요약 property set](hwp5-summary-property-sets.md)의 타입·예약 필드와 다중 set 거부는 `zig test src/root.zig --test-filter 'summary typed value'` 및 `--test-filter 'HWP summary rejects'`로 검사합니다. 누락 코드페이지 관측 마커는 `--test-filter 'HWP summary missing-codepage'`로, 추적 실파일의 같은 진단은 `--test-filter 'tracked HWP summary fixture'`로 검사합니다. 파일 단위 통계 전달과 테스트용 mode 25/27 wire는 `zig build hwp5-audit -Doptimize=ReleaseSafe --summary all`에서 검사합니다. 전체 회귀는 아래 `zig build test --summary all`·`audit`를 따릅니다. 별도 읽기 전용 원시 필드 조사는 `node tools/hwp5-summary-reserved-survey.mjs --self-test` 후 `node tools/hwp5-summary-reserved-survey.mjs legacy/rust/crates/hwp-core/tests/fixtures reference/rhwp/samples`로 재현합니다. `zig build audit`로 테스트용 WASM을 생성한 뒤 같은 조사 명령의 디렉터리 앞에 `--probe`를 넣으면 실제 요약 스트림을 테스트용 요약 파서에도 대조하며 오류가 있으면 실패합니다. 이 조사는 제품 WASM의 CFB 조회를 사용하며, 문서 전체 검증은 아닙니다.

## PrvImage 조사

`zig build preview-image-audit --summary all`은 제품 WASM 빌드 후 조사 도구 테스트와 기본 HWP fixture의 읽기 전용 시그니처 조사를 실행하며 정규 audit에도 포함됩니다. 제품 이미지 검사 명령이 아닙니다. 범위를 넓히려면 빌드 후 아래 명령에 디렉터리를 명시합니다. 직접 자식 파일만 조사합니다. 계약·미구현 범위는 [PrvImage 형식 조사](hwp5-preview-image-evidence.md)에 둡니다.

`zig build doc-options-audit --summary all`은 DocOptions 관측 테스트와 기본 corpus 조사를 실행합니다. 확장 조사는 `node tests/hwp5/doc-options-survey.mjs legacy/rust/crates/hwp-core/tests/fixtures reference/rhwp/samples`로 재현합니다. 직접 자식 HWP 파일만 읽으며 내부 문서 경로는 출력하지 않습니다. 필드 검증과의 경계는 [DocOptions 조사](hwp5-doc-options-evidence.md)에 둡니다.

```sh
node tests/hwp5/preview-image-survey.mjs legacy/rust/crates/hwp-core/tests/fixtures reference/rhwp/samples
```

## 차트 Contents 관측

제품 WASM 빌드 후 루트에서 `node --test tests/hwp5/chart-contents-evidence.test.mjs`와 `node tests/hwp5/chart-contents-survey.mjs`를 실행합니다. 조사 범위와 의미 해석의 경계는 [차트 Contents 실측](hwp5-chart-contents-evidence.md)에 둡니다. 정규 audit와 별개의 읽기 전용 조사입니다.

`zig build chart-ownership-audit --summary all`은 SHA-256으로 고정한 실제 Contents 표본의 소유권·원본 복제·span patch·String 정의 편집·참조 분리/재파싱·OOM·모든 잘림·한도 오류 검사와 표본 모듈 생성기 테스트를 실행합니다. `-Doptimize=ReleaseSafe` 또는 `-Doptimize=ReleaseFast`로 같은 검사를 실행할 수 있으며 정규 `audit`에도 포함됩니다. 매 실행마다 기존 corpus에서 원본을 다시 확인하고 생성한 Zig 모듈은 빌드 캐시에만 둡니다. 필요한 표본이 없으면 다른 표본으로 대체하지 않고 실패합니다. 선택 배치와 검증 한계는 [Contents 조립](hwp5-chart-observed-contents.md), 원본 출력 계약은 [차트 원본 바이트 보존](hwp5-chart-source-preservation.md), patch 계약은 [차트 원본 span patch writer](hwp5-chart-patch-writer.md), 정의 편집 계약은 [차트 String 객체 편집](hwp5-chart-string-edit.md), 참조 분리 계약은 [차트 String 참조 분리](hwp5-chart-string-fork.md)가 소유합니다.

## 세 빌드 모드 회귀 검증

GIF의 macOS ImageIO 제3 구현 대조는 선택적 테스트이며 정규 audit나 제품 빌드에 Swift/CoreGraphics 의존성을 추가하지 않습니다. `swiftc tests/hwp5/gif-imageio-oracle.swift -O -o /tmp/hwpjs-gif-imageio-oracle`로 oracle을 빌드할 수 있습니다. stdin으로 GIF를 받고 프레임 RGBA JSON을 출력하며, `tests/hwp5/gif-imageio.mjs`의 compareGifImageIo가 단일 프레임/팔레트/크기 전제를 확인한 뒤 픽셀을 대조합니다. 대상과 결과는 [GIF 복호화 기록](gif-indexed.md)에 둡니다.

ICC 식별자 스냅샷의 생성 파일 일치는 `node tools/icc-registry/generate.mjs --check`, 추출·다운로드·스냅샷·생성 테스트는 `zig build icc-registry-audit --summary all`로 오프라인 검사합니다. 정규 audit에도 포함되며 자동 다운로드/갱신하지 않습니다. 원본 JSON 변경 후 생성기 stdout을 검토해 data.zig에 반영합니다. 계약은 [ICC 등록부 조회](icc-registry-lookup.md)에 둡니다.

언어 태그 등록 테이블은 `node tools/language-registry.mjs --check`로 오프라인 일치를 검사합니다. `--fetch`는 공식 IANA 원본으로부터 축약 JSON을, `--tables`는 로컬 source.json으로부터 파생 파일 내용을 JSON으로 표준 출력합니다. 두 명령 모두 파일을 자동 덮어쓰지 않습니다. 갱신 시 source.json과 파생 파일을 함께 검토·반영하고 전체 audit를 실행합니다. 계약은 [BCP 47 등록 검증](bcp47-registry.md)을 참고합니다.

공유 zig-out 산출물이 덮어써지지 않도록 아래 명령은 순차 실행합니다.

```sh
zig build audit --summary all
zig build audit -Doptimize=ReleaseSafe --summary all
zig build audit -Doptimize=ReleaseFast --summary all
```

수정한 테스트 Zig 파일도 zig fmt --check 대상으로 확인하고, 변경 JS 파일은 node --check로 검사합니다. 검사 횟수는 로그에서 확인하며 지원 범위와 동일시하지 않습니다.

소스 변이 검증은 각 변이를 독립 복사본에 적용하고 실행 직전에 그 복사본의 `.zig-cache`를 제거합니다. 같은 길이·같은 시각의 연속 변경이 이전 컴파일 결과를 재사용할 수 있으므로 최초 한 번만 cache를 지우는 것으로는 충분하지 않습니다. `--test-filter`를 사용할 때는 출력된 테스트 이름·개수를 확인하며, root import의 lazy declaration 때문에 전용 모듈 테스트가 수집되지 않으면 해당 Zig 파일을 직접 실행합니다.

ReleaseFast의 누수 검증을 std.testing.allocator의 기본 안전 검사에만 의존하지 않습니다. 특히 기대한 파싱/검증 오류를 잡아 성공으로 반환하는 테스트는 OOM 주입 검사와 별도로 정상 할당 후 오류 경로의 해제량을 확인합니다. 명시적 할당 회계 또는 safety=true인 검사 할당자를 사용하며, 실제로 해제 코드를 제거한 변형이 각 모드에서 실패하는지 확인합니다. Zig 0.16에서 확인한 재현과 보강 근거는 [BMP 적대적 검증](bmp-pixels.md)에 둡니다.

WASM 거부 테스트는 임의 예외나 메시지만으로 성공을 판정하지 않습니다. 파서가 반환한 정상 오류의 종류와 기대 오류명을 확인하고, WebAssembly.RuntimeError 및 호스트 TypeError/RangeError는 테스트 실패로 남깁니다. 독립 oracle도 의도한 검증 실패와 자체 실행 오류를 구분합니다. 실제 trap 주입이 거부 통계에 숨었던 재현과 방어 검사는 [BMP RLE 검증](bmp-rle.md)을 참고합니다.

2026-09-28 명령 문서 재검증에서는 문서에 적힌 프로젝트 경로 89개, `zig build` 단계 이름 12개, 명시적 Zig 테스트 필터 160개와 네 종류의 0~7 shard 이름이 당시 파일·`build.zig`·테스트 선언에 대응하는지 확인했습니다. 104곳의 Python 명령에서 사용한 옵션 문자열도 해당 스크립트에 존재했습니다. 당시 `zig build test --summary all`은 5/5 단계·2,664/2,664 테스트로 통과했고, ReleaseSafe HWP5 감사는 별도 실행에서 10/10 단계·8,905,855회 검사로 통과했습니다. 선택적 corpus/세 빌드 모드/외부 도구 명령을 당시 전부 실행한 것은 아니며, 경로·필터 일치가 각 조사기의 의미 정확성을 증명하지 않습니다.

2026-09-28 HWP5 미리보기 거부 원인 분류 후 재실행에서는 `zig build test --summary all` 5/5 단계·2,672/2,672개가 약 21분·최대 9 GiB로 통과했습니다. 오래 걸린 `HWPX known inspections include table geometry diagnostics and limits`만 분리해도 Debug 약 7분, ReleaseSafe 수십 초가 소요되며 둘 다 통과했습니다. 새 미리보기 오라클 테스트를 연결한 `zig build audit -Doptimize=ReleaseSafe --summary all`도 통과했습니다. 이 실행 시간은 현 로컬 환경의 실측이지 모든 환경의 성능 보장은 아닙니다.

WASM 배포 디버그 정보와 실행 섹션 검증은 [산출물 정책](wasm-release-artifacts.md)을 따릅니다.

## 입력 응답 표시 투영 회귀

[표시 투영 계산의 경계](renderer-ack-projection.md)를 따릅니다. 작은 합성 입력 회귀이며 Native 컴파일이나 ignored 문서가 필요하지 않습니다.

```sh
mise exec -- bun test ./packages/vanilla/tests/renderer-ack-projection.test.mjs
```


## 공개 패키지 JSX 회귀

[JSX 런타임 계약과 검증 범위](public-package-jsx-runtime.md)를 따릅니다. 설치된 Bun·Node·React를 사용하며 Native 빌드와 문서 fixture가 필요하지 않습니다.

```sh
mise exec -- bun test ./tests/public-package-jsx-runtime.test.mjs
```

## 이력 단축키 반복

[브라우저 반복 이벤트와 이력 큐 계약](history-key-repeat.md)을 따릅니다. 내부 web 패키지의 현재 source가 dist로 재생성된 뒤, 다음 명시 테스트를 실행합니다.

```sh
mise exec -- bun test ./packages/vanilla/tests/shortcuts.test.ts ./packages/vanilla/tests/history-key-repeat.test.mjs
```

CDP의 trusted `autoRepeat` 검사는 실제 OS 키 반복이나 OS IME 검증과 구분합니다. 명시 테스트의 모의 비동기 ACK와 실제 Native·브라우저 검증도 별도 범위입니다.

### 이력 모델과 최종 paint 준비

[모델 준비와 최종 화면 준비](canvas-edit-history.md#연속-이력의-모델-준비와-최종-화면-준비)를 따릅니다. 저장소 루트에서 존재하는 아래 다섯 entry만 실행합니다.

```sh
set -- \
  ./tests/hwpx/history-model-presentation.test.mjs \
  ./tests/hwpx/history-paint-authority.test.mjs \
  ./tests/hwp5/history-selection-canvas.test.mjs \
  ./tests/hwp5/history-input-intent-queue.test.mjs \
  ./tests/hwp5/history-input-intent-readiness.test.mjs
for path in "$@"; do test -f "$path" || exit 1; done
mise exec -- node --test --test-concurrency=1 "$@"
```

97개 회귀는 실제 controller와 모형 DOM·ACK·선택 게시 포트를 검사합니다. 같은 다섯 entry의 Bun 검사도 같은 고유 97개이며, 둘을 합산하지 않습니다. 실제 Native·저장 oracle·브라우저 Canvas·OS IME 검증과는 별도 범위입니다. 이 명령은 WASM이나 새 SDK 빌드를 요구하지 않습니다.

## 문서 통계 모달 집중 검증

[통계 관측·모달 검증 범위](headless-text-tools.md)를 따릅니다. 기존 호환 WASM을 명시해 정규 테스트 한 파일만 실행합니다. 실제 cb48에서 mock 12개와 readonly 조회 2개가 14통과·74 assertions·0skip이었습니다. WASM이 없으면 Native 2개는 skip이므로 같은 검증으로 보지 않습니다.

```sh
test -f ./apps/demo/tests/document-statistics.test.ts || exit 1
HWPJS_TEST_WASM=/absolute/path/hwpjs.wasm mise exec -- bun test ./apps/demo/tests/document-statistics.test.ts
```

<a id="font-name-ui-tests"></a>

## 언어별 글꼴 이름 UI

```sh
test -f ./apps/demo/tests/font-name-tool.test.ts || exit 1
mise exec -- bun test ./apps/demo/tests/font-name-tool.test.ts
```

정규 대상은 fake port·공통 DOM 하네스의 25개/160 assertion입니다. 명시 파일의 존재를 확인한 뒤 실행하며 Native·브라우저 검증을 대신하지 않습니다. 이 검사는 core 타입만 참조하여 private dist를 runtime import하지 않습니다. 실제 앱 연결에는 `SET_CHARACTER_FONT_NAME_COMMAND`와 해당 조회 필드를 내보내는 검증된 SDK가 필요합니다. 기존 글꼴 export 없는 dist를 새 API 지원으로 간주하지 않습니다.

## HWPX 표시 자원 캐시 회귀

```sh
test -f ./tests/hwpx/display-resource-cache.test.mjs || exit 1
mise exec -- node --test ./tests/hwpx/display-resource-cache.test.mjs
```

소유 복사·순수 텍스트 편집 중 재사용·서식/구조/문서/실패 경계 무효화의 단위 회귀입니다. 실제 Native 저장·브라우저 성능 검증은 [표시 투영](renderer-ack-projection.md)의 별도 근거입니다.

## 입력 의도 FIFO 집중 검증

[큐 단계별 비용·token 수명·검증 한계](canvas-pending-input-intents.md#입력이력-fifo의-비용과-token-수명)를 따릅니다. 존재하는 정규 entry만 실행하며, 이 명령은 Native·브라우저·공식 producer 검증을 대신하지 않습니다. 반복 단축키 검사는 현재 source를 반영한 내부 core/dist 또는 명시적으로 고정한 source alias가 필요합니다. 후보 source-alias 결과를 root/dist 통과로 읽지 않습니다.

```sh
test -f ./tests/hwp5/input-intent-queue.test.mjs || exit 1
test -f ./tests/hwp5/history-input-intent-queue.test.mjs || exit 1
mise exec -- node --test --test-concurrency=1 ./tests/hwp5/input-intent-queue.test.mjs ./tests/hwp5/history-input-intent-queue.test.mjs
test -f ./packages/vanilla/tests/history-key-repeat.test.mjs || exit 1
mise exec -- bun test ./packages/vanilla/tests/history-key-repeat.test.mjs
```

## 문단 원자 서식 API 회귀

계약과 검증 범위는 [문단 원자 서식 API](headless-paragraph-formatting.md)를 참조합니다. 저장소 루트에서 정규 합성 회귀 한 파일만 실행합니다. Native 실행물은 필요하지 않습니다.

```sh
test -f ./packages/core/tests/commands/paragraph-formatting-patch.test.ts || exit 1
bun test --no-install ./packages/core/tests/commands/paragraph-formatting-patch.test.ts
```

<a id="worker-resource-transfer-tests"></a>

## Worker 그림 바이트 전송 집중 검증

Node 24의 내장 TypeScript 타입 제거와 실제 Node Worker 전송을 사용합니다. 설치·빌드·WASM 파일은 필요하지 않습니다. [소유권과 미검증 경계](worker-runtime-transport.md#그림-리소스-응답의-버퍼-소유권)를 따릅니다. 아래 명시 파일은 13건을 실행하며, 그림 교체·undo는 controlled 리소스 변경 대조이고 실제 Native 이력 검증이 아닙니다.

```sh
node --test ./packages/core/tests/worker-resource-transfer.test.mjs
```

## 대상별 문맥 메뉴 집중 회귀

선택 후보를 반영한 뒤 공개 owner·문서·undo/view 토큰 재검증과 공통 메뉴의 포커스 복원 계약을 검사합니다. 실제 브라우저 기능 범위와 단위 대역 검증은 별도로 기록합니다.

```sh
bun test ./apps/demo/tests/context-menu-target.test.ts ./apps/demo/tests/command-support.test.ts
node --test tests/hwpx/document-context-menu.test.mjs
```

## 문단 원자 서식 창 단위 검증

저장소 루트에서 정확히 다음 네 entry를 확인한 뒤 실행합니다. 공개 API 포트의 모의 상태·숫자 입력·공용 모달 도구 검사이며 Native·브라우저 검증은 별도입니다. 보호 파일 읽기·stat 거부 profile은 실행 환경에서 그대로 적용합니다.

```sh
test -f ./apps/demo/tests/paragraph-shape-ui.test.ts || exit 1
test -f ./apps/demo/tests/paragraph-shape-number.test.ts || exit 1
test -f ./apps/demo/tests/paragraph-shape-tool.test.ts || exit 1
test -f ./apps/demo/tests/paragraph-shape-fallback.test.ts || exit 1
mise exec -- bun test ./apps/demo/tests/paragraph-shape-ui.test.ts ./apps/demo/tests/paragraph-shape-number.test.ts ./apps/demo/tests/paragraph-shape-tool.test.ts ./apps/demo/tests/paragraph-shape-fallback.test.ts
```

계약과 미연결 필드는 [글자·문단 모양 창](formatting-dialogs.md#문단-원자-서식-창-후보)을 따릅니다.


## 읽기 전용 서식 참조 집중 회귀

두 파일은 정규 `test:core`와 `test:packages`의 core 테스트 경로에 등록되어 있습니다. 참조 발급 모델 6건과 실제 HWP5/HWPX 읽기 전용 2건을 구분합니다. 실제 검사는 명시한 WASM을 사용하며 누락 입력을 성공이나 skip으로 바꾸지 않습니다.

```sh
test -f packages/core/tests/commands/hwp5-readonly-references.test.mjs || exit 1
test -f packages/core/tests/integration/readonly-formatting-references.test.ts || exit 1
node --test packages/core/tests/commands/hwp5-readonly-references.test.mjs
HWPJS_TEST_WASM=/absolute/path/to/hwpjs.wasm HWPJS_REQUIRE_ATOMIC_FORMATTING=1 bun test ./packages/core/tests/integration/readonly-formatting-references.test.ts
```

`HWPJS_REQUIRE_ATOMIC_FORMATTING=1`은 원자 서식 지원 엔진을 요구합니다. 구형 엔진 호환 거부 검사는 이 변수를 생략해 별도로 실행하며 원자 서식 성공으로 계수하지 않습니다. 픽스쳐 기본값은 추적된 공개 Noori 두 파일입니다. 별도 고정 입력은 `HWPJS_TEST_HWP5_FIXTURE`와 `HWPJS_TEST_HWPX_FIXTURE`의 절대 경로로 지정합니다. 보호·제외 픽스쳐는 사용하지 않습니다. 읽기 전용 query는 새 문서 참조·지원 거부·쓰기 거부·상태 불변을 확인하며 편집 지원 확대를 주장하지 않습니다.

<a id="ole-outside-margin-diagnostic"></a>

## OLE 바깥 여백 읽기 진단

[원값·수치 도메인·오류 순서 계약](hwpx-ole-outside-margin-domain.md)을 따릅니다. 정규 root에 연결된 진단 6개를 명시 필터로 검사합니다. 합성 XML/정수와 할당 실패 검사이며 실제 파일 저장·WASM·레이아웃 검증은 아닙니다.

```sh
mise exec -- zig test src/root.zig -O ReleaseSafe --test-filter 'OLE margin '
```

후보의 별도 전용 실행 11개는 위 진단 6개에 기존 flow 2개·Reader 2개·wrapper 1개를 더한 결과입니다. 이 root 필터의 실제 수집 수로 11개를 약속하지 않습니다.

<a id="chart-major-ticks"></a>

## HWPX 차트 주 눈금선

[원값·진단·preview 한계](hwpx-chart-major-ticks.md)를 따릅니다. 정규 root의 새 모델4개와 순수 기하5개를 명시 필터/파일로 실행합니다. 별도 격리 Native6은 실fixture1+wrapper1을 더한 수이며 이 명령의 수집 수로 승계하지 않습니다. 새 전체 WASM·실브라우저 검증이 아닙니다.

```sh
mise exec -- zig test src/root.zig -O ReleaseSafe --test-filter 'chart major ticks'
test -f ./tests/hwpx/chart-major-ticks.test.mjs || exit 1
mise exec -- bun test ./tests/hwpx/chart-major-ticks.test.mjs
```

## 공개 예제 정책 집중 회귀

명시 정책·payload의 정상/음성 통제, 기본 Noori2 계약과 명시101 생산 계약을 같은 15개 회귀로 검사합니다. 테스트는 명시된 저장소 예제와 기존 공개 번들을 읽고 호출자가 소유한 임시 폴더만 생성·정리합니다. Native 실행이나 새 WASM 빌드는 없습니다.

```sh
test -f ./tests/tools/pages-demo-fixture-policy.test.mjs || exit 1
node --test --test-concurrency=1 ./tests/tools/pages-demo-fixture-policy.test.mjs
```

이미 검증한 bundle을 명시 정책으로 게시할 때는 다음을 사용합니다. 공개 예제 정책을 사설 목록으로 간주하지 않습니다.

```sh
test -n "${HWPJS_REVIEWED_BUNDLE_DIR:-}" || exit 1
node tools/build-pages-demo.mjs --bundle-dir "$HWPJS_REVIEWED_BUNDLE_DIR" --fixture-policy tools/pages-demo/public-gallery-fixtures.json --out zig-out/verification/gallery/public
node tools/build-pages-demo.mjs --verify --fixture-policy tools/pages-demo/public-gallery-fixtures.json --out zig-out/verification/gallery/public
```

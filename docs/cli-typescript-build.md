# CLI·MCP TypeScript 소스와 배포 빌드

## 소스 실행과 설치 실행

CLI·MCP의 개발 소스는 `packages/cli/src/`의 TypeScript입니다. 내부 모듈은 상대 `.ts` import를 사용하고, 기존 `js/`의 SDK·코덱 `.mjs`는 그대로 소비합니다. 포맷 파서나 Native 편집기를 TypeScript로 다시 구현하는 변경이 아닙니다.

개발 소스는 Node24의 기본 type stripping으로 직접 실행합니다. 이 문서의 실제 검사 런타임은 Node **24.20.0**입니다. 소스 실행 예시는 다음과 같습니다.

```sh
node packages/cli/src/bin.ts --help
node packages/cli/src/bin.ts read ./document.hwpx --wasm /absolute/path/hwpjs.wasm
```

소스 진입점 옆에 WASM이 없으면 `--wasm`을 명시합니다. 무시된 빌드 폴더를 자동 탐색하지 않습니다. 기본 WASM 위치는 실제 실행 진입점과 나란한 `hwpjs.wasm` 한 곳입니다.

Node의 type stripping은 **타입 검사가 아닙니다.** 실행 전에 타입을 지우므로 잘못된 타입 관계를 검출하는 별도 검사가 필요합니다. 또한 Node24는 `node_modules` 아래의 TypeScript 실행을 거부합니다. 저장소에서 `.ts` 실행이 통과해도 그 파일을 그대로 npm bin에 연결해 배포할 수는 없습니다. [Node24.20 공식 설명](https://nodejs.org/download/release/v24.20.0/docs/api/typescript.html#type-stripping-in-dependencies)을 따릅니다.

공개 패키지 후보의 `@ohah/hwpjs`는 Node `>=24.20.0` 계약을 유지합니다. 내부 개발 패키지·번들 설정의 `node24.11` 대상은 이 공개 최소 버전을 낮춘다는 안내가 아닙니다. npm 게시 여부와 저장소 소스·로컬 패키지 검증은 별도로 기록합니다.

## 타입 검사와 관측 경계

`packages/cli/tsconfig.json`은 `strict: true`, `noEmit: true`, `skipLibCheck: false`, `allowImportingTsExtensions: true`, `erasableSyntaxOnly: true`를 사용합니다. Node 직접 실행에서 지울 수 없는 TypeScript 문법으로 런타임 변환이 필요해지지 않도록 제한합니다. 값과 타입 import를 구분하고 `import type`을 사용합니다.

```sh
node_modules/.bin/tsc -p packages/cli/tsconfig.json
node --max-old-space-size=256 --test --test-concurrency=1 \
  packages/cli/tests/document-model.test.mjs \
  packages/cli/tests/render-document.test.mjs \
  packages/cli/tests/render-content.test.mjs \
  packages/cli/tests/read-operation.test.mjs \
  packages/cli/tests/batch-read.test.mjs \
  packages/cli/tests/document-paragraph.test.mjs
```

`allowJs: true`, `checkJs: false`는 기존 SDK의 JS 경계를 소비하기 위한 설정입니다. 새 CLI 소스를 검사에서 제외하는 수단으로 사용하지 않습니다. 공개 입력은 `unknown`에서 검증하며 문서 바이트·형식·SHA·주소·작업 스키마와 출력 예산은 런타임에도 확인합니다.

`types/native-document.ts`는 실제 JS SDK 반환 타입과 포맷별 열린 세션을 연결합니다. `types/document-view.ts`는 `DocumentView`, `DocumentReadContext`, `ObservationSdk`와 문단·표·이미지·unknown 블록 union을 소유합니다. 관측 포트는 실제 HWP5 또는 HWPX SDK를 수용하며, 서로 다른 포맷의 모든 메서드를 동시에 요구하지 않습니다.

표시 모델의 타입이 Native 저장 모델이나 편집 권위를 대신하지 않습니다. 모델에는 Native 원문 캐시를 추가하지 않습니다. `inspectDocumentParagraph`는 요청 시 실제 원문을 읽고 CR·컨트롤·비ASCII를 ASCII JSON 문자열로 표시합니다. 복사한 JSON을 해석한 문자열과 실제 원문의 UTF-16 단위가 같아야 하며, 표시용 이스케이프를 편집 좌표로 사용하지 않습니다.

## canonical 패키지 출력

이 절은 현재 소스 설정의 출력 계약입니다. 최종 정규 패키지·설치 성공은 해당 후보의 별도 영수증으로 확인합니다.

CLI·MCP 번들러는 **tsdown 0.23.7**로 고정합니다. 설정은 `packages/cli/tsdown.config.ts`, 전체 패키지 연결과 관측 지문은 `tools/build-public-package.mjs`가 소유합니다. [공식 진입점 설정](https://tsdown.dev/options/entry)과 [의존성 포함 정책](https://tsdown.dev/options/dependencies)을 사용하며 별도의 임의 번들러나 파서 사본을 두지 않습니다.

| 입력·출력                     | 계약                                                |
| ----------------------------- | --------------------------------------------------- |
| `packages/cli/src/bin.ts`     | `dist/cli.mjs` 독립 ESM 실행 파일                   |
| `packages/cli/src/mcp-bin.ts` | `dist/mcp.mjs` 독립 ESM stdio 서버                  |
| 기존 고정 WASM                | `dist/hwpjs.wasm` 한 벌을 외부 바이트 자원으로 공유 |
| 기존 공개 SDK                 | 웹·Node·framework 진입점과 타입 선언 생성 경로 유지 |

두 CLI 진입점은 각각 필요한 JS 의존성을 포함하고 공유 런타임 chunk를 요구하지 않습니다. 번들 결과의 외부 import는 Node 내장 모듈만 허용합니다. 이때 독립 실행 파일은 Node 없이 실행되는 운영체제 바이너리를 뜻하지 않습니다. WASM을 JS에 base64로 내장하거나 CLI·MCP별로 복제하지 않습니다.

`dts: false`는 이 두 명령 실행 파일에만 적용합니다. 기존 공개 SDK의 `.d.ts` 생성·`exports.types`·framework 선언 검증은 유지합니다. TypeScript 소스 전환을 이유로 공개 SDK 타입 선언을 제거하지 않습니다.

생성된 CLI/MCP의 `import.meta.url` 기준 기본 WASM은 배포된 진입점과 인접해야 합니다. 실제 npm bin 심볼릭 링크·외부 작업 디렉터리·명시 상대 `--wasm`에서도 같은 계약을 검사합니다. Skill도 이 canonical 출력의 CLI·MCP·WASM을 정확히 복사하며 별도 소스를 재번들하지 않습니다.

타입 검사에 읽힌 CLI `.ts`·SDK JS·설정과 번들러가 실제 읽은 모듈을 빌드 지문에 포함합니다. 최종 manifest의 파일 SHA·크기, WASM 핀, 라이선스·고지, 실제 tarball 파일 목록을 함께 확인합니다. 다른 작업 디렉터리의 WIP SDK나 이전 산출물을 섞은 성공은 해당 후보의 검증으로 취급하지 않습니다.

## 검증 단계와 현재 결과

소스 직접 실행, strict 검사, standalone 번들, 설치된 npm bin/MCP, 생성 Skill, 공개 실습 배포는 서로 다른 경계입니다. 최종 패키지는 `.ts` 로더나 루트 의존성에 기대지 않는 별도 소비자에서 검사해야 합니다. `node_modules`에 원문 TS를 넣은 음성 사례와, 생성 JS를 설치해 실행한 정상 사례를 구분합니다.

2026-11-08 읽기 영역의 전환에서는 기존 `.mjs`를 보존한 채 Node24 기본 stripping으로 소유 단위 검사와 실습 전송 검사를 실행했습니다. 읽기 모델·렌더링·배치·문단 조회·실습 경계 195개가 통과했고 strict·포맷·lint·공개 모델 타입 관계를 확인했습니다. 테스트와 실습의 해당 변경은 서비스 import를 `.ts`로 연결한 범위입니다.

그 동결 소스를 Git 기준 SDK와 명시 오버레이만 둔 격리 후보에서 다시 실행했습니다. Noori 두 형식의 text/Markdown 실제 읽기 4건은 기존 최종 CLI 출력과 바이트가 같았고, 실제 문단 조회 2건은 Native 원문과 ASCII JSON의 왕복 일치를 확인했습니다. HWP5의 문단 종결 CR을 보존했고 문단 조회 세션은 모두 닫혔습니다. 이는 Native820의 해당 읽기 서비스 검증이며 새 Native ABI·새 npm 게시·새 공개 배포를 뜻하지 않습니다.

현재 통합 후보는 TS 의존 경계를 닫고 이전 CLI/MCP `.mjs` 39개를 제거했습니다. 검증 후보의 SDK 소스 1,041개는 기준 Git 바이트와 일치하며, 전체 typed TS strict 검사와 tsdown 0.23.7 정규 빌드를 통과했습니다. Native820을 재사용했고 새 Native 컴파일은 수행하지 않았습니다. 공개 배포와 원격 CI는 이 로컬 후보 검증과 구분합니다.

신규 [CLI TypeScript CI](../.github/workflows/cli-typescript.yml)는 Node24.20.0·tsdown 버전·WASM/Noori 핀을 확인하고 strict 검사, TS 소스 검사, 정규 JS 빌드, 생성 CLI/MCP의 실제 실행을 연결합니다. 검사 수 0이나 실패·건너뜀을 성공으로 처리하지 않도록 결과를 확인하고 로그를 보존합니다. 이 워크플로의 소스 추가와 원격 CI 실행 성공은 별도 상태입니다.

별도 npm 소비자에 설치한 JS 산출물에서는 CLI 10호출과 공식 MCP stdio 클라이언트 7호출을 포함한 새 서비스 검사 2건이 통과했습니다. 생성·문단 원문·명시 변경·양방향 text-only 변환·읽기와 기본 변환 거부·기존 출력 거부·OCR 제공자 부재를 확인했습니다. 기존 fixture 설치 회귀는 16읽기와 두 형식 편집, 상위 검사를 포함한 19건으로 별도 보존합니다. 생성 Skill의 실제 런처는 Noori HWP5 읽기와 인수 전달을 확인했습니다. 이 실행을 Tesseract 인식 양성이나 모든 Skill 확장 기능의 실측으로 확대하지 않습니다.

타입만 정리한 후속 빌드도 실행 JS 두 파일과 WASM의 실제 바이트를 대조한 뒤 같은 경우에만 해당 실행 증거를 재사용합니다. 소스 지문·manifest가 달라지는 사실과 실행 바이트의 동일성은 별도로 기록합니다.

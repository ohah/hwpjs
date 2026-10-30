# 데모 서버의 dist·검증 bundle 모드

최초 기준 소스는 `47849ae2`입니다. 실행 명령은 [개발·검증 명령](development-commands.md#데모-서버-실행-모드)이 소유하고, 이 문서는 선택·검증·라우팅·자산 수명만 설명합니다. 서버를 실행하거나 정적 자산을 게시했다는 사실을 문서별 전체 편집·조판 지원으로 확대하지 않습니다.

## 모드 선택

| 입력                                  | 제공할 자산과 검증                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| bundle 옵션 생략                      | 기존 dev/dist 동작 보존. `apps/demo/dist`와 `packages/core/dist`를 읽음                              |
| 명시 `--bundle-dir`                   | 해당 공개 bundle의 manifest·파일별 SHA/크기·허용 경로/종류·참조·라이선스·JS 문법 등을 검증한 뒤 제공 |
| `--bundle-dir`와 `--fixture-policy`   | 명시한 공개 예제 정책을 같은 생산 검증기에 전달. 정책 생략 시 기본 Noori2 보호 유지                  |
| `--bundle-dir`와 `--private-fixtures` | private bundle opt-in. manifest·스키마·실제 서버 catalog·공개 기준 세대·engine 일치 검증을 추가      |

private 옵션만 단독으로 주면 `PrivateBundleRequired`이며, 옵션 중복·잘못된 인자/포트·빈 bundle 경로도 시작 전에 거부합니다. 포트 기본값은 8082이고 인자 파싱의 단일 출처는 `tools/demo-server-options.mjs`입니다. Bun으로 검증 경로를 실행해도 생성 JS 문법 검사는 실제 Node를 사용하며, 해당 실행 환경에는 Node가 필요합니다.

공개 bundle 검증의 기본값은 noori HWP/HWPX 2개만을 배포 fixture로 허용합니다. `--fixture-policy`는 bundle 모드에서만 받으며, 명시한 일반 JSON 파일을 읽기 전에 심볼릭 링크 경로와 파일 종류를 검사합니다. 정책 스키마와 catalog·파일의 일치는 기존 생산 검증기가 소유합니다. 옵션 생략 시 목록을 보고 정책을 추측하거나 자동 허용하지 않습니다.

private 모드는 이 제한을 전역으로 풀거나 원본 파일의 공개 재배포 권한을 부여하지 않습니다. 운영 전환 당시 private catalog의 **117개는 관측된 항목 수**이며 정책 기본값이나 모든 입력의 지원 수가 아닙니다. 실제 항목과 순서는 서버의 `demoFixtures`와 비교하고 `available`은 파일 접근 가능 관측일 뿐 Native 편집 capability가 아닙니다.

## private bundle과 공개 기준의 결합

`tools/demo-private-bundle.mjs`는 private manifest·파일 집합/크기/SHA·JS 문법·단일 canonical WASM을 검사합니다. 절대 개인 경로나 내부 URL을 자산에 넣는 것을 허용하지 않습니다. 서버 loader는 다음을 추가로 확인합니다.

- private manifest의 `publicBaseManifestSHA256`가 프로젝트의 `apps/docs/docs/public/editor`를 검증해 얻은 manifest SHA와 같아야 합니다. 명시한 공개 예제 정책은 이 공개 기준 검증에도 전달하며 private catalog 검증을 대신하지 않습니다. 다른 공개 세대와 조용히 섞지 않습니다.
- `runtime/worker.js`와 `hwpjs/hwpjs.wasm`은 그 공개 기준 파일과 **전체 바이트가 같아야** 합니다. 불일치는 `PrivateEngineDrift`로 거부합니다.
- catalog의 항목 수·id/name/label 및 허용 스키마를 현재 서버 catalog와 비교합니다. 단순히 숫자117만 일치시키는 검사가 아닙니다.

개인 원본을 추가하거나 private fixture를 공개 Git/Pages에 복사하는 절차는 이 모드의 제공 범위가 아닙니다. private bundle 준비와 네트워크 공개 범위는 운영자가 별도로 소유합니다.

## 원본 파일 provider와 bundle root

불변 host에 원본 문서를 복사하지 않을 때는 사설 bundle 모드에서 `--fixture-root`를 명시합니다. `--private-fixtures`와 `--bundle-dir`가 함께 있어야 하며 canonical directory만 허용합니다. 명시 경로 자체나 조상이 심볼릭 링크인 별칭은 거부합니다. 옵션 생략 시 기존 root와 옵션 객체 모양, 검증 순서를 유지합니다.

이 root는 원본 fixture와 가용성 catalog handler에만 전달합니다. bundle·publicBase·라이선스·문서의 root는 host 그대로입니다. 사설 앱이 사용하는 두 canonical prefix의 fixture/catalog 별칭도 같은 기존 strict handler로 보냅니다. 허용 목록에 없는 파일이나 provider 밖으로 벗어나는 링크를 읽는 기능을 추가하지 않습니다. 가용성은 요청 시 관측하며 모든 문서의 Native 지원을 뜻하지 않습니다.

2026-10-30 실제 작업 트리의 신규 provider15·기존 원본23, 총38개 검사가 실패·skip 없이 통과했습니다. 신규 테스트는 임시 provider 한 파일·경로 검사와 entry 의존성 주입을 사용하며, 기존 HTTP 테스트는 임시 loopback 포트를 종료합니다. 이 검사만으로 운영 서비스 전환이나 모든 원본 파일 서빙을 완료했다고 판단하지 않습니다.

## canonical 경로와 기존 handler의 책임

bundle 모드의 canonical 편집기 경로는 `/hwpjs/editor/demo/vanilla/`입니다. React/Svelte/headless와 API도 같은 `/hwpjs/editor/` 아래 자산을 사용합니다. `/`, `/index.html`, `/web/preview/index.html`, 기존 `/demo/...`·`/api...` 진입은 대응 canonical 경로로 redirect합니다. 기본 dev/dist 모드의 기존 페이지 응답 동작은 바꾸지 않습니다.

`/hwpjs/hwpjs.wasm`·`/hwpjs/worker.js`는 선택된 bundle의 canonical WASM/worker와 같은 바이트를 제공하는 호환 별칭입니다. bundle 모드의 `/docs/editor/`도 같은 편집기 자산으로 연결되어 과거 docs build 안의 다른 engine 사본과 섞지 않습니다.

### 정적 배포의 Worker·WASM 경로

GitHub Pages에는 위 서버 별칭이 없습니다. 배포된 `assets/` 모듈은 자신의 `import.meta.url`에서 `../runtime/worker.js`와 `../hwpjs/hwpjs.wasm`을 해석합니다. `apps/demo/src/runtime-assets.ts`가 이 규칙을 소유하며, Vite 개발 모드에서만 기존 개발 서버의 루트 경로를 사용합니다.

2026-10-30 공개 사이트에서는 앱이 `/hwpjs/hwpjs.wasm`을 요청해 404로 문서 열기가 실패했습니다. 파일은 `/hwpjs/editor/hwpjs/hwpjs.wasm`에 존재했지만 로컬 서버의 별칭 때문에 배포 검사에서 누락됐습니다. 공개 JS 검증은 이제 해당 Worker·WASM의 루트 리터럴을 거부합니다. 파일의 manifest·SHA 일치만으로 실제 요청 경로가 옳다고 판단하지 않으며, 별칭 없는 정적 경로에서 두 런타임 파일을 불러와 HWP5·HWPX 예제를 실제로 여는 검사를 별도로 수행합니다.

수정 소스 `295db8e2`의 공개 배포 후 실제 Chromium에서 `noori.hwp`와 `noori.hwpx`를 순서대로 열었습니다. 두 문서의 제목·Canvas 행·글꼴 준비와 그리기 대기 해제를 확인했고, 잘못된 루트의 런타임 요청은 없었습니다. WASM의 실제 요청은 200이었으며 Worker는 요청 URL 관측과 별도 HTTP 200·바이트 해시 대조를 구분해 확인했습니다. 공개 manifest는 `5db3fa393f512adbbbb48ff9dc01177346dce2e40fb68d4d8c5c233a10fee890`입니다. 이 검증은 문서 열기와 경로 복구 범위이며 입력·취소·저장·전체 조판·속도 검증을 포함하지 않습니다. 기존 guardian의 명령 순서 실패와 별도 Updater 잔류 기록은 보존했고, 최종 검사 브라우저 종료 및 잔류 PID의 후속 자연 종료를 각각 확인했습니다.

빌드된 문서 사이트의 `/docs/` 응답은 `tools/demo-documentation-response.mjs`가 소유하며 `apps/docs/doc_build`를 사용합니다. fixture catalog/원본 응답은 기존 `demo-fixture-catalog-response.mjs`·`demo-fixture-response.mjs`가 허용 목록과 정확한 경로 검증을 계속 소유합니다. private bundle에서 catalog 가용성을 관측하거나 bundle에 없는 허용 fixture를 제공할 때도 이 handler들을 재사용합니다.

공개 bundle에 fixture2개가 있다는 사실과 개발 서버의 기존 runtime fixture route는 서로 다른 경계입니다. `--private-fixtures`는 기존 route 전체의 인증 스위치가 아닙니다. 서버는 임의 요청 경로를 로컬 파일 경로로 읽어 주지 않습니다. GET/HEAD만 처리하고 WASM 압축·MIME·HEAD body 정책은 기존 공통 경로를 사용합니다.

## 시작 시 snapshot과 업데이트 운영

서버는 시작 시 선택된 dist 또는 검증 bundle의 자산 바이트를 읽어 보관합니다. 빌드된 docs도 시작 시 snapshot을 만듭니다. 디스크의 bundle·public 기준 manifest·dist·docs를 나중에 바꿔도 실행 중 프로세스가 자동 갱신하거나 새 세대를 재검증하는 구조가 아닙니다. `Cache-Control: no-store`도 서버 메모리의 snapshot을 새 파일로 바꾸지 않습니다.

운영자는 **같은 검증 세대**의 bundle/public 기준 manifest/worker/WASM을 준비한 뒤 서비스를 명시적으로 재시작해야 합니다. 재시작 후 canonical redirect·manifest·실제 JS/worker/WASM의 SHA/크기/MIME 및 문서·fixture route를 대조합니다. 기존 PID가 살아 있다는 사실이나 파일 복사 성공만으로 새 세대가 제공됐다고 판단하지 않습니다.

기존 fixture handler의 요청 시 파일 가용성/바이트 처리는 위 정적 자산 snapshot과 구분합니다. 전체 runtime 파일이 불변 snapshot이라고 쓰거나 이 동작을 원본·UI 자산의 자동 동기화 완료로 설명하지 않습니다.

## 2026-10-26 검증 기록

2026-10-26 후속 배포 소스는 `5f0ff9a4`이며 공개 bundle manifest SHA256은 `735d3c3d01b90ecb8cbd1342eda279da020d3ce80be8854336ef6f9fee3ce429`입니다. 공개 HTTPS의 자산 28개를 SHA와 대조했고, 별도 운영 경로의 Noori HWP 입력·undo/redo·다운로드·재열기 표본이 통과했습니다. HTTP 바이트 검증과 브라우저 편집 표본은 별도 근거이며, 아래 최초 운영 검증 이력이나 전체 fixture 성공으로 합산하지 않습니다. Native V1의 16회 undo 한도는 그대로이며, 집중 테스트 27건을 통과한 이력 후보는 아직 배포되지 않았습니다. 입력 측정 캐시의 국소 개선은 반영됐지만 전체 입력 파이프라인 O(n)은 미충족입니다.

최초 작성 시점에는 부모 HTTP12개 검사 통과와 브라우저 검증 진행 상태를 구분했습니다. 후속 실제 운영 경로에서는 기존 진입의 canonical redirect, catalog117개에서 noori HWPX 선택·실제 입력·undo/redo·다운로드·다시 열기, React/Svelte의 catalog·문단 부호, API ready를 확인했고 소유 브라우저 2개를 종료했습니다. 117은 이 실행의 catalog 관측값이지 정책 기본값이나 전 fixture 검증 수가 아닙니다.

이 후속은 UI/Native ACK·다운로드·reopen 근거이며 이번 실행에서 독립 CFB/XML oracle를 새로 수행한 것은 아닙니다. 엔진은 3fc/V1이며 V2 이력 미포함입니다. 이전 다른 공개 실행의 Svelte 최초 timeout은 원인이 확정되지 않은 별도 이력으로 유지하며 이번 성공으로 지우지 않습니다. 주소·PID·개인 경로는 이 공개 문서에 싣지 않습니다. 이 문서 갱신 과정에서는 새 서버·브라우저·Native 빌드를 실행하지 않았습니다. 영구 회귀 진입점은 [서버 bundle 검사](../tests/hwpx/demo-server-bundle.test.mjs)이며, 대표 경로 검증을 전체 문서·모든 fixture E2E로 확대하지 않습니다.

## 명시 공개 예제 정책

기본 정규 생산은 기존 Noori 두 예제만 허용합니다. `--fixture-policy`를 명시하면 catalog의 정확한 바이트 해시와 ID·파일 경로·크기·SHA를 검증하며, 중복·추가·누락·보호 이름·내부 주소는 거부합니다. 공개 목록은 `tools/pages-demo/public-gallery-fixtures.json`, 원본 공급 기록은 같은 폴더의 `public-gallery-sources.json`이 소유합니다. 정규 회귀와 생산 명령은 [개발·검증 명령](development-commands.md)의 공개 예제 정책 절을 따릅니다.

2026-10-30 공개 배포는 프로젝트 예제99개와 기존 Noori 호환 ID2개를 합친 101항목입니다. 암호 예제2개와 별도 참조16개는 이 공개 범위에서 제외합니다. 파일 가용성은 Native 기능 지원이나 모든 문서 편집 성공을 의미하지 않습니다. 기존 사설117 목록은 별도이며, catalog 길이·ID를 엄격 검증하는 앱에 공개101 목록을 통째로 덮어써서는 안 됩니다. 공개 asset commit `77a08d489`의 Pages 배포와 payload135개·manifest의 실제 HTTP 바이트 일치, 공개 Vanilla에서 Noori 두 형식의 열기·Canvas 표시를 확인했습니다. 이 공개 배포 결과를 사설117 서비스의 업데이트 완료로 해석하지 않습니다.

정규 회귀의 기본 Noori2 양성은 현재 공개 앱 자산에서 두 fixture와 catalog만 분리한 호출자 소유 사본으로 검증합니다. 공개 갤러리 개수나 예전 산출물 경로에 의존하지 않습니다.

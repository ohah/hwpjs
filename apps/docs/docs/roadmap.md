# 지원 현황과 로드맵

배포 정보 기준일: 2026-10-30. 아래 과거 검증 기록은 각 실행 당시 범위를 유지합니다. 공개 배포와 준비 소스의 상태를 구분합니다. 현재 HWPJS는 **Zig 기반 HWP5/HWPX 코어와 freestanding WASM**, DOM 없는 헤드리스 API, 이를 사용하는 Canvas 호스트로 구성됩니다. 전체 형식·모든 위치의 편집·한/글과 동일한 조판은 아직 완료되지 않았습니다. HWP3는 사용자 요청으로 대상에서 제외합니다.

이 페이지는 현재 작업 트리의 공개 소스와 기존 검증 기록을 대조한 상태표입니다. 이번 문서 조사에서 Native 빌드나 전수감사를 새로 실행하지 않았습니다. 소스의 public export, 패키지 빌드, npm registry 공개 설치, 실제 브라우저, RN 기기 지원은 서로 다른 증거입니다. 완료 기준이 다른 항목을 합쳐 진행률을 계산하지 않습니다.

## 지금 사용할 수 있는 배포와 준비 중인 작업

| 사용자 진입점 | 현재 확인한 범위 | 완료로 해석하면 안 되는 범위 |
| --- | --- | --- |
| [웹 Canvas 데모](./playground.mdx) · [API 직접 실행](./api/playground.mdx) | 2026-10-30 검증한 공개 정적 배포는 d849 WASM과 공개 예제 101개를 제공합니다. 기존 HWP5 한 사례에서 입력 80회·실행 취소 80회·저장을 확인했습니다. 예제 101개 전체의 편집·저장 검증은 아닙니다. 과거 b7 API 검사에서 두 형식의 열기·선택·삽입·이력·저장·재열기를 확인한 기록과 현재 배포 확인은 별도입니다 | Company/Enter 후속 소스의 이 배포 포함 여부는 이 확인만으로 판정하지 않으며, 모든 위치·명령·완전 조판의 증거도 아닙니다 |
| [새 canonical 패키지 예제](./guide/package-names.md) | 단일 `@ohah/hwpjs`와 `/runtime`, `/react`, `/svelte`, `/vanilla`, `/react-native` subpath 후보를 tarball로 검사했습니다 | 새 Zig/WASM API는 npm 미게시입니다. 현재 npm의 `0.1.0-rc.10`은 구 Rust 패키지이며, 패키지 소비 검증이 새 엔진 배포 완료를 뜻하지 않습니다 |
| Company/Enter 후속 | 준비 소스·격리 후보의 개별 검증은 위에서 검증한 d849 배포 및 과거 b7 감사와 별도입니다 | 소스 존재·commit·후보 빌드만으로 현재 웹 배포 반영이나 전체 corpus/형식 지원을 선언하지 않습니다 |
| [RN](./frameworks/react-native.md) | provider/JSI 기반 및 제한된 iOS 시뮬레이터 저수준 진단 harness의 근거가 있습니다 | 정식 HeadlessEditor provider 연결·Native Canvas 전체 조판·Android/iOS 제품 release·실기기·OS IME는 미완료입니다 |

현재 웹 아티팩트의 단일 출처는 [실제 HTTP manifest](https://ohah.github.io/hwpjs/editor/manifest.json)입니다. 아래 지문은 2026-10-30 검증 시점의 기록이며 새 배포의 현재 값은 manifest에서 확인합니다.

공개 asset commit `dcadaba7`은 표시 소스 `762dbbd57`을 사용합니다. Pages 실행 `41006825501`의 성공, 공개 payload138개와 manifest를 합친 139개 파일의 HTTP·SHA 일치, 실제 공개 사이트의 Noori HWP 열기와 저장된 혼합 각주의 다음 쪽 계속 표시를 확인했습니다. manifest SHA256은 `f4d7b84cbb9f2c3a6171b1605a3171a1d8426dee0628797e91e1f34436e76ec8`, WASM SHA256은 `d849a4b22357e62d2425c3f1632edc07f2948ac18ce6d97009aede9d2b6cb1eb`, core Worker SHA256은 `e30f0f4cd0cf45b4055bb2ae3d840518c153b6d397f1faaad49366c74ade83df`입니다. 이는 해당 입력과 배포의 확인 범위이며 b7 전수감사의 재실행, 모든 원본 조판이나 사설 서버 전환 완료를 뜻하지 않습니다.

설치·pack·예제 검사는 [설치 안내](./guide/installation.md)의 선행 소스와 메타데이터 조건을 따릅니다. 현재 소스, 독립 tarball, 실제 웹 배포, npm registry, Native 기기 지원의 검증을 서로 계승하지 않습니다.

## 판정 기준

| 판정 | 의미 |
| --- | --- |
| 구현·검증 | 해당 행에 적힌 명령·입력·환경·snapshot에서 실행 근거가 있음. 기능군 전체의 완료를 뜻하지 않음 |
| 부분 | 구현 경로가 있으나 public 계약·형식·타깃·UI 연결 또는 검증 범위가 제한됨 |
| 미구현 | 해당 공개 API나 제품 계약을 현재 제공하지 않음. 관련 저수준 기반까지 없다는 뜻은 아님 |
| 미검증 | 필요한 실행·종료·제품 반영 증거가 없음. 후보나 테스트 소스의 존재만으로 완료 처리하지 않음 |

일반 사용법은 [설치](./guide/installation.md), [편집](./guide/editing.md), [런타임](./guide/runtime.md), [현재 제한](./guide/limitations.md)을 함께 확인하세요.

## 확인한 검증 기준선

아래 실행들은 서로 다른 범위의 기록입니다. 합산해서 하나의 전체 성공으로 표시하지 않습니다.

| 근거 | 확인한 결과 | 입증하지 않는 범위 |
| --- | --- | --- |
| b7 헤드리스 전수감사 | 1,068경로 / 1,032원본 해시 / 1,006실행. verified 904, oracle 미지원 132, 입력 대상 없음 5, HWP3 제외 26, 사용자 제외 1. timeout 0. 원본·구현·WASM 해시 불변. **exit1, 전체 미완료** | 각 고유 입력에서 성공한 한 삽입 위치의 공개 편집·저장·이력·재열기 검사. 모든 위치·명령·조판·브라우저 E2E가 아님 |
| 빠른 실행 취소 | 3웹 호스트 × 2형식의 신뢰 키 입력 72사례, 이력 바닥 4사례, 독립 다운로드 2사례 | 세 검사축을 하나의 corpus 성공 수로 합치지 않음. 실제 OS IME와 pending 중 문서 세대 교체는 별도 |
| 공개 기본 붙여넣기 | Vanilla/React/Svelte × HWP5/HWPX 6조합. 실제 paste 이벤트·한 번의 splice·연속 입력·키보드 이력·다운로드/재열기 | charshape 두 fixture의 macOS Chromium 경로. 모든 OS·rich clipboard·개체/여러 문단 붙여넣기 증거가 아님 |
| RN 기반 | 별도 macOS host의 실제 Hermes/JSI → Native Context에서 두 형식 60개 검사와 pending 작업 중 엔진 종료 검사 | RN 앱 release 링크·네이티브 Canvas/Skia·iOS/Android IME·실기기 E2E 아님. b7 웹 감사와 다른 snapshot |
| 과거 기능별 검사 | 개별 서식·필드·표·수식·Worker·페이지/Canvas 보고서에 한정된 증거가 있음 | 과거 fixture/후보 WASM의 성공을 b7 감사의 전체 gate로 소급하지 않음 |

b7 WASM SHA256은 `b7aec1c9c674dbbef96c8c88e29a39e675a7eb85da630fe8707e7e2ad230bcee`입니다. 감사 당시 core 배포본은 별도 보존되어 있습니다. 후속 UI·압축 배포와 감사의 verifier/Native 기준선을 혼동하지 않습니다.

빠른 undo 72사례의 원본 보고서는 로컬 후보 환경을 기록하며, 공개 paste 6조합은 별도 HTTPS 실행 로그입니다. 배포 반영과 각 검사 실행의 출처를 합쳐 새 전수 결과로 만들지 않습니다.

RN host의 60개 검사도 과거 실행입니다. 정적 지문 대조에서 당시 evidence와 현재 probe 실행기 3개(`hermes-context.cpp`, `hermes-context.js`, `run-hermes-probe.sh`)의 해시 차이를 확인했습니다. 이 성공을 현재 probe 전체의 재실행 결과로 계승하지 않으며, 새 Native 실행은 하지 않았습니다.

RN의 후속 iOS 시뮬레이터 검증은 저수준 Native Context port의 두 형식 편집·이력·저장·재열기와 독립 저장 검사에 한정됩니다. 진단용 UIKit 문단 뷰와 toolchain workaround를 사용했으며, 공통 scene/shaping·정식 Native Canvas·고수준 HeadlessEditor provider·Android/실기기 지원 완료가 아닙니다. macOS host의 과거 60개 검사나 공개 b7 웹 감사와 합산하지 않습니다.

## 현재 공개 API와 UI

아래 경로는 저장소 루트 기준입니다. `public`은 소스의 export 경계를 뜻하며 npm 게시 여부의 보장은 아닙니다. `js/` facade나 내부 transport에 메서드가 있다고 해서 동일 기능이 typed public API와 데모에 모두 제공되는 것은 아닙니다.

| 기능 | 현재 public/API · 엔진 · UI 위치 | 검증 근거·범위 | 판정 | 남은 일 |
| --- | --- | --- | --- | --- |
| HWP5/HWPX 열기·형식 판별 | `packages/core/src/index.ts`: createEditor/load/detectDocumentFormat; `src/hwp5`, `src/hwpx`; `apps/demo/src/document-loader.ts` | b7 감사의 제한된 실제 입력, 공개 소스 inventory | 부분 | 모든 버전·의미 필드·보호 정책/손상 입력의 전체 지원은 미완료 |
| 텍스트 삽입·삭제·교체 | core `SPLICE_TEXT_COMMAND`; 형식별 Native 편집 모델; `apps/demo/src/demo-controller.ts` | b7 verified 904경로의 성공한 삽입 위치 | 구현·검증 | 검증된 한 삽입 위치 외의 모든 명령·소유권·개체 경계는 별도 검증 |
| 저장·다운로드·재열기 | core save → bytes; 형식별 writer; `apps/demo/src/save-policy.ts` | b7의 독립 저장/이력 검사, 빠른 undo 독립 다운로드 2사례 | 부분 | HWP5의 `allowStaleLayout` 동의와 원본 보호 정책 유지. 모든 필드·metadata·조판 무손실 보장 아님 |
| 실행 취소·다시 실행 | core undo/redo/getHistoryAvailability; `src/model/history_stack.zig`; `web/preview/history-input-intent-queue.mjs` | 빠른 undo 72, 이력 바닥 4, 독립 다운로드 2의 각각의 기록 | 구현·검증 | 실제 OS IME·세대 교체·모든 거래 조합은 별도 |
| 기본 plain text 붙여넣기 | getSelectionClipboard/typed splice; `apps/demo/src/clipboard-bridge.ts`; 기존 Canvas 입력면 | 공개 native paste 6조합 | 구현·검증 | rich clipboard·객체·cross-owner·모든 OS 검증 확대 |
| 선택·caret·UTF-16 타깃 | core SelectionTarget/setSelection; Native owner/token; Canvas surface | 정적 계약과 위 UI 사례 | 부분 | 원본 WCHAR 좌표와 display 좌표를 혼용하지 않고 전 범위 검증 |
| 글자 크기·bold·italic·밑줄·취소선 | core typed character/underline/strike 명령; `src/wasm`; `apps/demo/src/formatting-bridge.ts` | public 소스 확인, 과거 개별 서식/독립 저장·E2E 기록; 취소선은 공개 G2에서 원본 비어 있지 않은 선택의 Boolean on/off·readonly 거부·저장/재열기 확인 | 부분 | 전체 글자 속성·모든 source shape의 typed 공개와 같은 최신 snapshot 검증. 취소선 caret 다음 입력 서식은 미지원; 필드 내부·원본 한/글 시각 동치는 미검증 |
| 문단 정렬 | core `SET_PARAGRAPH_ALIGNMENT_COMMAND`; 형식별 문단 속성; formatting bridge | public 소스 확인과 한정된 과거 서식 검사 | 부분 | 여백·간격·split/join 등 전체 문단 명령군 공개 |
| 찾기·바꾸기·통계 | core text-tools/query와 setSelection/splice; `apps/demo/src/text-tools-bridge.ts` | snapshot 기반 literal 검색 계약, 과거 UI 표본 | 부분 | 긴/windowed 문서의 완전성, regex·전체 replace transaction은 별도 |
| 필드·양식 | `js/hwp5-editor.mjs`, `js/hwpx-editor.mjs`에 저수준 기반; 전용 typed public 필드 계약은 미제공 | `docs/headless-api-coverage.md`, 과거 private field E2E는 해당 후보만 | 부분 | 필드 ID/중복명/보호/양식별 조회·명령·이력과 실제 UI 승격 |
| 표·셀 구조 | 형식별 표 생성/크기 저수준 경로; generic public splice/서식과 구분 | 개별 표 계약·과거 검사, public API 정적 대조 | 부분 | typed table/cell target·행열·병합·중첩·새 셀·Canvas 연결 검증 |
| 그림·도형·차트 | 형식별 source/query/edit, 제한된 Canvas 표시; `apps/demo/src/command-support.ts`의 메뉴 목록은 실행 증거가 아님 | 개별 주제 보고서와 public inventory | 부분 | 객체별 public identity/resource/명령과 독립 저장·E2E |
| 수식 | `src/equation`, WASM 배치 API와 HWPX Canvas 경로 | `docs/hwpx-equation-rendering.md`의 별도 과거 후보 사례 | 부분 | HWP5 연결, 남은 명령 의미·원본 폰트·전체 조판 동치 검증 |
| 웹 Canvas와 framework | `packages/vanilla`, `packages/react`, `packages/svelte`; 기존 `web/preview/renderer.mjs` 공유 | 위 6조합 paste/undo 사례. 과거 SSR·빌드 성공은 별도 | 부분 | 모든 메뉴·브라우저·접근성·전체 페이지/픽스쳐 E2E |
| RN 네이티브 provider/JSI | `packages/react-native/src/index.ts`, `cpp/NativeContextJsi.cpp`, `src/native/abi.zig` | 실제 Hermes host 60 checks. fake transport와 syntax compile은 별도 | 부분 | 공통 display projection, 앱 등록·release 패키징, 네이티브 Canvas/JSI 연결·실기기 build/E2E |
| 실제 OS 한글 IME | core input lease와 Canvas 조합 이벤트 기반 | fast-undo 보고서의 CDP 관측은 compositionend 신뢰 조건 미충족, osImeVerified=false | 미검증 | 실제 OS 입력기 조합·확정·취소·undo/redo와 플랫폼별 수명 검사 |
| pending 중 파일 교체 | core admission과 `apps/demo/src/document-admission.ts` | 교체 요청이 기존 admission에서 차단되어 Native load 0건 관측 | 미검증 | 실제 새 세대 활성화·진행 작업 취소 E2E. 차단 관측을 교체 성공으로 계수하지 않음 |
| Enter 상속·Company 보호 후속 | 준비 소스/격리 후보; 현재 공개 3fc 배포 및 과거 b7 감사와 분리 | 후보별 근거만 유효; 현재 배포 포함 여부·동일 snapshot 실행은 이 문서 조사에서 확인하지 않음 | 미검증(공개 배포의 해당 기능) | 정식 통합·배포와 동일 snapshot 독립 저장·UI 검증 |
| 탭/머리말 oracle 보완 | 기존 verifier를 재사용한 격리 후보. Native/제품 코드 변경 아님 | `zig-out/verification/oracle-closure-current/REPORT.md`; 동결·미적용 | 미검증 | 부모의 정식 적용 검토 이후 새 verifier 결과로 기록. 기존 b7 oracle 미지원 132를 소급 변경하지 않음 |
| 전체 HWP5/HWPX 의미·조판·편집 | 포맷 코어·모델·WASM·scene·Canvas를 단계적으로 연결 | `docs/fixture-editor-completion.md`와 b7 미완료 결과 | 부분 | 모든 필드·임의 위치·모든 명령·원본 한/글 조판 및 실제 UI 전수 증명 |
| PDF/bitmap export·인쇄 | 전용 typed public 메서드 미제공. host 책임과 구분 | public export 정적 대조 | 미구현 | export 계약·폰트·페이지 조판·독립 비교 |
| 재사용 clear/new·메타·호환 facade | dispose는 terminal이며 clear/new와 다름. 범용 public 메타/HwpCtrl Action facade 미제공 | public API inventory | 미구현 | 기능별 명시 계약·실물 검증; 기존 HwpCtrl와 동일 시그니처를 약속하지 않음 |

원래 장시간 Trace0 Debug failure sweep는 프로세스·handle이 사라졌지만 최종 `TIMING-EXIT`가 없어 **종료 미확인/미검증**입니다. 중간 진행이나 프로세스 부재를 통과 수에 넣지 않습니다.

## 구 Rust 문서와의 차이

구 Rspress 소스의 `_nav.json`, 가이드·API 인덱스, legacy README와 문서 본문에서는 별도의 roadmap 문서를 발견하지 못했습니다. 과거 공개 사이트의 Rust 변환기 설명과 경로 조사 결과는 당시 배포의 기록입니다. 현재 이 사이트는 새 문서로 교체됐고 `/roadmap`은 이 페이지입니다. 구 CLI 안내는 [보관된 Rust CLI 소스](https://github.com/ohah/hwpjs/blob/main/legacy/rust/documents/docs/guide/cli.mdx)에서 확인하세요. 구 변환 CLI를 새 Zig/WASM의 실행 명령으로 안내하지 않습니다.

따라서 다음 표는 발견한 **구 지원 목록/확장계획과의 대조**입니다. 새 로드맵의 완료 이력을 복원한 것이 아닙니다. [보관된 Rust README](https://github.com/ohah/hwpjs/blob/main/legacy/rust/README.md), [구 Rspress 지원 목록](https://github.com/ohah/hwpjs/blob/main/legacy/rust/documents/docs/guide/index.mdx), [구 뷰어 확장 설계](https://github.com/ohah/hwpjs/blob/main/legacy/rust/docs/design/viewer-architecture.md)는 legacy 참고 자료입니다.

| 구 명시 항목 | 현재 대응 위치·차이 | 검증 근거·범위 | 판정 | 남은 일 |
| --- | --- | --- | --- | --- |
| `@ohah/hwpjs`·Node NAPI-RS `.node` | 외부 canonical 경로는 새 `@ohah/hwpjs`와 하위 경로, 내부 구현은 `@hwpjs/*`. 구 npm 패키지/바이너리 계약을 계승하지 않음 | package exports 정적 대조; 과거 tarball 소비와 registry 공개 설치는 별도 | 부분 | 새 패키지별 배포/호환 정책과 소비자 검증 |
| Web WASI threads | 현재 `wasm32-freestanding` ABI, WASI preview1 threads runtime과 다름 | 빌드 타깃·ABI 소스 대조 | 미구현 | 구 WASI 계약의 호환 구현을 약속하지 않음 |
| RN Craby·iOS/Android 자동 설정 | 현재 별도 provider/JSI 주입, 네이티브 Canvas 방향. 구 Craby export·자동 연결은 현행 계약 아님 | host JSI는 앱·실기기 검증과 다름 | 부분 | Native 패키징/공통 scene/입력·실기기 검증 |
| JSON `toJson` / `parseHwp` 페이지 | 현재 state 관측/형식별 reader는 문서 전체 JSON 문자열 API가 아님. parseHwp 페이지 본문도 toJson임 | `packages/core/src/index.ts` 정적 대조 | 미구현 | 문서 전체/부분 스키마·export·독립 검사 |
| `toMarkdown` | 현재 Canvas/편집 API에는 같은 export가 없음 | public export 부재. 구 Rust 성공 수는 계승하지 않음 | 미구현 | Markdown renderer와 명시 지원 범위 |
| Markdown `image: base64/blob`, images 배열, RN base64 한정 | picture bytes/Canvas resource와 구 변환 결과 구조는 별개 | 구 API 옵션·현재 exports 대조 | 미구현 | 이미지 배열·MIME·소유권·플랫폼별 반환 계약 |
| Markdown useHtml/includeVersion/includePageInfo/imageOutputDir | 동일한 변환 옵션 미제공 | 구 API·현재 exports 정적 대조 | 미구현 | 해당 옵션과 출력 파일 I/O·페이지 의미 검증 |
| Markdown 텍스트/제어 제거/공백 정규화/표/그림/글상자/머리말/꼬리말/하이퍼링크 | 관련 읽기·Canvas 기능은 있으나 Markdown 출력 완료가 아님 | 구 가이드·API·viewer 문서 대조 | 미구현 | 출력 의미·escaping·빈 셀·주석·이미지 비교 |
| `toHtml`과 완전 HTML/CSS/CharShape 매핑 | Canvas 장면/웹 앱 HTML과 문서 HTML 변환은 다름 | 현재 typed export에 없음 | 미구현 | 문서 HTML renderer·독립 결과 비교 |
| HTML imageOutputDir/htmlOutputDir/includeVersion/includePageInfo/cssClassPrefix | 동일 옵션 미제공 | 구 toHtml 옵션·현재 API 대조 | 미구현 | 이미지 파일/상대경로·CSS·페이지 계약 |
| `fileHeader` JSON 문자열 | `src/hwp5/file_header.zig`에 원값 parser는 있지만 같은 public 함수는 없음 | 원값/ABI와 public inventory 분리 | 부분 | signature/version/압축/암호/기타 속성의 typed 조회·오류 계약 |
| ParaText.text/control_char_positions/runs | 형식별 source·Native 모델과 display UTF-16 타깃 유지. 구 Rust JSON schema는 미제공 | 원본 control과 표시 캐시·좌표계 분리 계약 | 부분 | 구 schema 호환성 및 원본/display 변환 전체 검증 |
| CLI to-json / to-markdown / to-html | 기존 감사 스크립트는 이 변환 CLI 제품이 아님 | 현행 package bin/export·변환 API 대조 | 미구현 | CLI·옵션·stdout/파일 출력·오류 계약 |
| CLI info / extract-images / batch | 정식 대응 CLI 미제공 | 현행 source/package 대조 | 미구현 | JSON info, 형식 필터, 재귀·배치 오류/덮어쓰기 정책 |
| CLI pretty/use-html/include-images/include-version/include-page-info/images-dir/format/recursive/help | 각 옵션의 현행 CLI 계약 없음 | 구 CLI 문서의 명시 옵션 inventory | 미구현 | 명령별 옵션 조합과 외부 소비자 실행 검증 |
| Rust Renderer trait와 공통 bodytext/paragraph/table 계획 | Zig 포맷 코어·ABI·JS scene·Canvas로 책임 분리. Rust 모듈 이름을 그대로 이식하지 않음 | `docs/architecture.md`, `docs/project-structure.md` 정적 대조 | 부분 | 모든 소유권·컨트롤·표/페이지 흐름 지원 확대 |
| Document Markdown 26/46 → 46/46 뷰어 교체 | 구 Rust viewer 출력 비교 목표. 새 Zig의 완료 분모가 아님 | legacy viewer 설계의 역사 수치만 확인 | 미구현 | 새 변환기 범위·동일 입력 비교 기준 수립 |
| 남은 Markdown 표 빈 줄/trailing 2-space/번호 format_string/각주·미주 위치/이미지 출력 | 현행 Markdown export가 없어 해결됐다고 계수하지 않음 | legacy viewer의 명시 남은 작업 | 미구현 | 항목별 출력 구현과 독립 회귀 |
| 공통 Document HTML·URL/MIME/BinaryStore/CSS font 유틸리티 | 현행 source/resource/Canvas 기반은 있으나 구 Document renderer/API 호환은 아님 | 형식별 source와 구 설계 대조 | 부분 | 변환기 공개와 의미·escaping·ID 관계 검증 |
| Canvas viewer 예정 | 실제 Canvas 표시·입력 연결이 존재 | 위 UI 사례만 확인 | 부분 | 모든 조판·명령/bitmap export·플랫폼 전수 검증 |
| PDF viewer 예정 | 전용 public PDF export 없음 | public inventory | 미구현 | PDF 생성·폰트·레이아웃 계약 |
| 배포용 문서·차트 명세 내용 준비 중 | legacy 설명 문서가 비어 있다는 사실은 엔진 미구현 판정과 다름 | 구 spec 본문과 현재 모듈·정책 대조 | 부분 | 새 문서에 실제 지원/보호/미해석 범위를 정확히 설명 |
| HWP3 명세 링크 | 현재 HWP3는 사용자 제외 | 프로젝트 범위 정책 | 사용자 제외 | 지원 완료율/미지원 분모에 넣지 않음 |

명세서의 자료형·수식 문법이 문서에 있다는 사실을 해당 형식의 모든 필드·모든 명령 구현으로 계수하지 않습니다. 구 Rust NAPI·Craby·WASI·npm 바이너리의 통과를 새 Zig/WASM 지원으로 가져오지 않습니다.

## 다음 완료 게이트

일정 대신 필요한 계약과 검증 결과로 단계를 닫습니다. 기존 저수준 기능을 공개할 때도 Native 모델·보호 권한·저장 SSOT를 유지합니다.

| 다음 작업 | 필요한 public/엔진/UI 연결 | 완료에 필요한 증거 |
| --- | --- | --- |
| 필드·양식 | typed inventory/identity/선택/값 변경과 양식별 capability | 두 형식 실제 필드·중복명·보호·이력, 필드 외부 내용/리소스 독립 저장 보존 |
| 표·셀 구조 | table/cell target, 생성·행열·크기·병합 범위 명시 | 실제 표·중첩·새 셀, 비대상 내용·이력·재열기와 실제 UI |
| 문자·문단 확장/구조 | 글꼴·색·split/join 등 typed 승격 | 실제 혼합 서식/필드/보호 경계, source+command 독립 XML/CFB와 trusted UI |
| 객체·media | 그림·차트·수식부터 개별 typed query/mutation | 관계/BinData·비대상 내용·배치 보존. OLE 표시와 active 실행은 별도 |
| 문서 전체 관측·조판·export | complete/partial 텍스트 순회·typed 페이지·형식별 export | windowed 누락 검출, 원본 글꼴·줄/표/페이지 비교. PDF/bitmap/인쇄 별도 |
| RN 네이티브 앱 | 공유 provider/scene·JSI·Native Canvas·실제 입력면 연결 | iOS/Android release build, 소유권/취소/재시작, 실제 기기 입력·저장·IME E2E |
| 검증기 공백과 최신 gate | oracle 후보 정식 적용 검토, 동일 source/runtime/WASM 고정 | 독립 양·음성 검사와 종료 증거. 과거 미지원 집계의 소급 덮어쓰기 금지 |

## 근거 위치

상세 계약은 아래 저장소 문서가 소유합니다. 이 페이지의 상태표는 별도 기능 명세를 복제하지 않습니다.

| 근거 | 저장소 경로 |
| --- | --- |
| 공개 API 경계 | `packages/core/src/index.ts`, `packages/core/src/commands/commands.ts`, `docs/headless-api-coverage.md` |
| b7 전수 종료·고정 입력 | `zig-out/verification/b7-full-headless-20261025/summary.json`, `manifest.json`, `core-dist-snapshot/` |
| 최신 빠른 undo/기기 한계 | `zig-out/verification/editor-input-integration/fast-undo/report.json` |
| 공개 기본 paste 6조합 | 같은 fast-undo 디렉터리의 `public-native-paste-matrix.log` |
| RN 실제 host 검증과 미완료 항목 | `packages/react-native/cpp/probe/VERIFICATION.md`, `packages/react-native/src/native/INTEGRATION.md`, `zig-out/verification/noori-current/hermes-context/evidence.json` |
| 기능별 과거 실행과 전체 완료 기준 | `docs/headless-editor-verification.md`, `docs/fixture-editor-coverage.md`, `docs/fixture-editor-completion.md`, 각 주제 문서 |
| 이번 정적 대조의 항목별 표/탐색 결과 | `zig-out/verification/rspress-roadmap-audit/MATRIX.md`, `matrix.json`, `legacy-inventory.json`, `public-discovery.json`, `REPORT.md` |

검사 소스 존재, 빌드 성공, 실제 브라우저 사례, 특정 위치의 독립 저장, 형식 전체 지원은 서로 구분해서 읽어야 합니다. 특히 미지원 oracle와 입력 대상 부재가 남은 b7 감사의 exit1을 전체 성공으로 표시하지 않습니다.

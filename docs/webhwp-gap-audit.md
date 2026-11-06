# 웹한글 기안기 대비 누락·부분 지원 점검

2026-11-06, 기준 HEAD `526a5e3ab6503de7e8ecd20b432396a2fd0a00b0`. 비교한 운영 제품은 `dee6af274`이며 공개 manifest `84062334de4a16965782807d10b5b51c80a2fad98dea6403d46516c6d34bccea`를 확인했다. 공식 기준은 [WebHwpCtrl 공개 데모](https://webhwpctrl.cloud.hancom.com/webhwpctrl/)다. UI 비교의 이전 기록은 [공식 화면 대조](webhwpctrl-ui-reference.md), 공개 API와 계층 책임은 [API 지원표](headless-api-coverage.md)가 소유한다.

## 범위와 판정

공식 기본 빈 문서의 메뉴·속성 창을 직접 열었고, UI로 2×2 표를 만들어 표 메뉴의 활성 상태도 확인했다. 사용자 문서 업로드·로그인·기존 쿠키·저장·인쇄 전송은 사용하지 않았다. 글자/문단 모양, 편집 용지, 새 번호로 시작은 실제 창을 관측했고, 인쇄는 메뉴 표시만 확인했다. 공식 한 샘플의 조사로 모든 버전·선택 조건과 전체 옵션 실행을 검증한 것은 아니다.

공식과 Shell의 직접 메뉴 진입을 대조한 후보는 19행이고, 별도 소스/API 감사는 20개 기능군이다. 두 수는 겹치며 합산한 미구현 기능 수가 아니다. `UI 없음`, `아이콘은 있으나 callback 미연결`, `공개 typed API 부족`, `대상/형식별 제한`, `실제 오류`, `미관측`을 구분한다. 읽기·표시·ABI 함수 존재를 생성·편집·저장 지원으로 계산하지 않는다.

## 실제로 재현한 통합 결함

감사 기준 버전의 React/Svelte 데모는 `apps/demo/src/main.ts`의 어댑터에서 `captureCaretFormatting`을 전달하지 않았다. 계약은 `surface-formatting-port.ts`, 구현은 Vanilla Surface가 소유한다. 같은 fake Surface/포트셋으로 호출1회/0회 차이를 확인하고 운영 화면에서도 별도로 재현했다. 위임 추가 이후의 상태는 아래 후속 검증을 따른다.

Noori HWP5의 동일 ‘국민’ 범위0..2에서는 두 프레임워크의 크기·굵게·기울임이 활성이다. ArrowRight로2..2 캐럿을 만들면 세 도구가 `EmptyCharacterSelection`으로 비활성이 된다. Vanilla 같은 문맥은 활성이고17pt 의도·실제 입력이 된다. React/Svelte의 일반 R/S 입력·undo는 정상이며, 비활성 도구를 강제로 실행하지 않았다. 이는 프레임워크 데모의 다음 입력 서식 연결 누락이고, 전체 React/Svelte 편집 또는 Native 실패라는 뜻은 아니다. React/Svelte HWPX는 미관측이다.

## 확인된 주요 차이

| 영역                       | 현재 차이                                                                                                          | 확인 범위와 소유 계약                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 초기 빈 문서·재사용 초기화 | 제목 ‘새 문서’와 실제 편집 세션 생성은 다르다. new/clear public API가 없고 `dispose`는 terminal이다                | 공식 기본 문서에서 표 생성 성공, 제품 초기 미로드 상태는 별도 실제 관측. 공식 파일 메뉴에 새 문서 항목이 있다고 주장하지 않음  |
| 다음 입력 서식             | 캐럿은 크기·굵게·기울임·단일 언어 글꼴 의도만 지원. 대표 일곱 언어·밑줄·취소선·글자색은 같은 경로에 없음           | 기존 글자 범위 적용과 구분. [캐럿 계약](collapsed-caret-formatting.md)                                                         |
| 형식·소유자별 편집         | HWP5 생성 문단 서식의 original-only guard, 생성 셀의 별도 Surface, 단일 Core target과 다문단 Surface 경계가 남음   | HWPX에 같은 HWP5 guard가 없다는 사실만으로 모든 생성 대상 쓰기 성공을 추정하지 않음. [선택·편집 API](headless-api-coverage.md) |
| 모두 바꾸기·고급 찾기      | 모두 바꾸기는 항상 비활성. 현재 관측 snapshot의 literal 검색·선택 한 곳 교체이며 전문서 scan/원자 일괄 교체가 아님 | [텍스트 도구](headless-text-tools.md)                                                                                          |
| 표의 구조 편집             | 줄·칸 추가/삭제, 셀 나누기·합치기, 높이/너비 같게, 블록 계산식·숫자 표시의 별도 메뉴/typed 명령이 없음             | 공식 생성 표에서 일부 메뉴 활성, 병합·균등·계산은 복수 셀 선택을 하지 않아 실행 미관측. Native 내부 전체 부재는 판정하지 않음  |
| 셀 테두리·배경             | 현재 셀 속성 포트는 원본 셀 크기·공유 열 너비이며 셀 전체 테두리/배경 편집과 다름                                  | 문자/문단 배경 patch와 구분. [원본 셀 계약](headless-original-cell-formatting.md)                                              |
| 용지·쪽·단                 | 편집 용지, 새 번호 시작, 현재 쪽 감추기, 쪽/단 나누기, 다단 설정의 직접 메뉴/typed 명령이 없음                     | 용지·새 번호 창은 공식에서 실제 확인. page-settings 조회 ABI를 writer로 해석하지 않음                                          |
| 쪽 상태                    | 데모 pageLabel은 ‘문서 열림’이며 공식의 쪽/구역 상태와 다름                                                        | 가시 쪽·캐럿 쪽·원본 쪽 번호의 의미도 분리해야 함                                                                              |
| 문단 번호·글머리표·수준    | 번호/글머리표 모양과 한 수준 증가·감소의 직접 메뉴/typed 명령이 없음                                               | 문단 정렬6종과 여백/간격 patch가 목록 구조 편집 전체를 뜻하지 않음                                                             |
| 새 개체 생성               | 그림·도형·차트·각주/미주·머리말/꼬리말·링크의 insert-* registry 항목이 있어도 controller callback은 미연결         | 기존 그림 크기 편집, 차트 값 wire, 기존 각주 선택을 새 개체 삽입으로 계산하지 않음                                             |
| 글상자·필드·캡션·문단 띠   | 공식 입력 메뉴에 있지만 자체 직접 명령이 없음                                                                      | 기존 필드/도형 데이터 읽기·부분 편집과 새 생성은 별도                                                                          |
| 개체 속성                  | 기존 선택 그림의 너비/높이 편집에 제한. 위치·회전·어울림 전체가 아님                                               | [그림 선택·속성](canvas-picture-selection.md)                                                                                  |
| 보기                       | 투명선·도구상자 토글 명령 부재, 격자는 registry만 있고 view bridge에 미연결                                        | 조판/문단 부호와 배율은 연결돼 있음. [부호 표시 범위](canvas-formatting-marks.md)                                              |
| 인쇄·PDF·페이지 이미지     | 데모 명령과 전용 public API가 없음                                                                                 | host 책임. 공식 인쇄 메뉴는 확인했으나 인쇄 창·실제 출력은 미관측. Native PDF 생성 부재까지 판정하지 않음                      |
| 클립보드·모양 복사         | copy/cut의 다문단 Surface 경로와 paste의 Core selection 경로가 다름. 모양 복사는 미연결                            | rich/object clipboard 및 다중 target transaction을 단일 텍스트 splice로 대체했다고 주장하지 않음                               |

## 누락으로 계산하지 않은 기능

표 삽입은 `INSERT_TABLE_COMMAND`와 데모 창에 이미 연결돼 있다. 원본 셀 크기·공유 열 너비도 전용 경로가 있다. 확장 글자/문단 모양은 `APPLY_FORMATTING_PATCH_COMMAND`, `getFormattingCapabilities`, `queryFormatting`과 UI descriptors가 연결돼 있다. 장평·자간·음영 등 공식 창에서 본 필드 전부를 자체 누락이라고 판정하지 않는다. 실제 필드별 known/writable·타깃·형식과 저장 성공은 별도 검증 범위다.

‘대표’는 글꼴 적용 언어이며 스타일명이 아니다. 이번 공식 관측에 별도 스타일/F6 창이 없었으므로 스타일 기능 누락의 근거로 쓰지 않는다. 표/글자/문단 기능을 저수준만 또는 후속 공개로 표시한 과거 API 지원표는 현재 계약에 맞춰 선택 정정한다.

## 산출물 세대와 반례의 구분

활성 UI → `sdk/current/core.js` → `assets/core-index.js`를 확인했다. runtime export 집합32개가 소스와 같아도 내부 동작이나 전체 기능의 동등성을 뜻하지 않는다. 활성 Worker는 c266 세대, WASM은 `ede6256ef063765cfb1f4489d2bece3a971aa715041c993fec87d4eb374855fa`다. 로컬 dist의 d849 엔진과 이 활성 세대를 혼합하지 않는다.

추적된 stale-capture 캐럿 시험은 로컬 dist에서15pt 대신 미관측이 되어 실패했다. 같은 시험을 HEAD Core 소스 및 활성 공개 JS 경계의 통제 Runtime에서 실행하면 통과했다. 활성 JS·직접 의존 chunk와 HTTP pin도 대조했다. 이 결과는 오래된 로컬 결과물 문제이며 배포된 Core의 동일 버그 재현으로 보고하지 않는다. 통제 Runtime 성공은 실제 Native·브라우저의 동일 경합 검증과 별개다.

## 검증과 근거

공식 관측, 소스/API 감사, 다섯 위험축의 반례 검사, 운영 브라우저의 대상별 가용성 검사를 분리한다. 상세 원자료는 `zig-out/verification/webhwp-gap-audit-r2/`의 `BASELINE.json`, `reference/GAP-CANDIDATES.md`, `reference/INVENTORY.json`, `api/REPORT.md`, `delivery/ACTIVE-EXPORTS.json`과 후속 적대적 검증 보고서가 소유한다. ignored 원자료를 공개 링크로 제공하지 않는다.

공식 메뉴 순회·인쇄 시도의 실패와 관측 한도 종료를 보존했다. 실제 표 생성 뒤 활성 메뉴 확인을 paint 전 빈 프레임 성공으로 대체하지 않았다. 공식 인쇄창·번호의 표시 위치·스타일 창·복수 셀 병합은 이번에 실행 완료로 보고하지 않는다. 감사 단계에서는 제품 코드·SDK·Native·운영 서버를 변경하지 않았다. 다음 어댑터 수정과 새 번들 검증은 별도 후속 단계다. 같은 문서를 공식에 업로드한 픽셀 조판 동치 비교도 수행하지 않았다.

### 다섯 위험축의 결과

- **캐럿/범위·프레임워크:** Vanilla HWP5/HWPX에서 같은 원본 셀의 범위는 밑줄·취소선·색상 활성, 캐럿은 각각 `CaretTyping*Unavailable`이었다. 크기·굵게·기울임은 활성이다.17pt 의도를 설정해도 원문은 바뀌지 않고 Z 입력 뒤17pt를 확인했다. undo 뒤 원문과18pt를 확인했다. 다음 입력의 대표 일곱 언어 글꼴 적용도 확인/입력이 비활성인 제한을 HWPX 창에서 관측했다.
- **생성 범위와 소유권:** Enter+Y로 만든 범위는 HWP5에서 readonly18pt와 `UnsupportedFormattingReference` 쓰기 거부, HWPX에서는 쓰기 활성이다. 정확한 source owner를 조회하지 않았으므로 본문/원본 셀 내부 새 문단/생성 셀 중 하나로 추정하지 않는다. 저장·재열기·독립 Native 서식 oracle은 이번에 실행하지 않았다.
- **셀·문단 가용성:** 실제 ‘국민’ 위치는 원본 셀이고, HWPX 셀 창에서479.07×125.78pt와 선택 셀/공유 열 범위를 관측했다. 그 위치의 셀 속성 버튼 활성은 정상이다. 별도 통제 fixture의 일반 body·셀 ABI 부재에서는 메뉴가 enabled여도 적용이 거부되고 mutation0이었다. 이를 운영 body 선택의 오류 재현으로 합치지 않는다.
- **클립보드·모달·단축키:** 다문단 copy/cut Surface 경로, canonical selection 없는 paste 거부, stale·busy·IME와 대화상자 수명을 명시 시험으로 검사했다. OS rich clipboard·실제 다문단 Native paste·모든 단축키를 검증한 것은 아니다. 로컬 test harness와 CSS preload/JSON import 진입 실패는 제품 실패와 분리했다.
- **초기화·세대 차이:** 초기 제목은 ‘새 문서’지만 실제 클릭+Q 입력에서 proxy는 비었고 명령은 no-document였다. 공식 기본 문서에서 표 생성 성공과 구분해 비교한다. root caret/multiblock의88통과·1실패는 오래된 local dist의 stale-capture 실패를 포함하며, 같은 caret16개는 현재 소스와 활성 공개 JS에서 각각16통과했다. 같은 시험의 반복 cohort를 합산하거나 전체 suite 성공으로 보고하지 않는다.

이전 runner의 `body` 파일명은 원본 셀 관측을 잘못 이름 붙인 것이며 판정을 정정했다. 명칭이 final인 session-info도 실제로는 pre-close 자료여서 종료 근거에서 제외했다. 최종 `adversarial/CLEANUP.json`은 현재 `active:false`, `pid:null`, 소유 profile 프로세스0을 별도 확인한다. 공식·제품 브라우저는 순차 한 개씩 사용했고 모두 종료했다. 운영 서버와 기존 사용자 변경은 보존했다.

### 다음 구현 우선순위

1. React/Svelte 어댑터의 캐럿 전달과 범위/다문단/캐럿의 일관된 명령 가용성부터 맞춘다. 이미 가능한 Vanilla 동작을 다른 프레임워크에 동일하게 연결하는 결함 수정이다.
2. 다음 입력의 밑줄·취소선·색·대표 글꼴과 생성 HWP5 범위의 공개 계약을 확장한다. 원본 참조를 위조하거나 Native ACK 대신 UI 상태만 바꾸지 않는다.
3. 셀 테두리/배경과 기존 표 구조 편집, 용지/쪽/단/번호, 신규 개체 삽입은 각각 기존 포맷 모델·writer·history와 공개 명령을 연결하는 별도 기능이다. 아이콘을 활성화하는 것으로 완료하지 않는다.
4. 모두 바꾸기는 전문서 탐색 범위·지원하지 않는 owner·UTF-16 경계·하나의 이력/실패 원자성까지 정한 뒤 연결한다. 인쇄/내보내기는 host 출력과 실제 페이지·조판 범위를 명시해야 한다.

## 후속 어댑터 수정

확정한 React/Svelte 연결 누락은 `main.ts`의 두 어댑터에 `captureCaretFormatting` 위임을 추가하는 것으로 수정한다. React는 매 호출의 `ref.current.surface`, Svelte는 최신 `onReady` Surface를 읽고, 없으면 null을 반환한다. 이미 발급된 캡처의 값·권한·수명은 원래 Surface가 계속 소유한다. 선택을 합성하거나 캡처를 캐시하지 않으며 Native ACK를 새로 만들지 않는다. 속성 읽기/위임은 상수 시간이다.

같은 실제 host factory와 동일한 통제 Surface를 사용한 수정 전 검사에서 Vanilla만 호출1회, React/Svelte는0회였다. 수정 후 세 경로가 각각1회 같은 포트에 위임했다. 실제 패키지 소스 타입 경계의 strict 검사와 lint·format·transpile은 통과했다. 다만 오래된 설치 dist 타입 경계는 수정 전26개, 수정 후28개 진단으로 실패한다. 추가2개는 새 caret 메서드를 모르는 오래된 선언이며, 캐스트·임시 선언으로 숨기지 않았다. 전체 저장소/설치 SDK 타입 검사가 모두 통과했다는 뜻은 아니다.

이 통제 검사로 실서비스 성공을 선언하지 않는다. 고정된 기존 SDK·Worker·WASM을 재사용해 UI 번들만 만들고 React/Svelte × HWP5/HWPX 네 사례에서 실제 다음 입력 서식·실행 취소·포커스를 확인해야 한다. 이 수정은 위19개 직접 메뉴 후보와 다른 고급 기능을 구현하는 작업이 아니다. 후속 근거는 `zig-out/verification/framework-caret-forwarding-fix-r1/HANDOFF.json`이 소유한다.

후속 첫 후보 번들에서 React/Svelte × HWP5/HWPX 네 사례를 실제 브라우저로 실행했으나, 찾기 결과0..2에서 오른쪽 화살표로 캐럿2..2를 만든 뒤 크기·굵게·기울임이 모두 `EmptyCharacterSelection`으로 비활성인 상태가 남았다. 각8초 대기 뒤에도 동일했다. 선행 가용성 조건을 통과하지 못해 다음 입력 서식과 undo 단계는 실행하지 않았다. 이 후보는 배포하지 않았으며, 소스 검사·위임 테스트 통과를 제품 수정 완료로 해석하지 않는다.

후보 HTML과 실제 HTTP entry, 소스 맵의 두 위임 메서드 및 단일 Surface 구현을 대조해 오래된 진입점과 중복 Surface 가설을 제외했다. 실패 원본은 같은 경로의 `qa/browser-r1/QUICK-HANDOFF.json`과 `REPORT.md`에 보존한다. 기존 운영 제품은 유지한다.

추가 실제 React HWP5 진단에서 캐럿2..2를 유지한 채 글꼴 적용 언어만 대표→한글로 바꾸자 크기·굵게·기울임이 즉시 활성화됐다. 대표로 되돌려도 유지됐고 본문·캐럿·이력 가용성·state trace는 변하지 않았다. 이는 문서 수정 없이 shell presentation을 갱신한 결과다. 소스에서는 Core가 등록 순서대로 listener를 동기 호출하며, 비동기 React/Svelte 마운트에서 앱 listener가 Surface보다 먼저 등록될 수 있음을 확인했다. 따라서 새 Core state와 아직 관측하지 않은 Surface를 함께 읽어 가용성을 거부한 뒤 재갱신하지 않는 경로가 성립한다. 브라우저에서 listener 순서를 직접 계측한 것은 아니다. 진단 원본은 `qa/diagnostic-shell-refresh-r1/RESULT.json`과 `REPORT.md`에 보존한다.

두 번째 수정은 상태 observer의 shell 표시 갱신만 `presentation-refresh.ts`로 분리해 동기 observer 순회가 끝난 뒤 한 microtask에서 최신 상태를 다시 읽는다. 같은 알림 묶음은 한 번으로 합치며 요청당 시간·보관 공간은 O(1)이다. Native 작업·선택 게시·Surface 검증 조건은 바꾸지 않는다. 처음 예약한 요청만 Promise를 반환해 기존 Core 오류 채널로 전달하고, 중복 오류 통지를 피한다. 갱신 전 pending을 해제해 재진입·오류 후 복구를 허용하고, dispose와 closed guard로 종료 후 표시 갱신을 차단한다.

실제 controller·shell·서식 bridge와 통제 Runtime을 연결한 늦은 Surface observer 회귀는 수정 전 실패하고 수정 후 통과했다. 이 회귀와 순서/병합/종료/재진입/오류 시험6개, 별도 기존 캐럿 계약16개, 소스 strict·lint·포맷을 통과했다. 이는 Native·브라우저 성공과 구분하며 두 번째 UI 후보의 실제 검증은 별도다. 소스 동결 근거는 `zig-out/verification/framework-caret-presentation-fix-r2/HANDOFF.json`이 소유한다.

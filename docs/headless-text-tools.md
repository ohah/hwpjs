# 헤드리스 텍스트 도구

공개 `@hwpjs/core`는 `createParagraphSelection`, `findTextMatch`, `selectionMatchesText`, `getDocumentTextStatistics`, `getSelectionClipboard`를 제공합니다. DOM이나 OS clipboard를 요구하지 않습니다. 원본 문서·저장·이력은 Native 세션이 계속 소유하고, 이 함수들은 현재 `EditorState` 관측값을 읽습니다.

찾기는 현재 불러온 표시 텍스트의 리터럴 검색입니다. 기본 API는 선택 끝부터 앞으로 순환하며, 세 번째 `FindTextOptions` 인자로 `direction:'forward'|'backward'`, `wrap:boolean`, `origin:'selection'|'document'`를 지정할 수 있습니다. 뒤로 찾기는 선택 시작 이전에서 끝나는 일치를 찾고, document origin은 방향에 따라 관측 범위의 첫/마지막 문단부터 시작합니다. 반환되는 타깃은 UTF-16 좌표와 문서 토큰을 가지므로 `editor.setSelection(target)`에 전달할 수 있습니다. 잘못된 scalar 쿼리·중복 문단 식별자·알 수 없는 옵션은 거부하고, 잘리거나 소유자를 정할 수 없는 문단은 검색 대상에서 제외합니다. 미로딩 문단까지 검색했다고 해석하지 않습니다. 정규식·문단을 가로지르는 검색·전체 바꾸기는 아직 제공하지 않습니다.

데모의 아래로/위로는 각각 forward/backward와 `wrap:false`를 사용합니다. 방향 경계에서 자동 순환하지 않고 사용자에게 계속 찾기 단추를 제공합니다. 선택·쿼리·방향이 변경된 이전 확인은 재사용하지 않습니다. ‘문서 전체’는 현재 선택 기준 forward와 `wrap:true`이며 매번 문서 처음으로 돌아가는 옵션이 아닙니다. 이는 [공식 찾기 도움말](https://help.hancom.com/hoffice120/ko-KR/Hwp/edit/find/find.htm)의 방향·계속 찾기 의미를 따른 것입니다. 현재 문단 일부를 블록으로 지정한 검색 범위 제한과 서식 검색까지 구현했다는 뜻은 아닙니다.

통계는 Unicode scalar 수와 공백 기준 어절 수입니다. 개체 자리표시자는 제외하고, window/limited/clipped 관측에는 `complete=false`를 반환합니다. 한글 프로그램의 언어별 단어 수 계산과 동일하다는 계약은 아닙니다.

문서 통계 모달은 이 공개 함수의 반환값만 표시하며 별도 카운터를 구현하지 않습니다. `complete`는 현재 관측 범위의 표시이지 완전한 원본문서나 한컴 통계 방식과의 동등성 증명이 아닙니다. 읽기 전용도 조회할 수 있고, 같은 문서의 선택 변경은 창을 유지하며 문서 교체·로딩은 폐기합니다.

검증은 mock 12개와 명시 cb48의 실제 readonly 조회 2개를 합쳐 14개·74 assertions로 구분합니다. window/limited/clipped 부분 범위는 mock 근거이며 실제 Noori HWP5/HWPX 두 문서에서는 모달 포커스·Escape·Tab·합성 IME·캐럿 복귀, 조회 중 Worker 요청 0과 일반 편집 모드의 저장 원본 바이트 불변을 확인했습니다. 별도 동결 SDK/cb48 대조에서 발생한 HWP5 readonly 저장의 `EditorNotOpen`은 조회 기능과 분리하며, 통계 UI가 저장 권한을 바꾸지 않습니다. 실제 OS IME·전 코퍼스·공개 배포 완료를 뜻하지 않습니다. 재현 명령은 [개발·검증 명령](development-commands.md#문서-통계-모달-집중-검증)을 따릅니다.

clipboard 관측은 검증된 단일 문단 선택의 텍스트·타깃·읽기/변경 불가 사유·`stateVersion`을 제공합니다. 읽기 전용 텍스트의 복사와 Native 변경 권한은 별도입니다. 개체 선택을 텍스트로 바꾸지 않고, HWP 원본 좌표의 보호 구간과 생성 셀도 기존 선택 검증을 재사용합니다. OS clipboard 읽기/쓰기는 host가 수행합니다.

비동기 권한 요청 후 잘라내기/붙이기/바꾸기는 `SPLICE_TEXT_COMMAND`의 `selectionVersion`을 전달할 수 있습니다. 코어는 실행 시점의 정확한 `stateVersion`과 비교합니다. 같은 문서 revision에서 선택을 다른 곳으로 옮겼다가 되돌려도 이전 관측은 거부됩니다. 일반 타깃의 문서·소유자·scalar·원본 좌표 검증도 계속 적용합니다. 이 fence는 원본 텍스트나 편집값의 별도 캐시를 만들지 않습니다.

비동기 찾기의 선택 반영은 `editor.setSelection(target, {stateVersion: observed.stateVersion})`을 사용합니다. `SelectionOptions`를 생략한 기존 호출은 유지합니다. 버전이 있으면 composition 정리와 앞선 admission 작업이 끝난 실제 반영 시점에 비교하고, 다르면 `StaleSelectionObservation`으로 거부합니다. 같은 문서 revision에서 새 Canvas 선택을 늦은 검색이 덮어쓰거나 오래된 null 선택이 새 선택을 해제하지 못하게 합니다. options는 즉시 복사하고 유효하지 않은 버전/필드는 거부합니다.

코어 검사는 `packages/core/tests/state/text-tools.test.ts`와 `clipboard-state.test.ts`가 소유합니다. 공개 API만 사용하는 데모의 clipboard 권한 거부·지연 선택 변경은 `apps/demo/tests/clipboard-bridge.test.ts`, 찾기/바꾸기의 중복·닫기·dispose 경합은 `text-tools-bridge.test.ts`가 검사합니다. fake DOM 검사는 실제 Canvas·OS clipboard E2E를 대체하지 않습니다. 브라우저 증거와 배포 상태는 [통합 검증 기록](headless-editor-verification.md)을 따릅니다.

## 좌표 기반 문단 선택

`createParagraphSelection(state, { section, paragraph, startUnit, endUnit?, affinity? })`는 현재 표시 문단의 좌표로 frozen `SelectionTarget` 하나를 만듭니다. `endUnit` 기본은 `startUnit`, affinity 기본은 `forward`이고 단위는 UTF-16입니다. 빈 문단/빈 원본 표셀의 `0..0` caret과 같은 문구를 가진 서로 다른 셀을 텍스트 검색 없이 선택할 수 있습니다. 문단 번호는 현재 snapshot의 `section`/`paragraph` 좌표이며 Native ID를 추정하거나 텍스트로 역검색하지 않습니다.

문서를 이미 연 ready editor를 전제로 합니다. 아래 코드는 그 editor를 host에서 주입받는 조각이며 editor 생성·파일 로드 bootstrap을 포함하지 않습니다.

```ts
import { createParagraphSelection } from '@ohah/hwpjs';

const observed = editor.getEditorState();
const target = createParagraphSelection(observed, {
  section: chosenParagraph.section,
  paragraph: chosenParagraph.paragraph,
  startUnit: 0,
  endUnit: 0,
});
await editor.setSelection(target);
```

owner/reference/token은 옵션으로 받지 않습니다. 기존 canonical owner와 선택 validator를 재사용하며, Native reference는 기존 명령 경로가 현재 row에서 가져옵니다. 잘못된 좌표·중복 문단 identity·clipped·scalar 경계는 기존 검증으로 거부합니다. 오래된 state로 만든 target은 실제 반영 시 문서/generation/operation/view token 검사로 거부합니다. 읽기 전용 선택이 편집 권한을 새로 부여하지 않으며 생성 셀의 surface 전용 정책도 유지합니다. dispose 뒤 `setSelection`은 `EditorDisposed` Promise rejection이므로 호출자는 await/catch해야 합니다. 비동기 선택 관측 fence가 필요하면 기존 `{ stateVersion: observed.stateVersion }` 옵션을 함께 사용합니다.

기존 HWP5 원본 각주·미주의 Native note/list·source node·현재 참조를 확인한 공개 owner 승격 범위와 거부 조건은 [기존 각주 헤드리스 선택](headless-existing-note-selection.md)이 소유합니다. 생성 note·표 안 note·불명 중첩 owner로 일반화하지 않습니다.

현재 P를 snapshot의 문단 행 수로 두면 facade의 좌표 조회는 최대 P회이고 기존 validator의 유일성 검사는 별도 P회입니다. target은 한 개이고 문서 텍스트를 출력/복제하지 않습니다. 반복 조회 Map/WeakMap 인덱스는 아직 없으며 이 단위 결과를 인덱스 효과나 전체 편집 복잡도 개선의 증명으로 읽지 않습니다. `findTextMatch`의 기존 검색 결과 선택 기능은 유지합니다.

정규 회귀는 `packages/core/tests/state/paragraph-selection-facade.test.ts`의 pure9와 `packages/core/tests/integration/paragraph-selection-facade.test.ts`의 실 Runtime8입니다. 전체17의 [명시 실행 명령과 WASM/Python 준비 조건](development-commands.md#문단-좌표-선택-집중-검증)을 따릅니다. Native 검사는 절대경로 `HWPJS_TEST_WASM`을 요구하고 verification artifact로 자동 대체하지 않습니다. 허용 원본은 Git에 있는 `legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx`와 `noori.hwp` 두 개뿐입니다. 중복 문구 fixture는 원 table ZIP에서 테스트 안의 Python 표준 라이브러리로 메모리 생성하며 새 바이너리를 게시하지 않습니다. 저장 후 다른 ZIP member/XML 구조가 바뀌지 않았는지도 메모리 oracle로 검사하며 기본 증거파일 출력은 없습니다. same-process ReaderRuntime 검증은 Worker transport·브라우저·실제 Canvas 완료 증거와 구분합니다.

<!-- text-tools-pending-presentation-20261026-933905ad -->

## 검색 작업 종료와 메뉴 표시 수명

2026-10-26 수정 `933905ad`는 검색 선택의 상태 이벤트가 `pending=true`일 때 shell을 갱신한 뒤, 작업 종료에서 메뉴를 다시 그리지 않아 찾기 버튼의 disabled·진행 중 title이 남던 문제를 고칩니다. CSS 겹침 수정과 별도 원인입니다. bridge는 `onPresentationChange`로 시작·settle·close의 표시 변경을 알리고, demo-controller가 `shell.update()`를 연결합니다. close는 epoch를 바꾸되 pending을 즉시 해제하지 않습니다. epoch가 달라진 작업도 settle에서는 살아 있는 bridge의 메뉴를 갱신하되, 후속 선택 접수·성공 안내는 기존 active 검사를 따릅니다. 이미 접수된 작업을 취소한다는 뜻은 아닙니다. dispose 뒤에는 알리지 않고, 동기 constructor 구독 중에는 shell 준비 전 콜백을 막습니다.

정규 회귀는 `apps/demo/tests/text-tools-presentation.test.ts`와 전용 helper가 소유하며 tracked 공통 DOM fixture만 재사용합니다. 같은 9개 판정에서 수정 전 원본7실패→후보9통과·52expect를 확인했고, 실제 적용 후 단위14통과·0실패·52expect 및 대상 actual TypeScript 검사0을 확인했습니다. 독립 근거는 `zig-out/verification/text-tools-presentation-pending-candidate/`의 `closed-originalfails.log`, `closed-fixed.log`, `CLOSED-FOUR-PATHS-MANIFEST.json`입니다. 제어 transport·DOM 단위 검증은 실제 Native/브라우저 E2E와 구분합니다.

실제 앱 G4의 원래4흐름·late2·CSS8 조건 통과는 해당 관측 범위만의 결과입니다. 별도 `zig-out/verification/find-pending-g4-harness/lifecycle-once/REPORT.json`의 1회 실험에서 초기 reload timeout 페이지는 hidden·focus=false·직접 rAF counter0이었고, 동일 실패 페이지에 CDP `Page.bringToFront`만 적용하자 visible·focus=true·rAF6·Canvas rows5/paintPending=false로 회복했습니다. Native ACK·fonts가 정상인 이 관측에서 앱 변경·재로드·재업로드 없이 해당 timeout을 페이지 비활성 수명 경로로 분리했습니다. `Page.setWebLifecycleState`는 이미 회복한 뒤의 보조 조작이므로 독립 인과 증거가 아닙니다. 새 target이 hidden이 된 세부 원인, G4의 모든 형식·흐름 완료, 일반 로딩 문제 전체 해결은 입증하지 않습니다. 후속 공개 검증은 `format-dialog-production-candidate/generation4/live-9e208626/FINAL-RECEIPT.json`에서 CI `40285971134`의 exact `9e208626` build/deploy 성공, HTTPS28파일의 SHA·bytes 일치, 찾기→Escape/닫기→재열기 2흐름과 선택·캐럿·포커스 유지, 변경 요청0·HTTP/브라우저 오류0·private origin 유출0·브라우저 inactive를 확인했습니다. 공개 반영 확인은 이 산출물과 2흐름 범위이며 모든 형식·프레임워크의 동작 완료를 뜻하지 않습니다.

## 방향 검색 검증

2026-10-25 코어/bridge/독립 일치 목록 검사는29/29·566 assertions를 통과했습니다. `text-search-direction-oracle.test.ts`는 제품의 문단 방문 알고리즘을 복사하지 않고 모든 겹치는 부분 문자열 일치를 열거하여 방향/순환/origin 조합512개를 대조했습니다. 한글·emoji UTF-16 경계, 잘린/소유자 없는 행 제외, 역방향 인덱스0, 한 개뿐인 일치와 경계 null을 포함합니다. 쿼리·방향·선택 변경과 Escape/닫기/dispose 중 지연 작업의 거부도 검사했습니다.

실제 Canvas 검사는 `node tools/editor-search-direction-browser-audit.mjs https://macstudio.tailed42f2.ts.net:10000`입니다. Vanilla/React/Svelte × charshape.hwp/charshape.hwpx의 아래로·위로, 경계에서 명시적 계속 찾기, 문서 전체 순환, Escape 닫기, 저장 Native 요청1회와 실제 다운로드를 확인했습니다. private/public 각6/6 통과했고 검색 후 저장된6개 파일은 원본 전체 bytes와 같습니다. 검색은 문서를 수정하지 않았습니다. 공개 최종 산출물은 `zig-out/verification/search-direction-public/`의 results/cleanup JSON·스크린샷이며 소유 브라우저 inactive=true입니다. 현재 명시 엔진은 `fc7fb2ab7eeff2bb07ae1463f7e5b12dcc7ebbd49f4c6de9487a85da6900dda4`입니다. 모든 문서·모든 검색 옵션의 구현 완료를 뜻하지 않습니다.

후속 경합 검사에서 검색 setSelection이 지연된 동안 새 Canvas 선택을 먼저 반영하면 동일 문서 revision에서도 검색이 이를 덮어쓰는 실패를 재현했습니다(`queued-selection-before-fix.log`: 기대 stateVersion3, 실제4). 관측 버전 옵션을 추가한 뒤 회귀가 통과했고, 실제 코어 FIFO·composition publication·설정 즉시 복사·기존 API 호환을 포함한 상태/제어기/키 설정/찾기 bridge123개가 모두 통과했습니다. 원본 실패 기록은 `zig-out/verification/search-direction-private/`에 보존했습니다.

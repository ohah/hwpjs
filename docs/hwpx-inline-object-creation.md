# HWPX 새 차트·수식 생성

새 생성과 기존 개체 편집은 다른 명령이다. Core는 `INSERT_EQUATION_COMMAND`와 `CREATE_CHART_COMMAND`를 제공하며, 소스 SDK facade는 `insertEquation()`과 `createChart()`를 제공한다. 기존 차트 데이터·수식 스크립트 편집 API의 존재로 새 생성 지원을 추측하지 않는다. 설치 패키지·배포 엔진은 해당 버전과 ABI를 별도로 확인한다.

## 대상과 권한

- HWPX 첫 구역 `section=0`의 일반 원본 본문에서 선택 영역이 없는 현재 커서만 대상으로 한다. Core 문단 번호는 0 기반, Native/소스 SDK 문단 번호는 문서 전체 1 기반이다. Core가 한 번만 변환한다.
- 현재 상태의 owner·문서·세대·선택 버전과 UTF-16 scalar 경계를 검사한다. 전체 문단 텍스트를 원문 증인으로 사용하며 서로게이트 내부, stale 위치·상태를 거부한다.
- 전체 편집 문서와 Native history v2가 필요하다. HWP5, 셀·생성 셀, clipped/window/limited·읽기 전용, 복잡한 소유자와 기존 개체가 섞인 문단은 이 생성 계약의 대상이 아니다. Native는 field-free section·원본 cache·보안 메타데이터·parked document 예산을 추가로 검사한다.
- 일반 본문으로 표시됐다는 사실만으로 생성이 성공하는 것은 아니다. availability는 현재 SDK/Native 지원과 대상의 사전 관측이며, 최종 요청도 Native에서 거부될 수 있다. 생성 뒤의 임의 입력·문단 분할·연속 생성 조합은 별도 편집 계약이다.

## 공통 caret과 빈 anchored 본문 예외

최종 Core의 내부 current-caret 검사는 selectionVersion, target/live의 collapsed caret·token·owner·affinity·UTF-16 경계를 공통으로 확인한다. 문서 삽입은 그 뒤 기존 strict plain body owner 규칙을 유지한다.

차트·수식 생성은 첫 구역 본문의 text가 빈 문자열이고 anchorEditable=true이며 caret0인 행도 허용한다. plainEditable 값을 바꾸거나 가짜 state를 만들지 않는다. 비어 있지 않은 anchored 문단·셀·미편집/제한 행은 계속 거부한다. 이 예외가 INSERT_DOCUMENT_COMMAND의 허용 범위를 넓히지 않는다. saved/live의 빈 두 번째 본문, 기존 문서 삽입 거부 및 이력 보존은 별도 r9 실제7개와 shared4/empty6 합성으로 구분한다.

## Core API

문서가 열린 뒤 `createParagraphSelection()` 또는 Surface가 만든 현재 선택을 사용한다. 다음 예시는 새 HWPX의 첫 일반 본문 커서에 차트 한 개를 생성한다. 이후 다른 개체를 만들 때는 최신 상태와 지원되는 별도 커서를 다시 관측한다.

```ts
import {
  createParagraphSelection,
  CREATE_CHART_COMMAND,
  getInlineObjectInsertAvailability,
} from '@ohah/hwpjs';

const coordinates = { section: 0, paragraph: 0, startUnit: 0 };
await editor.setSelection(createParagraphSelection(editor.getEditorState(), coordinates));
const state = editor.getEditorState();
const availability = getInlineObjectInsertAvailability(state, 'chart');
if (!availability.enabled) throw Error(availability.reason);
const result = await editor.dispatchCommand(CREATE_CHART_COMMAND, {
  target: createParagraphSelection(state, coordinates),
  selectionVersion: state.stateVersion,
  options: {
    width: 20000,
    height: 12000,
    categories: ['가', '나'],
    series: [{ name: '계열 1', values: [10, 20] }],
  },
});
```

`INSERT_EQUATION_COMMAND`도 `{target, selectionVersion, options}`를 받는다. 수식 options는 다음처럼 모든 geometry·metadata를 명시한다.

```ts
const options = {
  script: 'x over y',
  width: 6000,
  height: 2000,
  baseLine: 85,
  baseUnit: 1000,
  version: 'Equation Version 60',
  font: 'HYhwpEQ',
};
```

크기·baseUnit은 HWPUNIT 원값이다. 수식 스크립트는 원문으로 저장하며 크기를 자동 계산하지 않는다. 빈 스크립트도 허용한다. 차트는 표준 2D 세로 막대형 한 종류이며 Core `values`는 유한한 number 배열이다. 범주·계열의 순서를 유지하고 모든 계열의 값 수가 범주 수와 같아야 한다. 범주 최대4096·계열 최대64·총 점 최대16384, 수식 스크립트 최대1MiB, 직렬화 요청 최대8MiB의 제한을 적용한다.

큐 진입 전에 배열·문자열·target을 소유 복사하고, 큐 및 Runtime admission에서 현재성을 다시 검사한다. 같은 캡처의 두 번째 요청이 첫 생성 뒤 stale이 되면 거부한다. 앞선 생성의 이력을 취소하거나 두 번 실행하지 않는다.

## 소스 SDK facade와 구형 ABI

`js/hwpx-editor.mjs`의 `createHwpxEditor(wasmModule)`로 연 세션에서 history v2를 활성화한다. 수식은 `{section, paragraph, start, expectedText, script, width, height, baseLine, baseUnit, version, font}`, 차트는 아래 wire DTO를 사용한다.

```js
const request = {
  target: { section: 0, paragraph: 1, unit: 1, expected_text: 'a😀b' },
  size: { width: 20000, height: 12000 },
  data: {
    categories: ['가', '나'],
    series: [{ name: '계열 1', values: ['1.50', '-2e2'] }],
  },
};
const outcome = sdk.createChart(request);
```

SDK의 차트 wire 값은 검증된 유한 숫자 문자열이며 Core의 number options와 구별한다. 반환값의 `application`은 applied/unapplied/unknown으로 분류한다. 거부·불확실 결과를 자동 재시도하지 않는다. 성공은 단일 parked history edge이고, undo/redo는 생성된 host·OPF·차트/OLE 자원을 함께 복원한다. 생성 시 preview는 stale이며 reflow가 필요하다.

생성 ABI는 `hwpx_edit_insert_equation`·`hwpx_edit_create_chart` 두 개다. old879는 history v2가 있어도 이 ABI가 없으며 SDK는 `InlineObjectInsertionUnavailable`, Core는 `rejected-unapplied`로 거부한다. 기존 bytes·history가 보존되는지 실제 구 엔진 회귀로 확인한다. export 이름만으로 전체 생성 지원을 선언하지 않는다.

## 현재 입력 메뉴

데모 `입력 → 차트`와 `입력 → 수식`, 추가 도구의 차트·수식 버튼은 같은 생성 경로를 사용한다. 기존 `도구 → 기존 차트 데이터 편집`·`기존 수식 편집`과 구별한다. 차트 창은 범주·계열·숫자 grid와 표준 2D 세로 막대형만 제공한다. 수식 창은 script와 명시 크기, 고급 metadata를 받는다. UI 크기 입력은 mm, baseUnit 입력은 pt를 기존 단위 helper로 변환한다.

창을 열 때 현재 selection/state를 캡처하고 실행 직전에 다시 검사한다. 미지원 엔진·이력·owner 또는 선택 변경은 이유와 함께 비활성화/거부한다. 기존 개체 편집 버튼이 활성이라는 이유로 생성 버튼을 활성화하지 않는다. 메뉴 항목이 존재한다는 사실은 권한이나 GUI 통과 증거가 아니다.

## 검증 계층

- 합성27: DTO·optional ABI·소유 복사·큐/현재성·결과 분류. 실제 WASM·GUI 검사가 아니다.
- 실제 일반 SDK13: 소스 facade6/Core7의 단일 이력, 저장·재열기·undo/redo, 구879 부재 거부·Native 거절 후 redo 보존. 명시 WASM과 고정 합성 HWPX를 사용한 Node 검사다.
- 독립 ZIP/XML: 원문·삽입 위치·geometry·값·자원·비대상 payload·이력 바이트를 normal/`-O`로 판정하고 잘못된 기대값을 반려한다. OLE 내부의 전체 CFB stream 비교는 별도 증거다.
- Native 집중29와 NoResize OOM은 해당 Native 소스·엔진·검사 분모의 증거다. 위13개나 GUI 검사로 이름을 바꾸거나 합산하지 않는다.
- GUI 생성·저장·편집·fresh reopen은 실제 브라우저/엔진/소스와 종료 기록을 별도로 갖는다. headless·합성·Native 통과는 모든 HWPX/한컴 상호운용·전체 편집 지원을 뜻하지 않는다.

정규 명령과 CI 입력은 [개발·검증 명령](development-commands.md#hwpx-inline-object-creation)을 따른다. 최종 공개 채택 전에는 새 WASM의 기존 HWP5 profile/owner-window 회귀도 별도로 유지한다.

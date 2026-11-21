# HeadlessEditor

[공개 API 직접 실행](./playground.mdx)에서 실제 코드·JSON 인수·반환값·오류를 확인할 수 있습니다.

`createEditor({ runtimeFactory, onError? })`가 반환하는 객체의 public 소스 계약입니다. 타입 export는 `@ohah/hwpjs`, runtime 구현은 `@ohah/hwpjs/runtime`으로 나뉩니다.

| 작업         | public API                                                                             | 의미                                                        |
| ------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 열기         | `load(bytes, options)`                                                                 | format: hwp5/hwpx, editable 등 명시적 옵션                  |
| 암호/취소    | `unlock`, `cancelLoad`                                                                 | 잠긴 후보의 암호 시도와 load 취소                           |
| 관측         | `getEditorState()`, `read(callback)`                                                   | owned 상태 snapshot, 동기 읽기                              |
| 선택         | `setSelection(target, options?)`                                                       | 현재 display target; null은 선택 해제                       |
| 명령         | `dispatchCommand(command, payload)`                                                    | 결과 status/error를 반드시 확인                             |
| 명령 handler | `registerCommand(command, handler, priority?)`                                         | 동기 Boolean 처리·우선순위·해제 함수                        |
| 묶음 수집    | `update(collector)`                                                                    | 동기 명령 수집, 전체를 무조건 원자적 성공으로 보장하지 않음 |
| 저장         | `save(options?)`                                                                       | 현재 문서 형식의 bytes 반환                                 |
| 이력         | `undo()`, `redo()`, `getHistoryAvailability(state)`                                    | Native 이력과 capability에 따른 사용 가능 상태              |
| 전체 바꾸기  | `getReplaceAllCapabilities()`, `planReplaceAll(state, request)`, `REPLACE_ALL_COMMAND` | 현재 main·웹 데모의 리터럴 일괄 교체. npm 게시는 별도       |
| 편집 용지    | `getPageSettings()`, `EDIT_PAGE_SETTINGS_COMMAND`                                      | 구역·문서 범위의 방향·크기·여백 변경                        |
| 재관측       | `refresh()`                                                                            | refresh-required 상태의 관측 갱신                           |
| 구독         | `registerStateListener`, `registerUpdateListener`, `registerErrorListener`             | 반환된 해제 함수로 구독 정리                                |
| 종료         | `dispose()`                                                                            | terminal 종료; 같은 객체 재사용 불가                        |

`EditorState`는 저장 문서 모델이 아닙니다. `content`, `capabilities`, `selection`은 공개 타입상 unknown인 관측값입니다. 임의 JSON 구조로 수정해서 Native 문서를 바꿀 수 없습니다. `state.token`은 editor/document/generation/revision 소유권을 검증하며, 저장 bytes를 다시 여는 것과 과거 snapshot을 재주입하는 것은 다릅니다.

`read()`와 state.read() 콜백은 동기 조회만 수행합니다. 이 콜백 안에서 load/dispatch/save를 하거나 async 함수를 넘기지 마세요. 상태 구독은 등록 전에 현재값을 `getEditorState()`로 읽고, 종료 시 구독을 해제하는 방식으로 구성할 수 있습니다.

## CommandResult

| status                     | 처리                                                   |
| -------------------------- | ------------------------------------------------------ |
| rejected-unapplied         | 미반영 거부. 오류와 현재 대상을 확인                   |
| committed-with-snapshot    | 반영과 관측 게시 완료                                  |
| committed-refresh-required | 반영됐으나 재관측 필요. 편집 재전송 금지               |
| known-no-op                | 알려진 무변경 결과                                     |
| handled-without-runtime    | 외부 handler가 처리; Native 문서 변경 성공 증거가 아님 |

`changed`는 true/false/null일 수 있습니다. 명령 처리 여부를 저장 성공이나 전체 문서 지원으로 확대하지 마세요. [전체 사용 예제](../guide/editing.md)는 status에 따라 분기합니다.

## 저수준 연계

`requestExperimental`, `readResource`, `acquireInputSurface`와 lease는 제한된 runtime/호스트 연계 포트입니다. 전용 typed field/table/object API가 모두 준비됐다는 뜻이 아닙니다. 새 기능은 [지원 범위](../guide/limitations.md)의 전용 공개 계약 여부부터 확인하세요.

## 문서 전체 리터럴 바꾸기

현재 main과 함께 배포하는 웹 SDK는 아래 API를 제공합니다. 이번 추가분은 npm에 게시하지 않았습니다. <a href="__HWPJS_DOCS_BASE__editor/demo/vanilla/">웹 데모</a>의 찾기/바꾸기 창에서도 사용할 수 있습니다.

`planReplaceAll`은 현재 완전한 관측 snapshot에서 변경 계획만 만듭니다. 반환값의 `executionAuthority`는 `false`이며 실제 쓰기 권한을 부여하지 않습니다. `getReplaceAllCapabilities` 역시 기본 가용성 조회입니다. 명령 실행 시 Native가 원문·대상·보호 영역·전체 범위를 다시 검사합니다.

<!-- example:replace-all.ts -->

```ts
import { REPLACE_ALL_COMMAND, planReplaceAll, type HeadlessEditor } from '@ohah/hwpjs';

// ready editor와, 호스트가 대기 입력을 반영한 뒤 호출합니다.
export async function replaceLiteral(editor: HeadlessEditor, query: string, replacement: string) {
  const capabilities = await editor.getReplaceAllCapabilities();
  if (!capabilities.available) throw Error(capabilities.reason ?? 'ReplaceAllUnavailable');
  const state = editor.getEditorState();
  const request = {
    schemaVersion: 1 as const,
    query,
    replacement,
    layoutToken: state.token,
    stateVersion: state.stateVersion,
  };
  const plan = planReplaceAll(state, request);
  const result = await editor.dispatchCommand(REPLACE_ALL_COMMAND, request);
  // committed-refresh-required이면 재관측하며 같은 편집을 다시 보내지 않습니다.
  return { matchCount: plan.matchCount, result };
}
```

지원하는 리터럴 교체는 하나의 Native 이력으로 적용합니다. 문단을 가로지르는 검색·정규식·개행 삽입은 지원하지 않습니다. 필드·수식·생성 셀 등 대상별 제한이 있고, 일부 문단만 관측한 snapshot은 거부합니다. 미지원 일치를 조용히 건너뛰지 않습니다. 상세 경계는 [전체 바꾸기 계약](https://github.com/ohah/hwpjs/blob/main/docs/headless-replace-all.md)을 따릅니다. [공개 API 직접 실행](./playground.mdx)에서 가용성 조회, 변경 계획, 실제 적용을 각각 실행할 수 있습니다.

## 명령 등록·동기 수집·구독 해제

아래는 현재 소스의 공개 API 예제입니다. 공개 API 플레이그라운드의 메뉴나 npm의 새 출시를 의미하지 않습니다. `notifyHost`는 문서를 먼저 연 `ready` editor를 받고 호스트 알림만 처리합니다. `true`는 명령 전파 중단이며 Native 문서 변경 성공이 아닙니다. 우선순위는 큰 값부터, 동률은 등록 순서입니다.

`collectInsert`의 target은 현재 관측값에서 검증한 선택이어야 합니다. `update`는 콜백 안에서 명령을 수집한 뒤 순서대로 실행하며, 여러 Native 편집 전체의 rollback이나 콜백 안의 read-your-writes를 제공하지 않습니다. 실패 전 반영된 명령은 유지될 수 있고 뒤 명령은 중단됩니다. 반영됐으나 snapshot을 다시 읽어야 하는 상태도 있으므로 `results`의 status/error와 `stoppedIndex`를 확인하고 편집을 자동 재전송하지 않습니다.

read/update/명령 handler는 동기 콜백입니다. listener가 반환한 Promise는 publication이 기다리지 않으므로 비동기 작업 완료를 DOM paint 완료나 다음 명령의 선행 조건으로 삼지 마세요. 관측 구독의 해제 함수는 호스트 수명이 끝날 때 호출합니다.

<!-- example:commands-and-callbacks.ts -->

```ts
import {
  createCommand,
  SPLICE_TEXT_COMMAND,
  type HeadlessEditor,
  type SelectionTarget,
  type EditorError,
} from '@ohah/hwpjs';

export function observeEditor(
  editor: HeadlessEditor,
  onStatus: (status: string) => void,
  onError: (event: EditorError) => void,
) {
  onStatus(editor.read((state) => state.status));
  const offState = editor.registerStateListener((state) => onStatus(state.status));
  const offError = editor.registerErrorListener(onError);
  return () => {
    offState();
    offError();
  };
}

const HOST_NOTICE = createCommand<{ message: string }>('host-notice');

// 이미 준비된 ready editor를 전달합니다. true는 Native 편집 성공이 아닙니다.
export async function notifyHost(editor: HeadlessEditor, show: (message: string) => void) {
  const unregister = editor.registerCommand(
    HOST_NOTICE,
    (payload) => {
      show(payload.message);
      return true; // 후순위 handler와 Native fallback으로의 전파를 멈춥니다.
    },
    10,
  );
  try {
    const result = await editor.dispatchCommand(HOST_NOTICE, { message: '호스트 알림' });
    if (result.error) throw Error(result.error);
    return result; // handled-without-runtime. 저장 문서의 변경 증거가 아닙니다.
  } finally {
    unregister();
  }
}

export async function collectInsert(editor: HeadlessEditor, target: SelectionTarget, text: string) {
  // 콜백은 동기 수집만 합니다. Native 실행은 정상 반환 뒤 시작합니다.
  const result = await editor.update((collector, snapshot) => {
    if (snapshot.status !== 'ready') throw Error('편집 준비가 되지 않았습니다.');
    collector.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text });
  });
  // 여러 명령을 수집해도 전체 rollback/read-your-writes를 보장하지 않습니다.
  // 실패 전 반영분은 남을 수 있으므로 results/status와 중단 위치를 확인합니다.
  return { results: result.results, stoppedIndex: result.stoppedIndex };
}
```

## 편집 중 새로 만든 HWP5 문단의 서식

현재 main과 웹 데모 SDK에서는 HWP5 본문에서 Enter로 만든 문단도 `SET_CHARACTER_PROPERTIES_COMMAND`의 굵게·기울임·글자 크기와 `SET_PARAGRAPH_ALIGNMENT_COMMAND`의 대상으로 사용할 수 있습니다. 글자 속성은 텍스트 선택에 적용하고 문단 정렬은 커서만 있어도 적용할 수 있습니다. 명령 실행 직전에 현재 문단 참조와 본문 소유권을 확인합니다. 글자 모양 전체·밑줄·취소선·글꼴·atomic patch·생성 셀의 지원을 함께 확대한 것은 아닙니다. npm 게시는 별도입니다.

## 표 삽입 전 대상 확인

`getTableInsertAvailability(state, target)`는 현재 선택에서 표를 삽입할 수 있는지 조회합니다. UI와 실제 삽입 명령이 같은 대상 검증을 사용합니다. `allowed`와 `reason`을 확인하세요. 허용 시에는 검증된 기본 리소스 `resources`도 반환합니다. 실제 크기·리소스와 대상은 명령 실행 시 다시 검증합니다. 플레이그라운드에서 같은 이름의 항목을 선택하면 문서를 변경하지 않고 실제 함수를 호출합니다.

이 API는 현재 main 소스와 공개 웹 데모 SDK에 제공하며 npm에는 아직 게시하지 않았습니다. HWP5의 편집 중 생성된 본문 문단도 지원합니다. 실행 직전에 Native의 현재 source 문단 참조와 요청을 대조하며, 오래되거나 다른 문서의 참조는 삽입 전에 거부합니다. 표 셀·글상자·각주 등 본문 외 소유자는 이 명령의 대상이 아닙니다.

<!-- example:table-insert-availability.ts -->

```ts
import {
  getSelectionFormatting,
  getTableInsertAvailability,
  type HeadlessEditor,
} from '@ohah/hwpjs';

export function getTableInsertionState(editor: HeadlessEditor) {
  return editor.read((state) =>
    getTableInsertAvailability(state, getSelectionFormatting(state).target),
  );
}
```

## 글머리표 정의 조회·생성·수정

아래는 현재 GitHub 구현 기준이며 npm 릴리스에 포함됐다는 뜻이 아닙니다. 공개 설치 이름은 `npm install @ohah/hwpjs`이며 해당 기능과 대응 WASM을 포함한 빌드가 필요합니다.

HWP5·HWPX의 `editor.listParagraphBulletDefinitions({ token? })`는 본문에서 사용하지 않는 선언도 포함한 현재 DocInfo/헤더 전체 목록을 반환합니다. `state: 'available'`와 `coverage: 'complete'`를 확인하세요. `definitionWriter: 'character-definitions-v1'`이면 새 정의 쓰기를 지원하며 각 선언의 nullable `definition`에서 편집 가능한 모양을 읽습니다.

```ts
import { EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND, createParagraphSelection } from '@ohah/hwpjs';

const state = editor.getEditorState();
const target = createParagraphSelection(state, { section: 0, paragraph: 1, startUnit: 0 });
const result = await editor.dispatchCommand(EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND, {
  target,
  selectionVersion: state.stateVersion,
  edit: {
    mode: 'create',
    apply: true,
    definition: {
      marker: 0x2605,
      alignment: 'RIGHT',
      useInstanceWidth: false,
      autoIndent: true,
      widthAdjust: -50,
      textOffsetType: 'HWPUNIT',
      textOffset: 750,
      charShapeId: 0xffffffff,
    },
  },
});
if (result.status !== 'committed-with-snapshot') throw new Error(String(result.error));
```

생성과 문단 적용은 한 번의 실행 취소로 복원합니다. `mode: 'update'`와 기존 `id`는 그 정의를 사용하는 모든 문단에 영향을 줍니다. `apply: false`는 정의만 수정합니다. 전체 geometry 값은 필수이며 `charShapeId: 0xffffffff`는 본문 글자 모양 상속입니다. 문서 전체 저장·재열기 경계의 명시 명령이므로 키 입력마다 호출하지 마세요.

HWP5·HWPX의 지원되는 일반 본문 문단과 문자 정의를 지원합니다. HWP5는 원본 및 생성 continuation 문단에 연결하며 WCHAR와 signed HWPUNIT16로 표현할 수 없는 값은 명시 거부합니다. 그림/체크 글머리표·번호 이어가기는 후속입니다. 구형 inventory WASM의 조회는 계속 가능하지만 새 writer는 비활성입니다. 이 설명은 GitHub의 최신 구현 기준이며 npm 설치본의 게시 시점과 구분합니다.

## HWP5·HWPX 편집 용지

Headless 데모의 API 실행에서 `getPageSettings`를 선택해 실제 함수를 호출할 수 있습니다. `{ "section": 0 }`은 첫 구역을 조회하고, `{}`는 현재 선택의 구역을 따릅니다. 조회는 문서와 실행취소 이력을 변경하지 않습니다.

현재 웹 SDK와 데모의 **쪽 → 편집 용지**에서 제공합니다. npm 게시 버전의 지원 범위는 해당 릴리스에 따릅니다. `getPageSettings()`는 원본 규격과 구역별 지원 사유, 현재 세션에 묶인 target을 반환합니다. target은 같은 editor에서 그대로 사용하고 JSON으로 복제하지 않습니다. 대기 입력을 반영한 뒤 조회하며, 다른 편집·문서 교체·실행 취소 뒤에는 새로 조회합니다.

크기와 여백은 정수 HWPUNIT(1/7200인치)입니다. `widely`는 세로, `narrowly`는 가로입니다. 방향을 바꾸기 위해 원본 width/height를 서로 바꾸지 않습니다. 아래는 문서 전체를 A4 세로와 명시한 여백으로 설정하는 예입니다.

<!-- example:page-settings.ts -->

```ts
import { EDIT_PAGE_SETTINGS_COMMAND, type HeadlessEditor } from '@ohah/hwpjs';

export async function setA4Page(editor: HeadlessEditor) {
  const read = await editor.getPageSettings();
  if (read.state !== 'available') throw new Error(read.reason);
  const result = await editor.dispatchCommand(EDIT_PAGE_SETTINGS_COMMAND, {
    target: read.target,
    scope: 'document',
    values: {
      orientation: 'widely',
      width: 59528,
      height: 84188,
      gutter_type: 'left_only',
      margin: {
        top: 5670,
        bottom: 4250,
        left: 8504,
        right: 8504,
        header: 4252,
        footer: 4252,
        gutter: 0,
      },
    },
  });
  if (result.status === 'rejected-unapplied') throw new Error(result.error);
  if (result.status === 'committed-refresh-required') await editor.refresh();
  return result;
}
```

`scope: 'section'`은 조회 시 실제로 선택한 구역에 적용합니다. 선택 구역이 없으면 임의의 첫 구역을 사용하지 않습니다. 문서 전체 요청도 모든 대상 구역을 먼저 검사하며, 중복·조건부 owner나 해석할 수 없는 캐시가 있으면 변경을 거절합니다. 알려진 줄 배치 캐시는 해당 변경에서 무효화합니다. 용지 설정 변경은 하나의 Native 이력으로 처리하며, 저장은 기존 `save()` 계약을 따릅니다.

## 새 HWPX 차트·수식 생성

현재 GitHub 소스와 웹 데모는 `CREATE_CHART_COMMAND`, `INSERT_EQUATION_COMMAND`, `getInlineObjectInsertAvailability()`를 제공합니다. npm 릴리스 반영은 별도입니다. 새 생성 ABI가 있는 엔진과 Native history v2가 필요합니다.

다음 예시는 새 HWPX 문서의 첫 본문에 차트를 만듭니다.

```ts
import {
  CREATE_CHART_COMMAND,
  createParagraphSelection,
  getInlineObjectInsertAvailability,
  type HeadlessEditor,
} from '@ohah/hwpjs';

export async function createChartDocument(editor: HeadlessEditor) {
  await editor.createDocument({ format: 'hwpx' });
  const coordinates = { section: 0, paragraph: 0, startUnit: 0 };
  await editor.setSelection(createParagraphSelection(editor.getEditorState(), coordinates));
  const state = editor.getEditorState();
  const availability = getInlineObjectInsertAvailability(state, 'chart');
  if (!availability.enabled) throw Error(availability.reason);
  return editor.dispatchCommand(CREATE_CHART_COMMAND, {
    target: createParagraphSelection(state, coordinates),
    selectionVersion: state.stateVersion,
    options: {
      width: 20000,
      height: 12000,
      categories: ['가', '나', '다'],
      series: [{ name: '계열 1', values: [10, 20, 30] }],
    },
  });
}
```

`INSERT_EQUATION_COMMAND`도 `{ target, selectionVersion, options }`를 받습니다. options에 `script`, `width`, `height`, `baseLine`, `baseUnit`, `version`, `font`를 명시합니다. 예시는 `script: 'x over y'`, `width: 6000`, `height: 2000`, `baseLine: 85`, `baseUnit: 1000`, `version: 'Equation Version 60'`, `font: 'HYhwpEQ'`입니다. API의 크기는 HWPUNIT 원값이고, 데모는 mm·pt 입력을 변환합니다.

첫 구역의 일반 본문 커서만 대상으로 합니다. 차트 뒤 Enter로 만든 빈 본문도 생성할 수 있지만 셀·선택 영역·기존 개체가 섞인 문단은 제외합니다. `chart`를 생략하면 기존 2D 묶은 세로 막대형을 생성합니다. 명시적 `chart`로 막대·꺾은선·영역·원형의 2D/3D, 도넛·보조 원형·방사형·분산형·버블·주가·표면형을 선택할 수 있습니다. 종류별 필수 필드를 검사하며 분산형·버블의 X·Y·크기와 주가 역할을 자동 추정하지 않습니다. 구형 엔진은 명시 종류를 거절합니다. 수식 크기는 자동 계산하지 않습니다. 같은 캡처로 두 번 호출하면 앞선 편집 뒤 낡은 상태가 된 요청을 거절합니다.

생성·저장·실행 취소는 기존 Native 거래를 사용합니다. 세부 제한은 [생성 계약](https://github.com/ohah/hwpjs/blob/main/docs/hwpx-inline-object-creation.md), 화면 사용법은 [데모 안내](../guide/demo.md#새-차트수식-만들기)를 확인하세요.

## 새 HWP5 차트 생성

`CREATE_CHART_COMMAND`는 HWP5 본문의 편집 가능한 커서에서도 사용할 수 있습니다. 현재 `EditorState`의 `selection`과 `stateVersion`을 각각 `target`과 `selectionVersion`으로 전달하고, 먼저 `getInlineObjectInsertAvailability(state, 'chart')`로 편집 가능 여부를 확인합니다.

HWP5의 `options`에는 `profile: 'spec24-registered-png-presentation-v1'`, HWPUNIT 단위의 `width`와 `height`, `categories`, `series`, 그리고 픽셀 단위의 `preview.width`와 `preview.height`를 지정합니다. 현재 프로필은 2D 묶은 세로 막대형을 생성합니다. 내장 Worker에서 미리보기 PNG를 만들 수 있어야 차트 생성이 활성화됩니다.

일반 저장이 `LayoutReflowRequired`를 반환하면 레이아웃 변경 가능성을 확인하고 `save({ allowStaleLayout: true })`로 저장할 수 있습니다. [HWP5 차트 데모](../guide/demo.md#새-차트수식-만들기)에서 생성과 재열기 절차를 확인할 수 있습니다.

## 기존 HWP5 차트 데이터 편집

검증한 격리 소스의 `createHwp5ChartDataEditor(editor)`는 내장 Worker에서 현재 Native 소유권이 확인된 own 표준 2D 세로 묶은 막대 차트의 값과 기존 범주 이름을 편집합니다. npm 게시 상태와는 별개입니다. 먼저 `presentation().enabled`를 확인하고, `targets()`로 얻은 현재 대상을 `capture()`한 뒤 같은 capture에 변경 목록을 한 번 적용합니다.

```ts
import { createHwp5ChartDataEditor, type HeadlessEditor } from '@ohah/hwpjs';

export async function editChartValue(editor: HeadlessEditor) {
  const tool = createHwp5ChartDataEditor(editor);
  if (!tool.presentation().enabled) return;
  const target = tool.targets()[0];
  if (!target) return;
  const capture = await tool.capture(target);
  const expected = capture.literals.series[0]?.values[0];
  if (expected === undefined) return;
  return tool.apply(capture, [{ value: { series: 0, category: 0, expected, value: '15' } }]);
}
```

숫자는 검증되는 문자열로 전달합니다. 범주 변경은 `{ category: { category, expected, value } }`이며 계열 이름과 개수를 바꾸지 않습니다. capture는 JSON으로 복원하거나 다른 편집기에 옮길 수 없습니다. 상태가 바뀌면 다시 조회하며 PNG와 painter를 호출자 입력으로 받지 않습니다. 사용할 수 없는 상태에서 `targets()`와 `capture()`는 오류로 거부합니다. [입력 한도와 검증 계약](https://github.com/ohah/hwpjs/blob/main/docs/hwp5-chart-literal-edit.md), [더블클릭부터 저장까지의 사용법](../guide/demo.md#hwp5-기존-차트-데이터-편집)을 확인하세요.

## 차트·글상자의 크기와 위치 {#object-geometry}

최신 소스의 `getObjectGeometry(selector)`는 현재 Native 소유자와 크기·위치를 조회하고 불투명한 편집 대상을 반환합니다. 선택자에는 현재 문서에서 관측한 `kind`, `section`, `node`를 사용합니다. 이전 파일의 번호나 Canvas 사각형을 수정 권한으로 사용하지 않습니다. npm 게시 상태는 소스 지원과 별도로 확인하세요.

```ts
import {
  SET_OBJECT_GEOMETRY_COMMAND,
  type HeadlessEditor,
  type ObjectGeometrySelector,
} from '@ohah/hwpjs';

export async function resizeObject(editor: HeadlessEditor, selector: ObjectGeometrySelector) {
  const read = await editor.getObjectGeometry(selector);
  if (read.state !== 'available') return read;
  return editor.dispatchCommand(SET_OBJECT_GEOMETRY_COMMAND, {
    target: read.target,
    patch: { width: 20000, height: 12000, horizontalOffset: -500, verticalOffset: 300 },
  });
}
```

단위는 HWPUNIT이며 위치 간격은 음수를 허용합니다. 바꾸지 않을 필드는 생략합니다. `target`은 같은 편집기의 현재 상태에만 유효하며 JSON으로 저장·복원할 수 없습니다. 조회와 명령 사이에 저장·선택 변경·undo/redo를 수행했다면 다시 조회하세요.

현재 경로는 지원하는 원본 HWPX 차트·글상자와 HWP5 글상자를 대상으로 합니다. 크기·위치 편집, 저장·다시 열기, 실행 취소·다시 실행을 별도로 검증했습니다. HWP5 변경 뒤 일반 저장이 `LayoutReflowRequired`로 거부되면 레이아웃 제한을 확인한 뒤 `save({ allowStaleLayout: true })`로 명시 동의할 수 있습니다. 완전 재조판이나 그룹·회전·임의 OLE 편집을 뜻하지 않습니다.

## 생성 셀을 DOM 없이 편집하기

새 정상 엔진을 포함한 공개 패키지 소스에서는 `getCreatedCellTextTarget`으로 현재 논리 셀의 입력 권한을 발급받습니다. 셀의 십진 u64 `identity`와 구역·행·열은 실제 표 생성 결과에서 가져옵니다. 임의 Native 문단 번호나 Surface 선택을 만들지 않습니다. 구형 엔진이나 사용할 수 없는 셀은 명시적인 오류로 거부합니다.

```ts
import {
  SPLICE_TEXT_COMMAND,
  type CreatedCellTextSelector,
  type HeadlessEditor,
} from '@ohah/hwpjs';

export async function typeInCreatedCell(
  editor: HeadlessEditor,
  cell: CreatedCellTextSelector,
  unit: number,
  text: string,
) {
  const target = await editor.getCreatedCellTextTarget(cell, {
    startUnit: unit,
    endUnit: unit,
  });
  const result = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
    target,
    text,
    insertion: {
      character: {
        underline: { kind: 'bottom' },
        strike: { enabled: true },
        textColor: 0x000000,
      },
    },
  });
  if (result.status !== 'committed-with-snapshot') {
    // 반영 후 재관측이 필요한 결과에도 같은 편집을 자동 재전송하지 않습니다.
    throw Error(result.error ?? result.status);
  }
  return result.state;
}
```

일반 입력은 `insertion`을 생략하면 현재 Native run에서 서식을 상속합니다. 이력 이동·재열기·상태 변경 뒤에는 현재 셀을 다시 조회해 새 target을 발급받습니다. target을 복사하거나 다른 editor에서 재사용할 수 없습니다. `insertion.character`는 새로 삽입한 텍스트에만 적용하며 기존 범위의 서식 변경을 같은 텍스트의 삭제·재삽입으로 대신하지 않습니다. `openReadOnlyDocument.sdk`는 읽기 수명이므로 이 쓰기 경로에 사용하지 않습니다.

정상 공개 Core에서 H5/HX의 일곱 언어 글꼴·밑줄·취소선·검정 글자색과 일반 D 입력을 저장·독립 CFB/XML 조회·cold reopen·전체 저장 바이트 undo/redo로 확인했습니다. HX 생성 셀의 현재 Native owner를 통한 수식 삽입과 rich D 보존도 확인했습니다. 새 셀의 Canvas/IME, CLI/MCP 전체 행렬, H5 직접 참조 조회의 선형 비용 후속, 텍스트를 보존하는 범위서식은 별도 검증·구현 대상입니다. 이 예제는 npm의 새 버전 게시를 의미하지 않습니다.

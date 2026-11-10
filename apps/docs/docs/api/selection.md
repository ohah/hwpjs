# 선택과 서식

## 현재 선택에서 시작

`SelectionTarget`은 display 좌표와 소유 token을 함께 가집니다. 문자열 offset은 UTF-16 code unit입니다. 한글 조합이나 이모지를 단순 글자 수로 계산한 숫자를 원본 좌표처럼 넣지 마세요. `findTextMatch`나 현재 호스트 선택에서 나온 검증 가능한 대상을 사용합니다.

`getSelectionFormatting`은 현재 범위와 서식값을 읽습니다. 값의 `mixed`는 혼합이며 null은 관측 불가일 수 있으므로 둘을 false/0으로 바꾸지 않습니다. availableReason이 null일 때만 해당 명령 대상의 가용성이 확인됩니다.

<!-- example:formatting.ts -->
```ts
import {
  getSelectionFormatting,
  SET_CHARACTER_PROPERTIES_COMMAND,
  SET_PARAGRAPH_ALIGNMENT_COMMAND,
  SET_CHARACTER_UNDERLINE_COMMAND,
  type HeadlessEditor,
  type CharacterUnderlineKind,
  type CommandResult,
} from '@ohah/hwpjs';

export async function makeBold(editor: HeadlessEditor) {
  const selection = getSelectionFormatting(editor.getEditorState());
  if (!selection.target || selection.characterAvailableReason !== null) {
    throw Error(selection.characterAvailableReason ?? '선택이 없습니다.');
  }
  // size 단위는 1/100pt입니다. 1200은 12pt입니다.
  return editor.dispatchCommand(SET_CHARACTER_PROPERTIES_COMMAND, {
    target: selection.target,
    properties: { bold: true, size: 1200 },
  });
}

export async function alignCenter(editor: HeadlessEditor) {
  const selection = getSelectionFormatting(editor.getEditorState());
  if (!selection.target || selection.paragraphAvailableReason !== null) {
    throw Error(selection.paragraphAvailableReason ?? '선택이 없습니다.');
  }
  return editor.dispatchCommand(SET_PARAGRAPH_ALIGNMENT_COMMAND, {
    target: selection.target,
    alignment: 'CENTER',
  });
}

// typed kind라도 형식/대상에 따라 거부될 수 있습니다. status/error를 확인하세요.
export async function setUnderline(editor: HeadlessEditor, kind: CharacterUnderlineKind) {
  const selection = getSelectionFormatting(editor.getEditorState());
  if (!selection.target || selection.underlineAvailableReason !== null) {
    throw Error(selection.underlineAvailableReason ?? '선택이 없습니다.');
  }
  return editor.dispatchCommand(SET_CHARACTER_UNDERLINE_COMMAND, {
    target: selection.target,
    kind,
  });
}

// 호스트가 표시할 결과이며, 거부를 성공으로 바꾸거나 편집을 재전송하지 않습니다.
export function underlineResultMessage(result: CommandResult): string {
  if (result.status === 'rejected-unapplied') {
    if (result.error === 'UnsupportedCharacterUnderlineKind') {
      return '이 형식에서는 요청한 밑줄 종류를 지원하지 않습니다.';
    }
    if (result.error === 'StaleTarget') return '현재 선택을 다시 확인하세요.';
    return result.error ?? '현재 대상에 적용할 수 없습니다.';
  }
  if (result.error) return result.error;
  if (result.status === 'committed-with-snapshot') return '반영됐습니다.';
  if (result.status === 'committed-refresh-required')
    return '이미 반영됐습니다. refresh 후 상태를 확인하세요.';
  return `상태를 확인하세요: ${result.status}`;
}
```

함수 반환값도 `CommandResult`이므로 호출자는 status/error를 확인해야 합니다. 캐럿의 다음 입력 서식과 기존 범위의 서식 변경은 다릅니다. 보호된 범위·지원되지 않는 owner·오래된 token은 거부될 수 있습니다.

웹 편집기에서는 지원하는 본문에 커서를 두고 밑줄·취소선·글자색·언어별 글꼴을 고를 수 있습니다. 지정한 서식은 다음 입력부터 적용되며, 입력한 글자와 서식은 한 번에 실행 취소됩니다. 아래 선택 범위 명령에 길이 0의 범위를 넘기면 기존 `EmptyCharacterSelection` 계약이 적용됩니다.

## 대표 typed 명령

| export | payload 핵심 | 범위 |
| --- | --- | --- |
| SPLICE_TEXT_COMMAND | target, text, selectionVersion? | 지원 선택의 삽입/삭제/교체 |
| SET_CHARACTER_PROPERTIES_COMMAND | target, properties | size(1/100pt), bold, italic |
| SET_CHARACTER_UNDERLINE_COMMAND | target, kind | none / bottom / center / top |
| SET_CHARACTER_STRIKE_COMMAND | target, enabled: boolean | 원본 및 HWP5 생성 본문의 비어 있지 않은 선택의 취소선 on/off |
| SET_CHARACTER_TEXT_COLOR_COMMAND | target, color | 관측 가능한 선택의 `#RRGGBB` 글자색 |
| SET_CHARACTER_FONT_NAME_COMMAND | target, language, name | 관측 가능한 선택의 언어 하나의 글꼴 이름 |
| SET_PARAGRAPH_ALIGNMENT_COMMAND | target, alignment | 지원 문단 정렬 |
| INSERT_TABLE_COMMAND | target, options | 현재 본문 caret에 표 삽입. `getTableInsertAvailability`와 현재 관측 자원·크기 제한 확인 |
| EDIT_CREATED_TABLE_GRID_COMMAND | section, identity, action, index | 현재 세션의 생성 표 identity 대상 행·열 삽입/삭제. capability와 현재 생성 표 관측 필요 |
| EDIT_SOURCE_TABLE_GRID_COMMAND | section, tableNode, expectedRows, expectedColumns, action, index, layout? | 현재 원본 단순 표 주소 대상 행·열 삽입/삭제. capability·예상 격자·형식별 제한 확인 |
| APPLY_FORMATTING_PATCH_COMMAND | target, patch | 지원 대상의 글자·문단 결합 서식 또는 스타일 기준 초기화 |
| UNDO_COMMAND / REDO_COMMAND | token | Native 이력 |

위 표는 대표 명령이며 모든 export의 목록은 아닙니다. 기능별 계약·capability·대상 제한을 함께 확인하세요. 저수준 문자열 메시지가 있다는 사실만으로 typed public API라고 안내하지 않습니다.

표 격자의 `action`은 `insert-row`, `delete-row`, `insert-column`, `delete-column`입니다. 생성 표의 `identity`와 원본 표의 `tableNode`는 서로 다른 주소이며 임의로 변환하지 않습니다. 현재 문서·보기의 관측과 Core dispatch 수명을 사용하고, Native가 대상 소유권과 격자 정책을 다시 확인합니다. 전용 명령의 존재는 범용 표/셀 선택 API나 모든 owner·표 작업의 완료를 뜻하지 않습니다.

찾기·통계는 `findTextMatch`, `selectionMatchesText`, `getDocumentTextStatistics`가 제공합니다. 통계의 complete=false는 부분 관측입니다. OS clipboard는 `getSelectionClipboard`의 조회 결과와 호스트의 권한/읽기/쓰기를 연결해야 하며 rich clipboard를 보장하지 않습니다.

## UI와 headless 지원을 구분하기

버튼이 없거나 비활성이라고 엔진 전체 미구현으로 해석하지 않습니다. UI 연결 여부, 현재 문서/선택의 capability, typed 명령 존재, 실제 형식별 적용 결과는 서로 다릅니다.

| 사용자 작업 | 현재 웹 UI 연결 | headless 공개 경로 | 확인할 경계 |
| --- | --- | --- | --- |
| 굵게·기울임·글자 크기 | 개별 도구 연결 | `SET_CHARACTER_PROPERTIES_COMMAND` | `characterAvailableReason`과 실제 명령 결과 확인. 전체 글자 속성 대화상자 지원과 다름 |
| 밑줄 켜기/끄기 | 도구는 `bottom`/`none` 전환 | `SET_CHARACTER_UNDERLINE_COMMAND` | `center`/`top`은 별도 typed 인수. 아래 형식별 실제 결과 확인 |
| 문단 정렬 | 정렬 도구 연결 | `SET_PARAGRAPH_ALIGNMENT_COMMAND` | `paragraphAvailableReason` 확인. 여백·간격 전체 대화상자 지원과 다름 |
| 글자/문단 속성 대화상자 | 개별 명령과 전체 대화상자는 별도 | 위 제한된 typed 명령 | 대화상자 미연결이 개별 명령 부재를 뜻하지 않음 |
| 취소선 | UI 연결·선택 전달은 배포별 실브라우저 검증으로 별도 판정 | `SET_CHARACTER_STRIKE_COMMAND` | `strikeAvailableReason` 확인. caret/readonly/unknown source 및 아래 형식별 한계 유지 |
| 표 삽입 | 표 만들기 도구 연결; 메뉴 존재와 배포별 실제 적용 검증은 구분 | `INSERT_TABLE_COMMAND`, `getTableInsertAvailability` | 현재 본문의 접힌 caret·편집 권한·참조·관측 자원·크기/capability 제한 확인. 표셀·글상자·각주 등 임의 owner의 삽입 지원 아님 |
| 표 행·열 삽입/삭제 | 생성/원본 표의 선택과 capability에 따른 메뉴 연결 | `EDIT_CREATED_TABLE_GRID_COMMAND`, `EDIT_SOURCE_TABLE_GRID_COMMAND` | 생성 identity와 원본 tableNode를 구분하고 현재 관측을 사용. 모든 병합·분할·중첩 표나 임의 격자의 편집 지원 아님 |
| 그림 삽입 | 메뉴 목록만으로 실행 지원 판정 불가 | 이 표는 대응 전용 typed Core 그림 삽입 명령을 안내하지 않음 | 엔진·SDK·CLI/저수준 transport의 그림 기능을 별도 검증 없이 typed Core 지원으로 표시하지 않음 |

`MissingSelection`은 선택 필요, capability reason은 현재 대상의 제한, `StaleTarget`은 오래된 관측 대상, `UnsupportedCharacterUnderlineKind`는 해당 형식의 종류 제한입니다. 서로 같은 미구현 상태로 표시하지 마세요. 앱의 진행 중·문서 없음·UI 미연결 상태 역시 엔진 미구현과 별개입니다.

## center/top의 실제 형식별 결과

공개 정적 데모와 같은 b7 WASM으로 Noori 본문 한 선택에서 측정한 결과입니다. 모든 문서·표/필드·문자 범위의 지원으로 확대하지 않습니다.

| 형식/종류 | 실제 명령 결과 | 저장·재열기 |
| --- | --- | --- |
| HWP5 `center` | `rejected-unapplied`, `UnsupportedCharacterUnderlineKind` | 성공으로 안내하지 않음 |
| HWP5 `top` | `committed-with-snapshot` | 명시 조판 동의 후 저장·재열기에서 밑줄 관측 유지 |
| HWPX `center` | `committed-with-snapshot` | 기본 저장·재열기에서 밑줄 관측 유지 |
| HWPX `top` | `committed-with-snapshot` | 기본 저장·재열기에서 밑줄 관측 유지 |

예를 들어 `setUnderline(editor, 'center')` 또는 `setUnderline(editor, 'top')`을 호출할 수 있지만 반환된 `CommandResult.status/error`를 반드시 처리해야 합니다. 예제의 `underlineResultMessage`는 알려진 종류 거부와 stale 대상 거부를 구분하며, 미반영 거부를 성공으로 표시하거나 명령을 자동 재전송하지 않습니다. `underlineAvailableReason === null`은 해당 대상의 밑줄 명령 진입 조건이지 모든 kind의 성공 보장이 아닙니다. helper의 `underline` 관측값은 boolean/mixed/null이며 center와 top의 세부 종류를 구별하는 조회값은 아닙니다. 재열기에서 확인한 값도 boolean `true`이므로 저장된 종류가 정확히 top/center와 동치라는 독립 검증으로 주장하지 않습니다. 색·선 높이·화면의 시각적 위치도 검증하지 않았습니다. 이 검사는 API/저장 경로의 근거이며 원본 한/글과 같은 화면 조판이나 해당 종류의 UI 도구 연결을 증명하지 않습니다.

지원되지 않는 종류나 오래된 대상을 거부했다고 임의 메시지로 우회하지 마세요. 반영 후 관측 갱신·저장 동의 처리는 [편집·저장 예제](../guide/editing.md)를 따릅니다.

## 취소선의 선택 범위와 형식별 경계

`SET_CHARACTER_STRIKE_COMMAND`의 payload는 `{ target, enabled: boolean }`이며 `SetCharacterStrikePayload`로 공개됩니다. 유효한 대상 검증 후 `enabled`는 Boolean만 허용하고 문자열·숫자는 `InvalidCharacterStrikeEnabled`로 거부합니다. 기존 문자의 **비어 있지 않은 선택 범위**를 바꾸는 명령이며 caret의 다음 입력 서식 setter가 아닙니다. caret은 `EmptyCharacterSelection`입니다.

`getSelectionFormatting`은 `strike`의 true/false/mixed/null과 `strikeAvailableReason`을 제공합니다. 원본 관측이 null이면 `UnknownCharacterStrike`이며 false로 바꿔 토글하지 않습니다. readonly 관측은 `SelectionNotEditable`, 실제 typed 쓰기는 `ReadOnlyDocument`로 거부합니다. stale token·잘못된 owner·지원되지 않는 source 바인딩도 기존 검증을 유지합니다. 명시 명령을 호출해도 알 수 없는 HWP5 종류/HWPX shape는 각각 `UnsupportedCharacterStrikeKind`/`UnsupportedCharacterStrikeShape`로 미반영 거부되며 우회 메시지를 보내지 않습니다. 반환된 `CommandResult.status/error`를 확인하고 refresh-required나 거부를 성공으로 표시하지 마세요.

| 형식/대상 | 확인한 범위 | 남은 경계 |
| --- | --- | --- |
| HWP5에서 검사한 본문 선택 | Boolean on/off, 이력·저장·재열기; 관측 legacy charshape의 raw2/strike0를 같은 세션에서 off/on 후 원형 보존 | raw2를 일반 center-underline 지원으로 재해석하지 않음. 모든 역사적 버전·색/선 모양·별도 재열기 후 원래 모양 복원 보장 아님 |
| HWPX에서 검사한 본문 선택 | Boolean on/off, 실제 본문 텍스트·비대상 resource/XML·ZIP 보존과 저장·재열기 | 모든 source shape/owner 지원 아님. 알 수 없는 shape는 거부 |
| 필드가 있는 두 형식 문서 | **필드 밖** 선택 변경과 필드 시작/종료 원본 보존 | 필드 내부 취소선 편집은 미검증 |

이 typed 명령의 지원 근거는 명시 b7 엔진의 실제 API·이력·저장/재열기, 독립 CFB/XML/ZIP 보존 검사와 별도 packed ESM/DTS 소비 검증입니다. **공개 demo의 UI 연결·현재 선택 전달·빈 선택 처리는 해당 배포 자산과 일치하는 실제 브라우저 검증으로 따로 판정합니다.** SDK export나 pack 성공, 메뉴 존재만으로 공개 UI의 동작 또는 배포 완료를 판정하지 않습니다. 실제 bitmap 변화나 Boolean 관측도 원본 한/글 앱의 위치·선 높이·색을 포함한 시각 동치 검증이 아니며, 전체 필드/Canvas 지원으로 확대하지 않습니다.

## HWP5 생성 본문의 확장 서식

`SET_CHARACTER_UNDERLINE_COMMAND`, `SET_CHARACTER_STRIKE_COMMAND`, `SET_CHARACTER_TEXT_COLOR_COMMAND`, `SET_CHARACTER_FONT_NAME_COMMAND`는 같은 편집 세션에서 분할로 만든 최상위 HWP5 본문의 비어 있지 않은 선택에도 적용합니다. 기존의 종류·색·글꼴 인수를 그대로 사용합니다. 글꼴은 명령 한 번에 언어 하나를 지정합니다.

호스트는 현재 선택과 token을 전달합니다. Core가 현재 생성 문단 참조를 복사하고 Runtime이 Native 참조와 본문 소유권을 다시 확인합니다. 표시 문단 번호를 생성 ID로 바꾸거나, 저장·재열기를 거쳐 원본 문단으로 만들 필요는 없습니다. 실행 취소·재실행·다른 텍스트 변경 후 이전 참조를 재사용하면 `InvalidCurrentFormattingReference`로 거부합니다. 최신 token과 실제 관측을 사용해 새 대상을 만들어야 합니다.

빈 선택의 다음 입력 서식과 생성 셀·글상자·각주에 대한 확장 지원은 별도입니다. 원본 선택 및 HWPX의 기존 계약을 대체하지 않습니다.

## HWP5 생성 본문의 결합 서식과 초기화

`editor.queryFormatting(target, { fields })`로 현재 Native 관측과 쓰기 가능 여부를 조회하고, `APPLY_FORMATTING_PATCH_COMMAND`로 글자·문단 값을 한 요청에 적용합니다. 같은 세션에서 분할한 최상위 HWP5 본문도 대상으로 받으며 저장·재열기는 필요하지 않습니다.

결합 예시는 `patch: { character: { bold: true, size: 1900 }, paragraph: { alignment: 'CENTER' } }`입니다. 현재 문단 스타일을 기준으로 초기화하려면 `patch: { reset: { basis: 'paragraph-style', scope: 'character' } }`를 사용합니다. scope는 `character`, `paragraph`, `all`이며 reset과 일반 변경 값을 같은 patch에 섞지 않습니다.

한 적용은 한 실행 취소 항목이고 같은 값은 no-op입니다. query 후 문서가 바뀌었다면 이전 대상이나 binding을 재사용하지 말고 현재 상태에서 새 대상을 만드세요. unknown 관측을 기본값으로 바꾸지 않고 writable과 반환된 status/error를 확인합니다. 보호된 범위·잘못된 scalar·오래된 참조와 지원 밖 owner는 미반영 거부됩니다. 생성 셀·글상자·각주의 확대와 캐럿의 다음 입력 서식은 별도 범위입니다.

### HWPX 생성 본문의 결합 서식

같은 세션에서 분할·병합으로 만든 최상위 HWPX 본문도 `queryFormatting`과 `APPLY_FORMATTING_PATCH_COMMAND`를 지원합니다. 글자·문단 결합 적용과 현재 문단 스타일 기준 `character`·`paragraph`·`all` 초기화는 한 번의 적용과 실행 취소로 처리합니다. 현재 token·선택 범위·capability를 확인하며, 생성 셀·그리기·각주·캡션 등 중첩 문단까지 확대하지 않습니다.

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
} from "@ohah/hwpjs";

export async function makeBold(editor: HeadlessEditor) {
  const selection = getSelectionFormatting(editor.getEditorState());
  if (!selection.target || selection.characterAvailableReason !== null) {
    throw Error(selection.characterAvailableReason ?? "선택이 없습니다.");
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
    throw Error(selection.paragraphAvailableReason ?? "선택이 없습니다.");
  }
  return editor.dispatchCommand(SET_PARAGRAPH_ALIGNMENT_COMMAND, {
    target: selection.target,
    alignment: "CENTER",
  });
}

// typed kind라도 형식/대상에 따라 거부될 수 있습니다. status/error를 확인하세요.
export async function setUnderline(editor: HeadlessEditor, kind: CharacterUnderlineKind) {
  const selection = getSelectionFormatting(editor.getEditorState());
  if (!selection.target || selection.underlineAvailableReason !== null) {
    throw Error(selection.underlineAvailableReason ?? "선택이 없습니다.");
  }
  return editor.dispatchCommand(SET_CHARACTER_UNDERLINE_COMMAND, {
    target: selection.target,
    kind,
  });
}

// 호스트가 표시할 결과이며, 거부를 성공으로 바꾸거나 편집을 재전송하지 않습니다.
export function underlineResultMessage(result: CommandResult): string {
  if (result.status === "rejected-unapplied") {
    if (result.error === "UnsupportedCharacterUnderlineKind") {
      return "이 형식에서는 요청한 밑줄 종류를 지원하지 않습니다.";
    }
    if (result.error === "StaleTarget") return "현재 선택을 다시 확인하세요.";
    return result.error ?? "현재 대상에 적용할 수 없습니다.";
  }
  if (result.error) return result.error;
  if (result.status === "committed-with-snapshot") return "반영됐습니다.";
  if (result.status === "committed-refresh-required")
    return "이미 반영됐습니다. refresh 후 상태를 확인하세요.";
  return `상태를 확인하세요: ${result.status}`;
}
```

함수 반환값도 `CommandResult`이므로 호출자는 status/error를 확인해야 합니다. 캐럿의 다음 입력 서식과 기존 범위의 서식 변경은 다릅니다. 보호된 범위·지원되지 않는 owner·오래된 token은 거부될 수 있습니다.

## 현재 typed 명령

| export | payload 핵심 | 범위 |
| --- | --- | --- |
| SPLICE_TEXT_COMMAND | target, text, selectionVersion? | 지원 선택의 삽입/삭제/교체 |
| SET_CHARACTER_PROPERTIES_COMMAND | target, properties | size(1/100pt), bold, italic |
| SET_CHARACTER_UNDERLINE_COMMAND | target, kind | none / bottom / center / top |
| SET_CHARACTER_STRIKE_COMMAND | target, enabled: boolean | 비어 있지 않은 원본 선택의 취소선 on/off |
| SET_PARAGRAPH_ALIGNMENT_COMMAND | target, alignment | 지원 문단 정렬 |
| UNDO_COMMAND / REDO_COMMAND | token | Native 이력 |

글꼴·색·문단 여백/간격·표 생성·개체 삽입의 저수준 코드가 있어도 이 명령 목록 전체로 승격된 것은 아닙니다. 임의 문자열 메시지를 typed public API라고 안내하지 않습니다.

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
| 표/그림 삽입 등 | 메뉴 목록만으로 실행 지원 판정 불가 | 대응 전용 typed 명령은 현재 미제공 | 저수준 transport의 존재를 typed public 지원으로 표시하지 않음 |

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

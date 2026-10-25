# 선택과 서식

## 현재 선택에서 시작

`SelectionTarget`은 display 좌표와 소유 token을 함께 가집니다. 문자열 offset은 UTF-16 code unit입니다. 한글 조합이나 이모지를 단순 글자 수로 계산한 숫자를 원본 좌표처럼 넣지 마세요. `findTextMatch`나 현재 호스트 선택에서 나온 검증 가능한 대상을 사용합니다.

`getSelectionFormatting`은 현재 범위와 서식값을 읽습니다. 값의 `mixed`는 혼합이며 null은 관측 불가일 수 있으므로 둘을 false/0으로 바꾸지 않습니다. availableReason이 null일 때만 해당 명령 대상의 가용성이 확인됩니다.

<!-- example:formatting.ts -->
```ts
import {
  getSelectionFormatting, SET_CHARACTER_PROPERTIES_COMMAND,
  SET_PARAGRAPH_ALIGNMENT_COMMAND, type HeadlessEditor,
} from '@ohah/hwpjs';

export async function makeBold(editor: HeadlessEditor) {
  const selection = getSelectionFormatting(editor.getEditorState());
  if (!selection.target || selection.characterAvailableReason !== null) {
    throw Error(selection.characterAvailableReason ?? '선택이 없습니다.');
  }
  // size 단위는 1/100pt입니다. 1200은 12pt입니다.
  return editor.dispatchCommand(SET_CHARACTER_PROPERTIES_COMMAND, {
    target: selection.target, properties: { bold: true, size: 1200 },
  });
}

export async function alignCenter(editor: HeadlessEditor) {
  const selection = getSelectionFormatting(editor.getEditorState());
  if (!selection.target || selection.paragraphAvailableReason !== null) {
    throw Error(selection.paragraphAvailableReason ?? '선택이 없습니다.');
  }
  return editor.dispatchCommand(SET_PARAGRAPH_ALIGNMENT_COMMAND, {
    target: selection.target, alignment: 'CENTER',
  });
}
```

함수 반환값도 `CommandResult`이므로 호출자는 status/error를 확인해야 합니다. 캐럿의 다음 입력 서식과 기존 범위의 서식 변경은 다릅니다. 보호된 범위·지원되지 않는 owner·오래된 token은 거부될 수 있습니다.

## 현재 typed 명령

| export | payload 핵심 | 범위 |
| --- | --- | --- |
| SPLICE_TEXT_COMMAND | target, text, selectionVersion? | 지원 선택의 삽입/삭제/교체 |
| SET_CHARACTER_PROPERTIES_COMMAND | target, properties | size(1/100pt), bold, italic |
| SET_CHARACTER_UNDERLINE_COMMAND | target, kind | none / bottom / center / top |
| SET_PARAGRAPH_ALIGNMENT_COMMAND | target, alignment | 지원 문단 정렬 |
| UNDO_COMMAND / REDO_COMMAND | token | Native 이력 |

글꼴·색·취소선·문단 여백/간격·표 생성·개체 삽입의 저수준 코드가 있어도 이 명령 목록 전체로 승격된 것은 아닙니다. 임의 문자열 메시지를 typed public API라고 안내하지 않습니다.

찾기·통계는 `findTextMatch`, `selectionMatchesText`, `getDocumentTextStatistics`가 제공합니다. 통계의 complete=false는 부분 관측입니다. OS clipboard는 `getSelectionClipboard`의 조회 결과와 호스트의 권한/읽기/쓰기를 연결해야 하며 rich clipboard를 보장하지 않습니다.

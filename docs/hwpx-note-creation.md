# HWPX 각주 및 미주 생성

기존 본문 편집은 [주석 텍스트 편집](hwpx-note-text-edit.md), 일반 개체의 소유권 관측은 [차트와 수식 생성](hwpx-inline-object-creation.md)의 공통 계약을 재사용합니다.

## 소유권과 이력

생성은 HWPX의 Native가 관측한 현재 일반 본문, 원본 셀 또는 생성 셀을 대상으로 합니다. SDK 문단은 문서 전체 1 기반이고 Core 및 표시 문단은 0 기반입니다. 선택 대상은 기존 `getInlineObjectInsertTarget`의 owner와 session, revision, serial, 전체 텍스트 증인을 보유해야 합니다. Surface 좌표만으로 물리 문단이나 내부 lease를 만들지 않습니다.

공개 ABI는 외부 binding을 재검증한 뒤 `note_create_owner.observe`로 내부 lease를 발급하고 기존 History v2의 `.note_create` 명령을 한 번 적용합니다. 정책 초기화, 번호 갱신, 패키지 저장과 owner 이전은 하나의 parked history edge입니다. 공개 요청에 물리 노드, 내부 포인터, lease 또는 receipt를 받지 않습니다. 보호 필드, 자원 잠금, stale owner와 UTF16 서로게이트 내부 위치를 계속 거부합니다.

기존 번호 정책을 초기값으로 덮지 않습니다. 각 section에서 해당 종류 정책이 없는 경우에만 명시한 `initial_policies`를 적용합니다. 연속 번호 외 정책과 원본 구조에 따른 거부는 Native에 남깁니다. HWP5 생성, HWP3, HwpCtrl 및 React Native 지원을 추가하지 않습니다.

## 본문 축과 생성 후 커서

`note_body_plain_text.read`는 `paragraph_text_snapshot`과 `display_current_paragraphs`의 현재 순서 및 plain 본문 투영에 위임합니다. 생성 결과 본문 검증과 생성 후 caret UTF16 단위는 같은 plain 축입니다. 공통 `anchorText`의 번호 표식은 유지하고, 앞 바이트 삭제나 trim을 하지 않습니다. 빈 본문, CRLF, emoji, tab과 문자 그대로의 UFFFC를 보존합니다.

Native 성공 응답은 `{schemaVersion:1, caret:{section,paragraph,unit,coordinateSpace:'plain'}}`입니다. `paragraph`는 1 기반이고 `unit`은 본문 끝의 UTF16 단위입니다. Core는 새 표시 상태를 만든 뒤 해당 note 본문의 현재 selection을 생성합니다. 이 caret을 만들 수 없거나 성공 후 응답 정리에 실패하면 반영 사실을 유지하고 표시 복구가 필요한 결과로 분류합니다. 재삽입하지 않습니다.

## 공개 경로

- 선택 ABI `hwpx_edit_note_create_version()`은 1, 쓰기 ABI는 `hwpx_edit_insert_note(ptr,size)`입니다. 일반 WASM ABI 번호는 바꾸지 않습니다.
- 소스 SDK `createHwpxEditor`는 `supportsNoteCreationAbi`, `insertNote`, `insertFootnote`, `insertEndnote`를 제공합니다. 구형 또는 잘못된 version은 할당 전에 거부합니다.
- Core는 `INSERT_FOOTNOTE_COMMAND`, `INSERT_ENDNOTE_COMMAND`, `getNoteInsertAvailability`를 제공합니다. 큐 진입 전 target과 중첩 options를 소유 복사하고 큐 및 Runtime admission에서 다시 검사합니다.
- 기존 데모의 `insert-footnote`, `insert-endnote` 메뉴가 같은 Core 명령을 호출합니다. 열린 창의 선택과 문서가 바뀌면 제출을 막고, busy 중 중복 제출을 막습니다.

SDK 옵션은 다음 필드를 명시합니다. 형식 어휘와 실제 자원 존재, 잠금은 Native가 검증합니다. body 한도는 UTF8 1MiB이고 wire 전체는 2MiB입니다.

```ts
const options = {
  body: '',
  resources: {
    paragraph: observedParagraphId,
    character: observedCharacterId,
    style: observedStyleId,
  },
  format: {
    number_type: 'DIGIT',
    user_char: '',
    prefix_char: '',
    suffix_char: ')',
    superscript: false,
  },
  initial_policies: [],
};
const target = await editor.getInlineObjectInsertTarget({ section: 0, paragraph: 1 }, 0);
const state = editor.getEditorState();
await editor.dispatchCommand(INSERT_FOOTNOTE_COMMAND, {
  target,
  selectionVersion: state.stateVersion,
  options,
});
```

`initial_policies`의 각 항목은 `{section,shape}`입니다. shape는 format, line_length, line_type, line_width, line_color, between_notes, below_line, above_line, start, place, beneath_text를 명시합니다. 중복 section, 빠진 정의를 숫자0이나 임의 형식으로 대체하지 않습니다.

데모의 새 주석 생성 preset은 검증된 Native 자원 목록의 첫 paragraph, character, style ID를 명시해 사용합니다. 목록이 없으면 거부하며0을 추정하지 않습니다. 새 번호 모양은 DIGIT와 `)`입니다. 해당 종류 정책이 없는 section만 기존 own 생성 preset의 연속 번호 및 구분선 설정을 명시해 초기화합니다. 기존 정책은 그대로 남깁니다. SDK 및 Core 호출자는 자원과 형식을 직접 명시할 수 있습니다.

## 저장 및 이력 검증

통합 WASM에서 빈 HWPX에 각주와 미주를 각각 삽입하고 저장·재열기했다. 저장 파일의 XML에 올바른 주석 요소와 한글·이모지가 들어 있는 것을 확인했다. 삽입 직후 실행 취소 한 번으로 원본 전체 바이트를 복원했고, 다시 실행 한 번으로 삽입 후 저장 바이트를 복원했다. 저장한 문서를 다시 연 뒤 반환된 본문 좌표에서 문자를 추가한 경우에도 변경된 주석 본문과 실행 취소·다시 실행의 저장 결과를 확인했다.

이 검증은 WASM 어댑터의 삽입 및 본문 편집 경로를 다룬다. 공개 삽입 검증과 별도로 아래 삭제 후보를 준비했다. 삭제의 실제 Native, SDK 및 화면 검증은 아직 실행하지 않았다. 브라우저 입력과 공개 SDK 패키지 검증은 별도 범위다.

## 삽입 후 커서와 주석 본문 편집

페이지 배치 입력의 Native 문단 흐름에서 직접 주석 목록의 소유권을 확인합니다. 문단의 위치, 각주·미주 구분, 주석과 직접 목록의 노드가 일치할 때만 그 문단에 선택 소유권을 부여합니다. 표 셀, 그림 설명, 글상자, 잘린 문단은 이 경로에서 제외합니다.

공개 SDK를 패키지 이름으로 불러와 기존 각주·미주가 있는 HWPX에서 두 삽입 명령을 각각 검증했습니다. 삽입 후 커서가 새 주석 본문에 놓였고, 이어 입력한 내용이 저장과 재열기 뒤에도 유지됐습니다. 생성과 후속 입력은 별도 이력 단계입니다. 실행 취소·다시 실행과 관련 없는 ZIP 항목의 보존을 독립 XML 검사로 확인했습니다.

## 현재 참조에서 주석 삭제 후보

선택적 `hwpx_edit_note_delete_version()` 1과 `hwpx_edit_delete_note(ptr,size)`를 추가합니다. 일반 ABI 번호는 유지합니다. 소스 SDK는 `supportsNoteDeletionAbi()`와 `deleteNote({target})`, Core는 `DELETE_NOTE_COMMAND`와 `getNoteDeleteAvailability()`를 제공합니다. 기존 `getInlineObjectInsertTarget`으로 현재 문단의 주석 참조 바로 앞 UTF16 위치와 전체 anchor text 증인, 세션 및 revision/serial 바인딩을 관측합니다. 공개 요청에는 note 노드, 내부 주소, lease 또는 inventory 해시를 받지 않습니다.

Native는 바인딩과 실제 본문 또는 원본 셀 소유권을 다시 검사한 뒤, 정확히 같은 문단과 UTF16 위치의 실제 주석 참조 하나를 찾습니다. 문자 UFFFC만으로는 주석이라고 판정하지 않습니다. `note_delete_owner.observe`가 만든 내부 요청을 기존 `.note_delete` 단일 History v2 문서 edge에 전달합니다. 보호된 본문, 미지원 번호 정책, 불투명 본문 및 저장 전 생성 표 대기에 대한 기존 거부를 유지합니다. 생성 셀 주소와 HWP5 삭제는 이 후보에서 지원하지 않습니다.

데모의 `현재 주석 삭제`는 실제 Canvas의 정착된 단일 caret과 현재 `note-reference` 투영 하나가 일치할 때 활성화됩니다. UI 참조 노드는 삭제 권한이 아니며 Native가 독립적으로 재관측합니다. 비동기 owner 조회 중 문서나 선택이 바뀌거나 닫히면 제출하지 않습니다. 처리 중 중복 실행을 막고, 성공 후 전체 투영으로 삭제된 선택을 비웁니다. 생성 후 주석 본문 소유권 투영은 수정하지 않습니다.

후보 시험은 transport10, Core6, UI10과 별도 기존 생성 및 shell 회귀입니다. Native 공개삭제 wire3와 current5는 정적 명부8이며 아직 실행하지 않았습니다. 기존 WASM 286a에는 새 삭제 ABI가 없으므로 새 엔진 실행 결과로 간주하지 않습니다. 새 모듈 프로필 등록과 실제 SDK 및 GUI 검증은 정확 소스/산출물 승인 후 별도 cohort로 수행합니다.

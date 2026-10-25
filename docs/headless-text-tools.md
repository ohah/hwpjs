# 헤드리스 텍스트 도구

공개 `@hwpjs/core`는 `findTextMatch`, `selectionMatchesText`, `getDocumentTextStatistics`, `getSelectionClipboard`를 제공합니다. DOM이나 OS clipboard를 요구하지 않습니다. 원본 문서·저장·이력은 Native 세션이 계속 소유하고, 이 함수들은 현재 `EditorState` 관측값을 읽습니다.

찾기는 현재 불러온 표시 텍스트의 리터럴 검색이며 마지막 선택 다음에서 순환합니다. 반환되는 타깃은 UTF-16 좌표와 문서 토큰을 가지므로 `editor.setSelection(target)`에 전달할 수 있습니다. 잘못된 scalar 쿼리·중복 문단 식별자는 거부하고, 잘리거나 소유자를 정할 수 없는 문단은 검색 대상에서 제외합니다. 미로딩 문단까지 검색했다고 해석하지 않습니다. 정규식·문단을 가로지르는 검색·전체 바꾸기는 아직 제공하지 않습니다.

통계는 Unicode scalar 수와 공백 기준 어절 수입니다. 개체 자리표시자는 제외하고, window/limited/clipped 관측에는 `complete=false`를 반환합니다. 한글 프로그램의 언어별 단어 수 계산과 동일하다는 계약은 아닙니다.

clipboard 관측은 검증된 단일 문단 선택의 텍스트·타깃·읽기/변경 불가 사유·`stateVersion`을 제공합니다. 읽기 전용 텍스트의 복사와 Native 변경 권한은 별도입니다. 개체 선택을 텍스트로 바꾸지 않고, HWP 원본 좌표의 보호 구간과 생성 셀도 기존 선택 검증을 재사용합니다. OS clipboard 읽기/쓰기는 host가 수행합니다.

비동기 권한 요청 후 잘라내기/붙이기/바꾸기는 `SPLICE_TEXT_COMMAND`의 `selectionVersion`을 전달할 수 있습니다. 코어는 실행 시점의 정확한 `stateVersion`과 비교합니다. 같은 문서 revision에서 선택을 다른 곳으로 옮겼다가 되돌려도 이전 관측은 거부됩니다. 일반 타깃의 문서·소유자·scalar·원본 좌표 검증도 계속 적용합니다. 이 fence는 원본 텍스트나 편집값의 별도 캐시를 만들지 않습니다.

코어 검사는 `packages/core/tests/state/text-tools.test.ts`와 `clipboard-state.test.ts`가 소유합니다. 공개 API만 사용하는 데모의 clipboard 권한 거부·지연 선택 변경은 `apps/demo/tests/clipboard-bridge.test.ts`, 찾기/바꾸기의 중복·닫기·dispose 경합은 `text-tools-bridge.test.ts`가 검사합니다. fake DOM 검사는 실제 Canvas·OS clipboard E2E를 대체하지 않습니다. 브라우저 증거와 배포 상태는 [통합 검증 기록](headless-editor-verification.md)을 따릅니다.

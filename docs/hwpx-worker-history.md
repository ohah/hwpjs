# HWPX Worker 실행 취소 연결

native 이력·공개 API 계약은 [편집 세션](hwpx-editor-session.md)이 소유합니다. 이 문서는 Worker 메시지와 표시 갱신만 소유합니다.

HWPX `enable` 메시지는 native 이력을 한 번 켜고 `historyAvailable: true`를 반환합니다. 반복 enable은 기존 이력을 유지합니다. 새 load는 이력 활성화 상태를 초기화합니다. enable 이전 undo/redo는 HistoryNotEnabled로 거부됩니다.

`undo`·`redo`는 native 명령을 호출하고 `{ kind, changed, content }`를 반환합니다. 빈 이력은 changed=false입니다. content는 현재 native 저장본을 기존 reader로 다시 읽고 편집 적격성·앵커·필드 라벨 범위를 재조회한 표시 projection입니다. JS 문자열 역편집이나 별도 저장 이력을 만들지 않습니다.

native 변경 성공 뒤 표시 갱신이 실패하면 applied=true 오류를 반환합니다. 변경 전 오류는 applied=false이며 기존 세션을 보존합니다. HWP5 이력은 UnsupportedHistory로 거부합니다. Canvas 단축키·버튼 연결은 [Canvas 편집 이력](canvas-edit-history.md)이 소유합니다.

## 검증

ReleaseSafe 제품으로 `node --test tests/hwpx/canvas-preview.test.mjs tests/hwp5/reader-worker.test.mjs` 8/8을 통과했습니다. 실제 charshape·hyperlink·chart의 undo/redo 뒤 전체 표시 projection, 원본 ZIP 바이트 복원, 편집본 ZIP 재적용을 확인했습니다. chart의 계산 결과와 hyperlink 라벨 범위도 함께 복원되며 반복 enable·비활성 이력·파일 변경 초기화·거부 후 이력 보존을 검사합니다. 기존 HWP5 회귀도 포함합니다.

모사 Worker와 실제 제품 WASM 검사입니다. 실제 브라우저 단축키·OS IME·독립 조판 검증은 아닙니다.

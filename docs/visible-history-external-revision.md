# 외부 명령 뒤 Canvas history revision 동기화

Surface의 외부 명령은 Core/Native history를 바꾸면서 선택을 비울 수 있다. 같은 문서의 새 투영을 `direct.external`로 초기화할 때 Canvas controller는 기존 history bookmark를 보존한다. 이때 새로운 Native history revision을 관측하지 않으면 다음 입력 ACK의 before-selection이 이전 revision에 저장된다. undo가 실제 Native destination revision으로 돌아오면 해당 bookmark가 없어 visible 화면에서도 `history-unresolved`가 될 수 있다.

`packages/vanilla/src/surface.ts`의 기존 external-update 조건을 `externalUpdate`로 보관하고, 기존 document-change 분기와 함께 `initializeCapabilities`에 같은 current Core state의 capabilities/nativeHistoryRevision/nativeHistoryRevisions를 전달한다. 새 history stack 또는 Native 조회는 만들지 않는다. 문서 세대·선택 소유권·pending input/IME/history paint barrier·readonly·COW 정책은 그대로 유지한다. 선택/본문/문단 외부 ID를 합성하지 않는다.

새 revision 관측은 caret 게시 권한이 아니다. 이후 입력에는 기존 현재 owner/selectionVersion/Native permission이 필요하고, undo/redo에는 기존 bookmark 또는 Native가 증명한 구조 명령 receipt와 current 모델 검증이 필요하다. 관측되지 않은/foreign/stale/손상 destination을 숫자 node·본문·p@id로 복원하지 않는다. Noori의 원본 중복 pIDs를 외부 권한 키로 쓰거나 재번호하지 않는다.

`external-revision-caret.test.ts`는 실제 Surface/controller/renderer와 통제된 ACK로 null/undefined 선택의 외부 revision 증가 후 입력/undo/retype을 검사한다. 수정 전 같은 test는 caret 복원에 실패한다. 기존 ACK마다/여러ACK뒤 frame, owner 교체·lease 해지·IME·오류ACK 검사를 함께 실행한다. 실제 Native/GUI 증거는 별도 verification 패킷의 canonical fullDemo·공개 메뉴 다운로드 및 독립 CFB/XML oracle로 구분한다.

이 Surface 수정 자체는 Native/Worker ABI를 변경하지 않는다. 폼·표 편집과 함께 통합할 때는 해당 합본의 Native와 Worker로 실제 입력·실행취소·재입력·저장·재열기를 별도로 검증한다. 단일 모듈의 source 검사나 과거 합본 결과로 새 합본의 검증을 대체하지 않는다.

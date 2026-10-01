# HWPX native 편집 이력

현재 HWPX 일반·앵커·필드 텍스트 편집의 undo/redo를 지원합니다. HWP5 이력·구조 편집·한컴 조판 호환성은 이 구현의 완료 범위가 아닙니다. [Worker 연결](hwpx-worker-history.md)과 [Canvas 입력](canvas-edit-history.md)은 각 경계 문서가 소유합니다.

## 소유와 한도

`editor_checkpoint.zig`는 각 section의 현재 Sites와 field_dirty를 함께 deep-copy합니다. 원본 XML/ZIP·위치 표는 복사하지 않습니다. Sites.clone은 일반·계산 편집과 공유합니다. capture 실패는 현재 세션을 보존하며 exchange는 원본 source 포인터·길이·section 수·할당자 일치와 교체 상태 크기를 검사한 뒤 추가 할당 없이 교환합니다. 교체된 상태도 소유하므로 다시 exchange하면 재적용할 수 있습니다.

체크포인트와 History는 원래 세션이 살아 있는 동안만 사용하고 세션보다 먼저 deinit해야 합니다. 다른 open 세션에 적용하거나 직접 Session 편집과 History 명령을 혼용해서는 안 됩니다. WASM은 활성화 이후 모든 텍스트 명령을 History.apply로 전달합니다.

`editor_history.zig`는 undo/redo 스택을 소유합니다. 실패·무변경은 redo를 유지하고 새 편집 성공만 redo를 해제합니다. 항목 수 한도에서는 새 명령 성공 후 가장 오래된 undo를 제거합니다. 변경 후 checkpoint 크기 초과는 native 텍스트·dirty를 복구하고 이력 개수를 유지합니다. 스택 이동은 대상 목록 용량을 먼저 준비하므로 할당 실패 시 현재 모델을 교환하지 않습니다.

한도는 항목 수와 개별 checkpoint 바이트이며 스택 목록 메모리·현재 세션·일시적인 거래 초안까지 포함한 전체 메모리 한도가 아닙니다. 크기 산정은 Sites 배열·소유 텍스트·dirty 용량·section state 배열을 검사하며 정수 오버플로를 거부합니다.

## 공개 API

open 뒤 `enableHistory({ maxEntries = 16, maxCheckpointBytes = 8 * 1024 * 1024 } = {})`로 명시적으로 켭니다. 양수 u32만 허용하고 WASM 경계에서 두 한도의 곱을 128 MiB 이하로 제한합니다. 비활성 상태의 기존 편집 API 동작은 유지합니다.

`undo()/redo()`는 변경 여부 Boolean을 반환합니다. 비활성 이력은 HistoryNotEnabled, 중복 활성화는 HistoryAlreadyEnabled입니다. 성공한 open은 이력을 초기화하고 실패한 open은 보존합니다. close는 이력을 먼저 해제하며 이후 메서드는 EditorClosed입니다. optional WASM exports는 history_enable·undo·redo이며 기존 ABI version은 변경하지 않습니다.

## 검증 범위

`node tools/hwpx-edit-corpus-audit.mjs --history`는 추적 45개 파일에서 암호화 1개를 거부하고 비암호화 44개의 1,379문단에 일반 prefix 편집을 시도했습니다. 1,174건은 편집 후 제품 reader 텍스트, undo 원본 ZIP 바이트, redo 편집본 ZIP 바이트 및 재undo 원본을 모두 확인했습니다. 거부 뒤 이전 redo 유지도 181건 확인했습니다. 거부는 UnsupportedParagraphControl 157건과 InvalidFormulaNumber 48건이며 후자는 숫자 셀에 일부러 비숫자 prefix를 넣은 결과입니다. checkpoint 크기 거부나 원본 복원 불일치는 없었습니다. 앵커·필드 전용 명령·유효 숫자 치환 전수 검사의 대체가 아니며 독립 decoder 비교도 아닙니다.

native History 집중 검사는 Debug·ReleaseSafe·ReleaseFast 각각 3/3입니다. 합성 section의 전체 할당 실패에서 apply·undo·redo의 텍스트와 스택 개수 보존을 검사했습니다. 실제 shapeline의 분기·실패/무변경 redo 유지·항목 한도·성장 한도 복구도 확인했습니다.

ReleaseSafe 체크포인트 집중 검사 3/3은 실제 hyperlink dirty·chart 숫자·shapeline 합성 입력·headerfooter 빈 문단의 원본 ZIP 복원과 편집본 재적용을 확인합니다. 별도 전체 할당 실패와 다른 세션·크기 한도 거부 검사도 수행했습니다. 같은 제품의 바이트 비교이며 독립 조판 검증이 아닙니다.

ReleaseSafe 제품 공개 이력 검사 3/3은 보호 개체 삭제 거부·무변경·열기 실패 뒤 redo 보존, 분기·항목 한도·checkpoint 거부·JS 숫자·close 수명을 확인합니다. hyperlink undo는 dirty까지 복원해 원본 ZIP과 일치하고 redo는 편집 ZIP과 일치합니다. 현재 HWP5/HWPX 제품 audit은 각각 77/77·29/29, 9/9 빌드 단계로 통과했습니다. 전체 ReleaseSafe native 실행은 2,797/2,797 테스트·7/7 빌드 단계·종료 코드 0으로 완료했으며 모든 fixture 이력·원본 렌더링 완료로 해석하지 않습니다.

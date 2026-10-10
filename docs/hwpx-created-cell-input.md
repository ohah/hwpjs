# 생성 셀 Canvas 입력

## 생성 셀 Tab 이동

기존 `table-navigation.adjacentCell`이 source 표와 생성 표 주소를 구분합니다. 생성 표는 native snapshot의 row-major 셀 순서에서 Tab/Shift+Tab으로 이동하며 section/identity/row/column을 유지합니다. native 편집 명령이나 문단 번호를 합성하지 않습니다. 다른 identity·표 앞/뒤 경계·caret geometry 부재에서는 이동 대상을 반환하지 않습니다. 처리 중에는 기존 Canvas 입력 gate를 유지하며 행 자동 추가는 구현하지 않았습니다.

2026-10-11 navigation/actual Worker/기존 Canvas3파일203/203·fail/skip0·exit0(2358.144042ms)은 행 경계의 순/역 이동, 표/geometry 경계와 실제 생성 첫 셀 입력→Tab→둘째 셀 입력→Shift+Tab의 text 복원을 확인했습니다. 기본 승격 WASM을 사용하며 이동 자체가 추가 문서 요청을 보내지 않는지도 검사했습니다. 실제 브라우저 Tab/물리 IME 재검증은 별도입니다. 아래 Tab 미구현 문장은 이전 입력 단계의 기록입니다.

Canvas의 pump는 생성 셀 주소가 있으면 일반 paragraph splice 대신 `created-cell-text` 요청을 보냅니다. section/identity/row/column과 현재 셀 전체 UTF-8 텍스트를 보내며 source paragraph 필드를 합성하지 않습니다. Worker가 native 생성 셀 거래와 이력·저장 검증을 수행합니다.

`projectCreatedCellDraft`는 조합/대기 입력의 파생 표시만 만듭니다. 입력 대상 셀 view만 복사하며 원본 문단·다른 표/셀·native 저장 모델은 변경하지 않습니다. 응답 후 기존 Canvas pump가 committed 텍스트와 대기 입력을 비교합니다. native 거부 시 이전 committed 텍스트와 선택을 복원합니다. native 이력의 생성 셀 선택을 복원할 때 source 문단 범위 검사기를 사용하지 않습니다.

생성 셀 rows/paragraph views가 editable/selectable입니다. source 서식 범위·생성 셀 서식 편집은 아직 연결하지 않았습니다. 생성 셀 split/merge는 일반 source 문단 명령으로 보내지 않고 명시적으로 지원하지 않습니다. 여러 문단 셀과 줄바꿈 붙여넣기는 다음 계약이 필요합니다.

2026-10-11 actual Worker/WASM·simulated Canvas3/3·exit0(1930.122416ms)은 blank cell pointer 선택/IME draft/조합 완료의 단일 전용 명령·source 주소 부재/Unicode·escape 저장·XML NUL 거부 뒤 텍스트/저장 바이트 복구/Canvas undo·redo와 동일 저장을 확인했습니다. 최초 composition 검사는 기존 controller의 queueMicrotask를 기다리지 않아 명령 전송 전에 검사했으며 같은 호출을 microtask 뒤 확인하도록 수정했습니다. 기존 Canvas/geometry/flow 회귀202/202·exit0(2422.668584ms)도 통과했습니다. 별도 draft 검사로 대상 셀만 파생되고 원본 입력이 불변인지 확인합니다.

실제 브라우저 픽셀·물리 IME·클립보드·생성 셀 서식/여러 문단/Tab 이동/삽입 메뉴·정확한 inline/쪽 배치·host 위치 재배치와 기본 제품 승격은 남아 있습니다. 후보 WASM은 Worker 표시 단계의 `5cc964046d0424a45f2e483a4d0170a7a1e97c04fb0ecb0e6a53e5fda8070a45`를 그대로 사용하며 native 변경은 없습니다.

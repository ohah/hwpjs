# 신규 표의 현재 조회 응답

생성 셀 텍스트 변경 API와 검증 범위는 [생성 셀 텍스트 편집](hwpx-created-cell-text.md)을 따릅니다.

생성 거래의 문단 ID·서식 참조 검사는 [문서 참조 검증](hwpx-created-table-validation.md)을 따릅니다.

`created_table_snapshot.read`는 해당 section의 현재 staged registry에서 host 참조를 해결하고 표 치수·셀 geometry·문단 ID·UTF-8 텍스트·서식 참조를 독립 소유 응답으로 복사합니다. 텍스트/identity와 셀/행 배열의 부분 할당 실패를 해제합니다. geometry는 공통 Plan에서 파생하며 캐시나 수정 가능한 두 번째 문서 모델을 만들지 않습니다. native 호출자는 `deinit`으로 응답을 해제합니다.

WASM `hwpx_edit_created_tables(section)`와 선택적 JS `editor.createdTables(section)`은 생성 표만 반환합니다. 원본 표의 raw node 번호를 생성 객체 ID로 사용하지 않으며 기존 표 inventory는 기존 API가 소유합니다. 표 identity는 decimal string으로 출력해 u64 값이 JS Number에서 반올림되지 않습니다. instance_id·셀 paragraph_id·host_paragraph/anchor_unit은 서로 다른 용도입니다. host는 현재 native1기반 문단 순번이고 셀 row/column은0기반입니다. 이 응답만으로 기존 flat 문단 API에 신규 셀을 끼워 넣지 않습니다.

응답에는 identity/instance_id/host_paragraph/anchor_unit/rows/columns/width/height/resources/cells가 있습니다. resources는 paragraph/character/style/border_fill입니다. 셀은 paragraph_id/row/column/x/y/width/height/text를 반환하며 source_node는 없습니다. JS decoder는 정확한 field 집합·u64 decimal/u32·ID 중복·셀수·row-major 주소·폭 합/좌표/행 높이·well-formed Unicode를 검사합니다. 서식 참조의 문서 내 존재와 삽입 허가는 이 전송 검증의 책임이 아닙니다. 이전 WASM은 HwpxCreatedTablesAbiUnavailable이며 기본 제품에는 아직 새 ABI를 반영하지 않았습니다.

2026-10-11 native root 집중2/2·exit0(root+새1검사)은 두 staged 표·9007199254740993 identity·51/50폭·현재 host·텍스트 독립 복사·첫 행 완성 뒤를 포함한 모든 할당 실패·두 번 undo/redo·잘못된 section을 확인했습니다. 공개3파일14/14·fail/skip0·exit0(2880.9235ms)은 새 wire 반례·원본 table의 빈 생성 inventory/원문·기존 편집/이력 회귀입니다. JS에서 생성 명령으로 populated 응답을 만든 E2E는 아직 아닙니다.

후보 `/tmp/hwpjs-created-table-snapshot-20261011/bin/hwpjs.wasm`, SHA256 `937df0251bc6e6df217331eaa7e2153c98831fb8fb50616a5436811741140db3`의 ReleaseSafe build·fmt/diff도 exit0입니다. 기존 dirty 변경이 있어 깨끗한 게시 전체/native/GUI/Canvas 삽입 검증으로 확대하지 않습니다. 다음에는 전용 신규 셀 편집 주소·public 생성 명령의 ID/서식 검증·Worker/Canvas 현재 표 projection이 필요합니다.

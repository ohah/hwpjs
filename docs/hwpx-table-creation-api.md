# HWPX 표 생성 API

JS `editor.insertTable(section, paragraph, unit, { rows, columns, width, rowHeight, resources })`는 현재 native1기반 host 문단의 UTF-16 위치에 빈 표를 생성하고 양의 u64 decimal string identity를 반환합니다. section/row/column은0기반입니다. resources에는 paragraph/character/style/border_fill ID를 지정합니다. 크기는 HWPUNIT이며 width는 열수 이상, rows/columns/rowHeight는 양수이고 현재 최대100000셀입니다. 복잡한 병합/다중 문단 셀 생성은 이 입력에 없습니다.

`created_table_prepare`는 host·geometry·서식 검증과 자동 ID 계획으로 독립 소유 payload만 만듭니다. 변경은 기존 staging/history 거래가 소유합니다. WASM `hwpx_edit_insert_table`은 identity JSON 응답도 변경 전에 할당해 응답 할당 실패가 성공한 변경으로 남지 않게 합니다. 이력이 켜지면 한 번 생성이 한 checkpoint입니다. 이력 없이도 동일 staging 검증을 사용합니다. 기존 WASM에서 JS는 `HwpxTableCreationAbiUnavailable`을 반환합니다.

생성 셀 입력은 [생성 셀 텍스트 API](hwpx-created-cell-text.md), 조회는 [현재 생성 표 응답](hwpx-created-table-snapshot.md), 문서 전체 참조는 [생성 검증](hwpx-created-table-validation.md)을 따릅니다. 원본 표의 source node 번호와 생성 identity는 서로 대체할 수 없습니다.

아직 기본 배포에 반영하지 않았습니다. 생성 표의 Worker/Canvas projection·삽입 메뉴·host 텍스트/구조 변경 위치 재배치가 미완료입니다. pending 표가 있는 구역의 기존 host 텍스트/구조 편집에는 현재 보호 gate가 남아 있습니다. 공개 API가 곧 완성된 웹 에디터를 뜻하지 않습니다. HWP5 생성 저장도 별도 남은 범위입니다.

2026-10-11 후보 `/tmp/hwpjs-public-table-create-20261011/bin/hwpjs.wasm` SHA256 `92c1da35b0f444e45b87bc9aff088f93b754aaf4d3aa86dddff714aa02343b17`의 ReleaseSafe build·fmt/diff가 exit0입니다. 실제 charshape.hwpx 기반 공개4파일10/10·fail/skip0·exit0(254.540125ms)은2×2 생성/51·50폭/셀 입력 Unicode·escape·CR 저장·재열기/두 undo 원문복원/거부 후 두 redo 정확 저장/두 번째 생성 ID 회피, no-history 입력, 잘못된 크기·참조·host·예산 거부와 기존 조회·이력 회귀를 확인했습니다. 독립 전체 XML 비교나 실제 브라우저 UI 검증을 이 실행에 포함했다고 주장하지 않습니다. 전체 prepare 경로 할당 실패 검증도 별도 남아 있습니다.

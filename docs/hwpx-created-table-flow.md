# 생성 표 renderer 연결

후속 클릭·커서의 주소 경계는 [생성 셀 선택](hwpx-created-cell-selection.md)을 따릅니다.

`attachCreatedTableFlow`는 기존 표/문단 흐름에 생성 표의 로컬 geometry를 합치는 실험용 block 표시 경로입니다. 원문과 기존 base layout을 변경하지 않고 뒤 행·box·clip·flow picture를 같은 높이만큼 옮깁니다. 표0위치는 host 글자 앞, 나머지 위치는 host 문단 뒤에 배치하는 현재 prototype이며 정확한 중간 UTF-16 위치의 inline 조판이 아닙니다. 실제 저장 위치는 native anchor가 계속 소유합니다.

생성 표가 있으면 renderer는 아직 지원하지 않는 쪽 배치를 성공으로 표시하지 않고 `UnsupportedCreatedTablePagination`과 `created-table-block-prototype`을 보고합니다. 중첩/변환/pageArea host의 생성 표는 `UnsupportedCreatedTableHostLayout` 진단으로 남깁니다. 전체 fixture의 생성 표를 정확히 조판했다고 해석하지 않습니다.

renderer의 글자 스타일은 source 문단과 생성 셀 paragraph view를 구분해 조회합니다. `sameCreatedCell`이 생성 주소 비교를 소유하며 row geometry의 빈 셀 fallback이 생성 box를 원본 문단으로 잘못 선택하지 않게 합니다. 생성 셀의 rows는 직접 입력 연결 전 editable/selectable을false로 둡니다. 모델/저장에 가짜 source node나 flat 문단 ID를 넣지 않습니다.

2026-10-11 흐름/로컬 geometry 검사는 복수 표의 앞/뒤 배치, 이동 후clip, wide identity, Unicode 경계, 미지원 host 진단·원문layout 불변과 빈 셀 source 선택 거부를 확인했습니다. 실제 Worker3/3·exit0은 simulated Canvas paint frame과 생성4셀 boxes·명시적 표시 mode/셀 text 갱신·undo/redo·저장 보존, 체크박스/header-footer 회귀를 확인했습니다. 실제 Chromium pixel/포인터/IME 검증이 아닙니다. 초기 clip 위치 검증에서 label 행이 셀 text 높이에 포함된 것이 드러나 기존 표 흐름처럼 label을 제외하고 text row 높이를 다시 누적했습니다.

정확한 host 중간 위치·inline/중첩/쪽 배치, 셀 선택·커서·직접 입력·삽입 메뉴와 제품 WASM 승격은 아직 남아 있습니다.

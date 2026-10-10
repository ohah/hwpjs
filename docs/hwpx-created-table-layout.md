# 생성 표 로컬 셀 배치

후속 renderer 연결과 현재 표시 제한은 [생성 표 문서 흐름](hwpx-created-table-flow.md)을 따릅니다.

`layoutCreatedTable(table, measure, { x, y, maxRows })`는 native 생성 표 snapshot을 받아 로컬 셀 boxes/텍스트 rows/셀 paragraphs를 파생합니다. 실제 그리기·문서 쪽 위치·삽입 UI를 소유하지 않습니다. 기존 `tableGrid`의 track 배치·HWPUNIT→pixel 변환과 `layoutContent`의 grapheme/줄 측정을 재사용합니다. 별도 XML/문서 모델을 생성하지 않습니다.

생성 셀의 표시 주소는 section과 createdCell.identity/row/column입니다. 원본 tableNode/listNode나 기존 flat paragraph 번호를 합성하지 않습니다. 글자 리소스 범위도 같은 characterRanges 계약으로 파생해 기존 측정 함수가 현재 리소스를 참조할 수 있습니다. 각 셀은 독립 소유 paragraph view를 가지며 원본 입력 snapshot을 변경하지 않습니다.

열폭은 native 계획의 폭을 pixel로 변환한 값입니다. 셀 텍스트에는 표시용6px padding을 적용하고 행 높이는 입력 치수와 측정된 글자 높이 중 필요한 크기로 표시합니다. 이는 source 고정 높이/정확한 한글 조판의 재현이 아니며 모델/저장 높이를 수정하지 않습니다. 좁은 셀의 넘치는 글자는 cell clip으로 제한합니다. 행 예산 초과는 잘린 셀로 통과시키지 않고 `CreatedTableLayoutRowBudgetExceeded`로 거부합니다.

2026-10-11 로컬 배치/Worker projection 집중4/4·exit0은 단위 폭 합·두 번째 셀 위치·wide identity·UTF-16 surrogate 경계·글자 서식 참조·원본 불변과 행 예산 거부를 확인했습니다. 공통 grid 회귀는 별도 실행으로 확인합니다. 실제 renderer 통합, 문서 host 위치의 줄/쪽 배치, hit-test/커서/셀 직접 입력, 브라우저 그림 검증은 아직 남아 있습니다.

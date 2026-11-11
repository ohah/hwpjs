# 원본 HWPX 셀 높이 균등화

`EQUALIZE_SOURCE_TABLE_CELL_HEIGHT_COMMAND`는 현재 F5 직사각형 셀 블록에서 소유 Surface가 발급한 `SourceTableCellHeightTarget`으로 실행합니다. 표 메뉴의 ‘셀 높이를 같게’와 우클릭 메뉴는 같은 Surface/Core/Worker 경로를 사용하며 Vanilla·React·Svelte가 공유합니다. Native의 기존 원자적 셀 크기 배치를 재사용합니다.

## 지원 범위와 계산

최상위 원본 HWPX 표의 모든 열을 포함한 연속 두 행 이상을 지원합니다. 전체 격자가 완전한 비병합 셀이고 최대 4096셀, 셀 간격0이며 각 행의 원본 높이가 일치해야 합니다. 선택 행의 HU 높이 합을 보존해 행 수로 나누고 나머지는 위쪽 행부터 1HU씩 배분합니다. 높이0도 실제 값으로 취급합니다. 너비·미선택 셀·표 바깥 크기 선언과 다른 XML/ZIP payload는 보존합니다.

[HWP5 연결](hwp5-cell-size-equalization.md)은 별도 원본 metadata 계약을 따릅니다. 생성·중첩 표, 병합 셀, 일부 열만 선택한 영역 및 전체 높이0인 자동 성장 표는 아직 지원 범위 밖입니다. 이 제한은 전체 목표의 남은 작업이며 한컴의 제한이라고 해석하지 않습니다. 공식 [셀 높이를 같게](https://help.hancom.com/docs/ko-KR/mergedProjects/hoffice_hwp/topics/hancomoffice/hwp/table/table(eqheight).htm)의 직사각형 선택 의미와 [표/셀 속성: 셀](https://help.hancom.com/hoffice130/ko-KR/Hwp/table/tableattribute/table(cellattribute).htm)의 행 높이·내용 성장·안여백 의미를 기준으로 합니다. 합 보존·나머지 배분은 자체 편집 정책이며 한컴 내부 계산과 동일하다고 주장하지 않습니다.

## 내용 측정과 소유권

기존 셀 조판기를 저장 높이0·위 정렬인 측정 복사본에 적용해 실제 텍스트·개체·유효 안여백의 최소높이를 구합니다. 제안 높이를 적용한 전체 문서를 기존 renderer로 다시 조판해 선택 셀이 분할되지 않고 요청 높이에 들어가는지 검증합니다. 원본 저장값이나 UI 입력을 측정 결과로 덮어쓰지 않습니다.

`source-table-rectangular-grid.mjs`가 너비·높이 계획의 주소별 슬롯 구성을 공유합니다. 셀 수 n에 대해 계획·측정 결과 대조는 선형 순회와 Map/Set을 사용하며, 행마다 전체 셀 재검색·정렬 및 선택 셀마다 전체 box 검색을 하지 않습니다. 실제 문서 조판 비용까지 O(n)으로 증명한 것은 아닙니다.

최종 box 높이의 NaN·Infinity·음수·문자열·누락과 중복 box는 거부합니다. 기존 후보에서 NaN이 차이 비교를 통과하는 반례를 재현했고 유한 숫자 검사로 차단했습니다. 반려 시 편집과 이력은 바뀌지 않습니다. 선택·문서·레이아웃·글꼴·draft·close 수명을 검사하고, 측정 epoch가 없는 호스트는 접수 시 재측정합니다. 무변경은 redo를 보존하며 반영 후 잘못된 응답은 refresh-required로 처리합니다.

## 검증 결과

결합 후보의 실제 Native 높이17·나누기9·너비11·공통 격자2건이 통과했습니다. 역순 입력 1024·2048·4096셀의 원본 접근 횟수, 정렬 미사용과 정확한 크기 결과를 검사했습니다. NaN 반례는 이전 구현의 허용과 수정본의 거부를 같은 실제 문서 모델로 확인했습니다. 메뉴·Core/Worker 회귀와 제한된 타입·lint·포맷 검사를 별도 실행했습니다. Node 전용 label 시험을 Bun에서 실행한 준비 오류는 Node에서 재실행했으며 제품 실패나 정상 통과에 합산하지 않습니다.

최종 공개 후보의 실제 F5·메뉴·다운로드 검증은 `zig-out/verification/cell-height-delivery-r1` 아래 각 `gui-*/result.json`이 소유합니다. 성공 시 전체 XML과 다른 ZIP payload를 독립 Python 일반/-O 모드로 대조하고 잘못된 기대 높이 거부, undo/redo 바이트 복원과 저장본 재열기를 확인합니다. 소유 브라우저·서버 종료와 manifest/WASM/Worker 해시를 각 결과에 남깁니다. 이 집중 검증은 한컴 앱과의 픽셀 조판 동치나 모든 표 지원 완료를 의미하지 않습니다.

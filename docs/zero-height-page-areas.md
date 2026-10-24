# 높이0인 텍스트 쪽 영역

HWPX subList의 textHeight는 OWPML ParaList 스키마의 nonNegativeInteger이며0을 허용합니다. Native 파서는 부재와0을 구분해 보존합니다. 참조 스키마는 `reference/rhwp/mydocs/manual/OWPML SCHEMA/ParaList XML schema.xml`입니다. HWP5 쪽 영역 어댑터도 높이0을 양수로 보정하지 않고 그대로 전달합니다.

`page-area-flow.mjs`는 선언 높이0을 허용하되 양수 밴드의 CENTER/BOTTOM 여유 정렬을 적용하지 않습니다. 내용은 계속 측정하고 사용 가능한 물리 영역을 넘으면 넘침 정보를 반환합니다. 너비 부재·너비0·높이 부재·음수/비정수 높이의 지원으로 확장하지 않습니다. 양수 높이의 기존 정렬·넘침 정책은 유지합니다.

선언 높이와 물리 영역 높이가 모두0이고 측정 결과가 빈 텍스트/간격뿐이면 원본 문단을 높이0인 sourceObjectAnchor 행으로 유지합니다. 이 행은 표시용 잉크/선택 영역을 갖지 않아 본문 입력을 가로채지 않습니다. 정의 자체를 버리지 않으므로 홀짝·숨김·선언 변경 시점의 선택은 기존 선택기가 소유합니다. 텍스트나 자동 번호가 있으면 이 빈 영역 경로를 사용하지 않고 내용과 넘침을 유지합니다. 원본 문서와 편집 권한 모델은 변경하지 않습니다.

`mise exec -- node --test tests/hwpx/page-area-flow.test.mjs tests/hwp5/page-area-content.test.mjs`는 양수/0 높이, 빈 영역의 입력 비간섭, 내용 보존, CENTER/BOTTOM, 홀짝·숨김·예산·잘못된 값과 HWP5 원값 전달을 검사합니다. 이 계약은0 높이의 표/도형 영역, 빈 영역에 새 내용을 넣는 UI, 한글 조판 동치 전체의 완료를 뜻하지 않습니다.

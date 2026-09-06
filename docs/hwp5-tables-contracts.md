# HWP5 표·셀 계약

[모듈 인덱스](hwp5-modules.md) · [과거 공통 기록](hwp5-foundation.md)

이 문서는 해당 주제의 현재 책임·소유권·미지원 경계를 소유합니다. 계약과 새 검증 결과는 해당 주제에서 관리하고, 내용이 커지면 별도 문서로 분리하여 연결합니다.

- `table.zig`·`table_cell.zig`·`caption.zig`는 payload, `table_zone.zig`는 원시 좌표/명시적 열-행 또는 행-열 view, `table_lists.zig`는 TABLE 전후 직접 형제의 캡션/셀 역할을 소유합니다. `table_validation.zig`는 부모·중복·셀 수·병합 범위·영역/참조를 검사합니다. list/zone 배치는 호출자가 선택하며 길이로 자동 추정하지 않습니다. 확장 꼬리 의미와 시각적 배치는 미검증 범위입니다.

- `table_grid.zig`는 Rectangle의 병합 경계 SSOT, 행별 시작 셀 수, 비중첩/완전 격자 채움을 소유합니다. table_validation은 할당자를 받아 이 검사를 호출합니다. 칸 수만큼 메모리를 할당하거나 총면적만으로 비중첩을 가정하지 않습니다. 공유 행 경계에서는 제거를 추가보다 먼저 처리합니다.

- `cell_attributes.zig`는 호출자가 선택한 list view의 셀별 bit 16~19를 해석하고 원값을 보존합니다. `cell_extension.zig`는 명시적으로 선택한 관측 꼬리의 선택 text_width/marker와 remaining 원문만 소유합니다. 0xff는 ParameterSet 표시이지 고정 offset 필드명이나 유효성 보장이 아닙니다. Cell.parse는 여전히 꼬리 전체를 보존하며 자동으로 확장 형식을 가정하지 않습니다.

# HWP5 ParameterSet·이름·참조 계약

[모듈 인덱스](hwp5-modules.md) · [과거 공통 기록](hwp5-foundation.md)

이 문서는 해당 주제의 현재 책임·소유권·미지원 경계를 소유합니다. 계약과 새 검증 결과는 해당 주제에서 관리하고, 내용이 커지면 별도 문서로 분리하여 연결합니다.

- `parameters/field_name.zig`는 관측 0x021b Set의 직접 0x4000 문자열 규칙을 소유하며 셀과 책갈피가 공유합니다. `body/bookmark.zig`는 bokm의 직접 CTRL_DATA 소유 관계와 이름 진단을 담당합니다. sources.inspectBodyDetailed는 기존 ParameterSet 파싱 결과를 재사용하고 section은 parameters/bookmarks 보고서를 함께 연결합니다. 이름 부재·빈 문자열·미지 Set·미지원 타입을 구분하며 이름 중복의 문서 전역 의미나 탐색 위치는 별도입니다.

- `hwp5/parameters/types.zig`는 배치/노드 계약, `parser.zig`는 bounded ParameterSet 트리를 소유합니다. 헤더 4/6바이트와 NULL 4/0바이트 선택을 숨기지 않으며 배열은 관측 shared-ID 형식입니다. 원본 정수 4바이트/UTF-16과 소비하지 않은 꼬리를 보존합니다. 알 수 없는 타입을 건너뛰지 않고 UnsupportedParameterType으로 반환합니다. `cell_field.inspect`는 이 공통 파서로 지정된 root set의 직접 이름 항목만 검사합니다.

- `parameters/references.zig`는 중첩 PIT_BINDATA의 1-based 참조, `sources.zig`는 DocData/ControlData/표 셀 확장 순회와 진단 집계를 소유합니다. secd의 직접 ControlData에만 section_control 문맥을 전달하며 `presentation_reference.zig`가 관측된 정확한 Set/Item 경로와 단일 그라데이션 플래그 4에서 사용하지 않는 이미지 ID 0을 인정합니다. 다른 채우기 종류/문맥으로 일반화하지 않습니다. binary_refs는 이 비활성 부재를 포함한 검사 항목 수이지 실제 스트림 해결 수가 아닙니다. `cell_field.fromDocument`를 재사용해 같은 Set을 다시 파싱하지 않습니다. UnsupportedParameterType만 보류로 바꾸고 잘림·한도·참조·셀 이름 오류는 전파합니다. parsed/unsupported/opaque/trailing을 전체 완료 수로 합산하지 않습니다.

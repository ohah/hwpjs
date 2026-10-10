# 표 생성 서식 선택 목록

`created_table_resource_options.read`는 기존 header 리소스 색인과 현재 생성 문단·글자 서식 intents를 합쳐 실제 사용 가능한 paragraph/character/style/border_fill ID 배열을 반환합니다. 배열은 오름차순·중복 없음이며0을 유효 ID로 보존합니다. 숫자를 배열 순번으로 해석하지 않습니다. style/border_fill에 추측한 기본 ID를 넣지 않습니다.

목록의 소유권은 호출자에게 있고 `Options.deinit`으로 네 배열을 해제합니다. 부분 할당 실패도 완료된 배열을 해제합니다. 생성 거래의 `created_table_resources.validate` 역시 이 목록을 읽어 존재 여부를 검사하므로 UI 선택 가능 목록과 native 생성 허용 목록을 따로 관리하지 않습니다.

선택적 WASM `hwpx_edit_table_creation_resources()`와 JS `editor.tableCreationResources()`는 같은 네 배열을 반환합니다. JS는 정확한 필드 집합·u32·오름차순·중복 없음의 전송 계약을 검사합니다. 이전 WASM에서는 `HwpxTableCreationResourcesAbiUnavailable`입니다. 조회는 문서·이력을 변경하지 않으며 caller가 목록에 없는 ID로 생성하려 해도 native가 거부합니다.

아직 Worker 표시 응답·표 삽입 form/menu·host 서식 상속에 연결하지 않았습니다. 이 조회 API만으로 UI 표 생성이 완료됐다고 해석하지 않습니다.

2026-10-11 native ReleaseSafe 집중3/3(root 포함)·exit0은 현재 생성 서식 참조 수락/없는 네 참조 거부, sparse0/최대u32 정렬·중복 거부와 ID 목록 전체 할당 실패를 확인했습니다. 첫 unit 테스트는 runtime 배열 대신 comptime tuple을 전달해 컴파일 실패했으며 같은 entry 타입의 배열로 고쳤습니다. 전체 header/패키지 읽기 경로의 할당 실패 전수 검사는 이 작은 목록 검사와 구분합니다.

최종 후보 `/tmp/hwpjs-table-resource-options-final-20261011/bin/hwpjs.wasm` SHA256 `6c59a37808b3b6c451c297e9f5816e07334ae257d50d5c081ed7c869e6a11d16`의 ReleaseSafe build·fmt/diff가 exit0입니다. 공개 생성/Worker/history3파일9/9·exit0(1899.92975ms) 및 후속 생성 목록4/4·exit0(311.407208ms)은 실제 원본 목록과 현재 서식 clone 조회/undo 제거·조회 불변 및 생성/셀 입력/저장/history 회귀입니다. 기본 배포 WASM을 교체하지 않았고 브라우저 form/menu 증거가 아닙니다.

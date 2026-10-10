# 신규 표 삽입의 모델·거래 경계

RHWP의 로컬 `tableCommands`는 생성 dialog의 행/열을 native createTable/createTableEx에 전달하고 snapshot 거래가 성공하면 첫 셀 입력 위치를 복원합니다. 이 흐름을 목표로 하되 그 프런트엔드만 붙이는 것으로 삽입 지원을 주장하지 않습니다.

현재 HWPX 구조 모델의 보호 위치는 immutable XML element_index를 사용하고 체크포인트는 현재 편집값만 소유합니다. 원본 XML 트리를 교체하거나 신규 표에 가짜 원본 node index를 주면 provenance·source_pointer·기존 참조/이력이 깨질 수 있습니다. 신규 객체에는 원본 위치와 구분되는 현재 소유 모델·안정된 identity·생성 셀 문단과 서식 참조가 필요합니다. 저장·조회·이력은 이 같은 현재 값을 사용해야 합니다.

## 첫 구현: 공통 생성 치수 계획

`src/model/table_creation_plan.zig`는 새 표의 rows/columns/총폭/행 높이로 좌표와 셀 치수를 계산하는 포맷 독립 preflight입니다. 폭 나머지는 앞 열부터 한 단위씩 배분해 각 셀 폭이 양수이고 합계가 총폭과 정확히 같습니다. 높이 u32 오버플로·행/열0·너비 부족·높이0·호출자 셀수 예산 초과·범위 밖 셀을 거부합니다. 힙 할당·원본/XML·ID·서식 리소스·undo 상태를 소유하지 않습니다. 원본 표의0치수를 금지하는 읽기 명세가 아니라 신규 생성 정책이며, 각 포맷 serializer의 별도 필드 폭 제한도 아직 적용하지 않습니다.

560개 폭/열 조합의 첫·중간·마지막 행 전체를 독립 순환 배정 oracle과 대조합니다. 0/예산/오버플로/최대 u32/위조 Plan/범위 밖 반례도 검사합니다. root에 모듈을 직접 등록해 향후 전체 native 검증에 포함합니다. 이 단계만으로 표 삽입·저장·WASM/Worker·UI가 구현됐다고 해석하지 않습니다.

## 이어서 필요한 구현

2026-10-11 최종 `zig test src/model/table_creation_plan.zig -O ReleaseSafe`는2/2·exit0이며 fmt/diff 검사와 별도 prefix `/tmp/hwpjs-table-creation-plan-20261011`의 최종 ReleaseSafe build도 exit0입니다. 기본 WASM은 교체하지 않았습니다. 새 모듈이 포함된 전체 `zig build test`·깨끗한 게시 전체 gate는 아직 완료하지 않았고 기존3859테스트 실행에 소급하지 않습니다.

현재 객체 identity와 표/셀/문단 소유 모델, ID/리소스 참조 정책, 실패 원자적 Session/Checkpoint 거래를 추가해야 합니다. HWP5 레코드와 HWPX XML 작성기는 그 모델에서 각각 파생하고 미지원 원문을 보존해야 합니다. 공개 API·Worker·UI 연결은 그 뒤입니다. 최종 게이트에는 실제 픽스쳐의 삽입 전후 독립 포맷 비교·모든 할당 실패·복수 삽입/중첩·저장 재열기·undo/redo·Canvas 첫 셀 입력이 필요합니다. 현재 활성 범위는 HWP5/HWPX이며 HWP3는 제외합니다.

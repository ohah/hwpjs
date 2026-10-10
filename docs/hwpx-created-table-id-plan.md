# 생성 표 ID 자동 계획

`created_table_source_ids.plan(session, cells)`는 현재 문서의 원본 part·생성 문단·생성 표를 읽어 object identity(u64), 저장 shape ID(u32), 셀 문단 ID(u32 배열)를 반환합니다. 호출자는 `Plan.deinit`으로 문단 ID 배열을 해제합니다.

검증과 계획은 같은 임시 source-part 수집기를 사용합니다. section 트리는 빌리며 header/masterpage 추가 트리만 소유합니다. 원문/생성 ID 정책은 기존 공통 paragraph 검사기와 shape ID 검사기가 소유합니다. XML·ZIP 파서를 복제하지 않습니다. 최소 빈 양수 ID를 선택하고 숫자 오버플로는 거부합니다. 원본 shape 중복은 그대로 보존하며 현재 생성 shape ID의0·중복·원본 충돌은 거부합니다.

계획은 문서 변경이나 ID 예약이 아닙니다. 동일 상태에서 반복하면 같은 계획이 나옵니다. 생성 거래가 현재 모델에 커밋한 후 다음 계획에 반영됩니다. 오래된 계획은 staging의 문서 ID 검증을 다시 거치므로 충돌 시 거부됩니다. 공개 API 호출과 history command를 하나의 생성 거래로 연결하는 단계는 아직 남아 있습니다.

실제 charshape.hwpx에서2×2표의 계획 반복·생성 후 identity/shape/셀 ID 회피·원문 불변을 검사합니다. source shape 검사에는 희소 ID·넓은 원본·원본/현재 생성 충돌 및 작은 트리의 모든 할당 실패를 포함합니다. 전체 계획 경로의 할당 실패·public JS 성공 생성·Worker/Canvas UI는 아직 별도 완료 검증이 필요합니다.

2026-10-11 ReleaseSafe 집중4/4(root 포함)·최종 source 할당 실패 집중2/2(root 포함)와 fmt/diff·ReleaseSafe build가 exit0입니다. 후보 prefix는 `/tmp/hwpjs-created-table-id-plan-20261011`이며 기본 배포 WASM은 교체하지 않았습니다. 전체 corpus/native/GUI 통과 주장으로 확대하지 않습니다.

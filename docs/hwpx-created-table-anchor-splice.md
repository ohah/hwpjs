# 생성 표 anchor 텍스트 이동 계획

후속 일반 본문 거래와 현재 보호 범위는 [host splice 거래](hwpx-created-table-host-splice.md)를 따릅니다. 아래 미연결 문장은 순수 계획 단계의 기록입니다.

`model.point_splice.Change`는 checked start/end와 좌우 affinity의 zero-width 이동만 소유합니다. 기존 title_mark_position.splice도 이 연산을 사용하며 제목 표시의 이동/할당 정책은 유지합니다. 정수 delta 공식을 따로 관리하지 않습니다.

`created_table_anchor_splice.unit`은 u32 영역과 표 보호 정책을 추가합니다. 표 anchor를 가로지르는 삭제는 ProtectedCreatedTableAnchor이며 범위 경계 자체의 삭제는 허용합니다. 같은 위치 삽입은 right affinity로 표를 새 텍스트 뒤로 옮깁니다. 위치·범위 끝 오버플로를 거부합니다. UTF-16/원문 범위 검증은 실제 텍스트 거래가 소유하므로 이 정수 계획을 입력 허가로 사용하지 않습니다.

2026-10-11 ReleaseSafe 집중4/4(root 포함)·exit0, fmt/diff·ReleaseSafe build exit0입니다. 5184좌표 조합을 독립 signed displacement와 대조하고 crossing·최대u32/usize·잘못된 change·좌우 affinity와 기존 title split/splice/할당 실패를 확인했습니다. 후보 prefix는 `/tmp/hwpjs-created-anchor-splice-20261011`이며 기존 작업 트리 변경을 포함하므로 깨끗한 게시/전체 회귀 결과로 확대하지 않습니다.

registry 이동·본문 splice·저장/rollback/history 거래 연결과 실제 Unicode/표/독립 XML 검증은 남아 있습니다. 현재 UnsupportedCreatedTableHostEdit gate와 기본 데모 WASM은 변경하지 않았습니다. split/merge/필드 위치 재배치도 별도입니다.

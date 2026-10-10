# 생성 표와 일반 본문 splice 거래

`created_table_host_splice.apply`는 현재 host 참조와 UTF-16 입력 길이를 확인하고 registry 후보의 해당 anchor만 공통 이동 계획으로 변환합니다. 기존 checkpoint를 캡처한 뒤 후보 registry를 설치하고 기존 private 본문 splice를 호출합니다. 저장 검증까지 통과해야 커밋하며 실패·no-op은 checkpoint rollback으로 표와 본문을 함께 복원합니다. 원본 XML/ZIP은 변경하지 않습니다.

Session의 원래 plain splice 구현은 private callback으로 유지합니다. 생성 표가 없으면 기존 경로를 그대로 호출합니다. 생성 표가 있으면 일반 본문 splice에 위 거래를 적용합니다. anchored 입력·수식이 있는 대상 구역·split/merge·필드 전용 편집은 아직 UnsupportedCreatedTableHostEdit 보호를 유지합니다. UI는 새 native 능력 조회와 검증이 끝나기 전 기존 host read-only gate를 유지합니다.

2026-10-11 ReleaseSafe 집중3/3(root 포함)·exit0, fmt/diff·ReleaseSafe build exit0입니다. 실제 charshape.hwpx 기반 생성 표의 emoji 입력으로 anchor2→4, 저장 재열기의 정확한 host 전체 텍스트/표 marker 위치, undo·crossing/XML NUL/no-op/늦은 출력 예산 실패 뒤 staged 저장 바이트 불변과 redo 정확 저장, 원본 불변을 확인했습니다. 기존 staging/history 회귀도 포함합니다. 후보 prefix는 `/tmp/hwpjs-created-table-host-splice-20261011`이며 기존 작업 트리 변경을 포함합니다.

전체 host 거래 할당 실패·독립 XML/복수 구역/다양한 실제 객체·public JS/Worker/브라우저 body 입력과 수식/구조 위치 재배치는 아직 검증/구현이 남아 있습니다. 기본 데모 WASM은 교체하지 않았습니다.

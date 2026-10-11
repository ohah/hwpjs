# 생성 표와 일반 본문 splice 거래

## 공개 저장 독립 대조

2026-10-11 별도 후보 `62ecc0cef2630f08a7a8cb16461367648b3cc5b24502ce95bd26176c0af54e5b`의 공개 API 검사1/1·exit0(390.416458ms)은 실제 생성 표가 있는 본문의 앞😀<& 입력, anchor2→7/identity 유지, undo·crossing 거부 후 redo와 정확한 저장 바이트를 확인했습니다. Python 일반/-O로 전체 section XML·비대상 ZIP payload/메타데이터/CRC를 대조했습니다.

기존 plain-splice oracle의 명시적 zero_width_table_id 옵션만 현재 생성 표의 virtual 위치를 허용합니다. 기본은 계속 plain-only이고, 지정하지 않은 표·잘못된 ID·표를 가로지르는 범위는 거부합니다. 표 subtree는 변경 예상에 포함하지 않아 전체 XML 비교로 보존을 확인합니다. 네 명시적 반례는 정확한 ValueError와 정상 프로세스 종료code1을 확인하며 실행 실패를 거부 성공으로 세지 않습니다. 기존13개 plain oracle 반례도 통과했습니다.

open/prepare/staging부터 host 거래까지 모든 할당 실패를 순회하는 추가 native 테스트는 아직 실행 중입니다. host 실패 후 비실패 할당자의 readonly view로 저장을 검사해 본문/anchor 복원도 검증하도록 추가했습니다. 이 view의 공유 owner는 해제하지 않습니다. 완료 결과로 계수하거나 Worker gate를 해제하지 않았습니다.

추가 검사의 첫 실행은 SIGKILL로 종료했으며 assertion 통과나 메모리 누수 부재의 근거로 계수하지 않습니다. 원인은 확인되지 않았습니다. 재실행은 공통 `testing/allocation_failures.zig` helper로 할당별 stack trace 비용만 제거하고 모든 실패 지점과 종료 시 leak 검사를 유지합니다. helper 자체의 전체 실패 지점 순회·무시된 OOM 검출 테스트는 ReleaseSafe 1/1·exit0을 확인했습니다. 이는 실제 문서 거래의 전체 순회 완료와 별도 결과입니다.

`created_table_host_splice.apply`는 현재 host 참조와 UTF-16 입력 길이를 확인하고 registry 후보의 해당 anchor만 공통 이동 계획으로 변환합니다. 기존 checkpoint를 캡처한 뒤 후보 registry를 설치하고 기존 private 본문 splice를 호출합니다. 저장 검증까지 통과해야 커밋하며 실패·no-op은 checkpoint rollback으로 표와 본문을 함께 복원합니다. 원본 XML/ZIP은 변경하지 않습니다.

Session의 원래 plain splice 구현은 private callback으로 유지합니다. 생성 표가 없으면 기존 경로를 그대로 호출합니다. 생성 표가 있으면 일반 본문 splice에 위 거래를 적용합니다. anchored 입력·수식이 있는 대상 구역·split/merge·필드 전용 편집은 아직 UnsupportedCreatedTableHostEdit 보호를 유지합니다. UI는 새 native 능력 조회와 검증이 끝나기 전 기존 host read-only gate를 유지합니다.

2026-10-11 ReleaseSafe 집중3/3(root 포함)·exit0, fmt/diff·ReleaseSafe build exit0입니다. 실제 charshape.hwpx 기반 생성 표의 emoji 입력으로 anchor2→4, 저장 재열기의 정확한 host 전체 텍스트/표 marker 위치, undo·crossing/XML NUL/no-op/늦은 출력 예산 실패 뒤 staged 저장 바이트 불변과 redo 정확 저장, 원본 불변을 확인했습니다. 기존 staging/history 회귀도 포함합니다. 후보 prefix는 `/tmp/hwpjs-created-table-host-splice-20261011`이며 기존 작업 트리 변경을 포함합니다.

전체 host 거래 할당 실패·독립 XML/복수 구역/다양한 실제 객체·public JS/Worker/브라우저 body 입력과 수식/구조 위치 재배치는 아직 검증/구현이 남아 있습니다. 기본 데모 WASM은 교체하지 않았습니다.

# 신규 표의 현재 소유 값

HWPX 저장 fragment의 파생·예산·검증 경계는 [신규 표 XML 작성](hwpx-created-table-xml.md)을 따릅니다. 아직 원본 host/ZIP/Session에 삽입하는 거래는 아닙니다.

HWPX 신규 셀 문단 ID의 읽기 전용 일괄 계획은 [문단 ID 일괄 계획](hwpx-paragraph-id-batch.md)을 따릅니다. 표 ID·현재 object identity·Session 거래 확정과는 별도입니다.

`src/model/created_table.zig`의 Table은 현재 identity, 직렬화 instance_id, 공통 치수 Plan, 서식 리소스 참조와 셀 문단 ID/UTF-8 텍스트를 소유합니다. 원본 node index·XML·레코드·렌더링 캐시는 없습니다. 셀 치수는 기존 공통 Plan에서 파생해 중복 저장하지 않습니다.

생성자는 호출자가 넘긴 표 identity/instance와 셀 문단 ID를 받아 로컬0/중복/개수·치수/예산을 검사합니다. 현재 identity와 직렬화 ID는 서로 다른 필드이며 표 ID와 문단 ID를 같은 namespace로 합치지 않습니다. 문서 전체 기존/생성 ID 충돌 검사·할당과 서식 참조 존재/포맷별 필드 폭 검증은 아직 호출자 통합 단계의 책임입니다. 입력0 거부는 신규 생성 정책이며 기존 파일의0/중복을 정규화하는 규칙이 아닙니다.

셀 텍스트는 변경 전 UTF-8·셀 좌표·개별 바이트 예산을 확인하고 새 버퍼를 할당한 뒤 교체합니다. 같은 값은 no-op이며 새 할당 실패에서 이전 값을 유지합니다. 입력이 자기 텍스트의 부분 slice여도 먼저 복사하므로 안전합니다. clone은 별도 소유 버퍼를 만들고 부분 실패를 해제합니다. 여기서는 UTF-8만 검사하며 XML 허용 문자·HWP 제어문자·문서 전체 텍스트 예산은 후속 포맷 거래 경계에서 검사해야 합니다.

2026-10-11 최종 직접 ReleaseSafe 검사5/5·exit0은 신규 모델3개와 공통 계획2개입니다. Unicode/clone 독립성/no-op·모든 할당 실패 해제·늦은 입력 거부·명시적 replacement OOM 및 두 clone OOM 지점의 원문 보존/할당량 회수·alias·0/중복/개수/예산을 확인했습니다. fmt/diff와 별도 prefix `/tmp/hwpjs-created-table-model-20261011`의 ReleaseSafe build도 exit0입니다. 전체 최신 native gate·Session/Checkpoint·포맷 저장·공개 API·Worker/UI·실제 픽스쳐 삽입은 아직 없습니다. 기본 WASM은 교체하지 않습니다.

Session에 연결할 때 이 셀 텍스트가 신규 셀의 유일한 편집값이어야 합니다. 기존 paragraph/text-site 모델에 또 다른 수정 가능한 복사본을 두지 않고 조회·저장용 표현만 파생해야 합니다. clone 존재만으로 undo/redo가 구현됐다고 해석하지 않습니다.

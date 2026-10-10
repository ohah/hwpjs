# HWP5 현재 수식 조회

후속 Worker/패널 연결과 아직 미검증인 실제 GUI 범위는 [수식 패널 연결](hwp5-formula-worker.md)이 소유합니다. 아래 연결 미완료는 당시 단계 기록입니다.

`editor.formulaSources(section)`은 선택적 `hwp5_edit_formula_sources` ABI로 소유 JSON snapshot을 읽습니다. 항목은 `{ source_node, paragraph, formula, last_result, derived }`입니다. paragraph는 현재0기반 문단이고 source_node는 현재 세션의 원본 CTRL_HEADER 번호입니다. formula는 `=`를 포함한 UTF8 문자열, last_result는 표시 문자열입니다.

derived=false는 원본 command의 캐시를 그대로 관측한 값이며 새 계산 결과라고 추정하지 않습니다. 모델에 결과가 있으면 derived=true이고 현재 표현식/숫자 결과에서 format/grouping으로 표시 문자열을 파생합니다. 조회는 재계산·편집·이력 변경을 하지 않습니다. 원본/모델을 가리키는 borrowed slice는 API로 내보내지 않으며 getter·JSON 출력 정리가 소유 버퍼를 모두 해제합니다.

`formula_snapshot.zig`가 값 선택과 UTF16/표시 문자열 조립, `hwp5-formula-sources.mjs`가 JSON 유형·ID 중복·Unicode 검사를 소유합니다. 조회 성공을 편집 권한으로 해석하지 않습니다. 원본 field binding이 현재 구조와 맞지 않거나 envelope/Unicode가 지원되지 않으면 오류를 반환하며 빈 목록으로 숨기지 않습니다. 없는 ABI는 Hwp5FormulaSourcesAbiUnavailable입니다.

2026-10-11 actual chart의13항목과 SUM/67.5/raw → AVG/16.875/derived, 이전 소유 snapshot 불변, 조회의 전체 할당 실패·저장 불변·잘못된 구역 거부 native root 포함2/2·exit0을 확인했습니다. ReleaseSafe 후보 `/tmp/hwpjs-formula-snapshot-20261011/bin/hwpjs.wasm` SHA256 `8bd5ab4eb684e9f7a71c820df1a17239035cfa6f927334b9ecacaf0361fca7ae` 빌드 exit0입니다. 공개 정의/조회·wire·기존 이력3파일8/8·skip0·exit0입니다. 정의 저장의 독립 구역/비대상 stream·재열기·변조·실제 이력도 유지됩니다. wire 반례는 ID0/음수/소수·문단 null/오버플로·잘못된 prefix/빈 식·surrogate·result 유형·derived 유형·중복을 거부합니다.

기본 데모 WASM 교체·Worker/Canvas의 수식 목록/선택·조회 권한 UI·전체 원본/복합 구조 이후 조회는 아직 후속입니다. 생성 문단이 있는 section의 기존 field binding 제한도 이 기능으로 자동 해제하지 않습니다.

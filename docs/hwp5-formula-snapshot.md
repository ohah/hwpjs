# HWP5 현재 수식 조회

## 구조 편집 뒤 필드 바인딩 수정 (2026-10-11)

후속 적대적 회귀에서는 실제 본문 문단1 병합(원본 문단 삭제) 후에도13개 필드 identity 유지·현재 문단 번호 이동·AVG 변경·저장 재열기·정확 undo/redo를 확인했습니다. 분할 뒤 잘못된 참조 거부, 병합 뒤 같은 정의의 no-op이 기존 redo를 보존합니다. 동일 b8e5409a 후보의 정의/구조2파일14/14·skip0·exit0입니다. 부정 대조로 이전 기본 WASM에서 신규 구조 검사2개를 실행하면 분할 조회는 `MissingParagraphSource`, 병합 후 정의 변경은 `SourceBindingMismatch`로 각각 실패합니다. 이는 새 검사가 수정 전 오류를 감지한다는 근거이며 이전 기본 제품의 통과로 계수하지 않습니다.

실제 `chart.hwp`의 본문 문단1을 UTF16 위치1에서 분할하면 기존 기본 WASM(8bd5ab4e)에서는 수식 조회와 정의 변경이 `MissingParagraphSource`로 실패했습니다. 생성 문단에 원본 노드를 요구하던 바인딩과, 정의 변경의 사전 저장 검증이 비구조 작성기를 호출하던 두 경로가 원인이었습니다.

`field_paragraph_source.zig`는 기존 plain/template 검증을 재사용해 생성 문단의 목록 소유권만 연결합니다. 생성 문단에 원본 필드 header를 배정하지 않으며, 현재 필드 시작이 있으면 거부합니다. 원본 필드 identity는 계속 실제 원본 문단에만 속합니다. 정의 거래의 저장 검증은 기존 구조 작성기의 삭제 허용 경로를 재사용합니다. `plain_text_source.validateWith`의 purpose는 모든 호출에서 상수이므로 comptime으로 분리해 문자 서식 검증과 필드 바인딩 사이의 오류 집합 추론 순환을 제거했습니다. 런타임 재귀 복구를 추가한 것이 아닙니다.

ReleaseSafe 후보 `/tmp/hwpjs-generated-field-binding-20261011/bin/hwpjs.wasm` SHA256 `b8e5409af336c039c78b19e94b93eba880a2bd19996813feb321105e3b550899` 빌드·포맷·diff 검사가 통과했습니다. native root 포함2/2는 전체 할당 실패와 누락 template·잘못된 부모·필드 header/template·위조 필드 token을 거부합니다. 공개7파일25/25·skip0·exit0은 실제 분할 이후13개 identity 유지/문단 이동, AVG16.875·저장 재열기·정확 undo/redo와 기존 구조/이력/누름틀/책갈피/배포문서 회귀를 검사합니다. 전체 최신 native/corpus, 생성된 숫자 셀 의미, 실제 브라우저 E2E 및 기본 데모 승격의 완료 근거는 아닙니다. 기본 데모는 이 후보로 교체하지 않았습니다.

후속 Worker/패널 연결과 아직 미검증인 실제 GUI 범위는 [수식 패널 연결](hwp5-formula-worker.md)이 소유합니다. 아래 연결 미완료는 당시 단계 기록입니다.

`editor.formulaSources(section)`은 선택적 `hwp5_edit_formula_sources` ABI로 소유 JSON snapshot을 읽습니다. 항목은 `{ source_node, paragraph, formula, last_result, derived }`입니다. paragraph는 현재0기반 문단이고 source_node는 현재 세션의 원본 CTRL_HEADER 번호입니다. formula는 `=`를 포함한 UTF8 문자열, last_result는 표시 문자열입니다.

derived=false는 원본 command의 캐시를 그대로 관측한 값이며 새 계산 결과라고 추정하지 않습니다. 모델에 결과가 있으면 derived=true이고 현재 표현식/숫자 결과에서 format/grouping으로 표시 문자열을 파생합니다. 조회는 재계산·편집·이력 변경을 하지 않습니다. 원본/모델을 가리키는 borrowed slice는 API로 내보내지 않으며 getter·JSON 출력 정리가 소유 버퍼를 모두 해제합니다.

`formula_snapshot.zig`가 값 선택과 UTF16/표시 문자열 조립, `hwp5-formula-sources.mjs`가 JSON 유형·ID 중복·Unicode 검사를 소유합니다. 조회 성공을 편집 권한으로 해석하지 않습니다. 원본 field binding이 현재 구조와 맞지 않거나 envelope/Unicode가 지원되지 않으면 오류를 반환하며 빈 목록으로 숨기지 않습니다. 없는 ABI는 Hwp5FormulaSourcesAbiUnavailable입니다.

2026-10-11 actual chart의13항목과 SUM/67.5/raw → AVG/16.875/derived, 이전 소유 snapshot 불변, 조회의 전체 할당 실패·저장 불변·잘못된 구역 거부 native root 포함2/2·exit0을 확인했습니다. ReleaseSafe 후보 `/tmp/hwpjs-formula-snapshot-20261011/bin/hwpjs.wasm` SHA256 `8bd5ab4eb684e9f7a71c820df1a17239035cfa6f927334b9ecacaf0361fca7ae` 빌드 exit0입니다. 공개 정의/조회·wire·기존 이력3파일8/8·skip0·exit0입니다. 정의 저장의 독립 구역/비대상 stream·재열기·변조·실제 이력도 유지됩니다. wire 반례는 ID0/음수/소수·문단 null/오버플로·잘못된 prefix/빈 식·surrogate·result 유형·derived 유형·중복을 거부합니다.

기본 데모 WASM 교체·Worker/Canvas의 수식 목록/선택·조회 권한 UI·전체 원본/복합 구조 이후 조회는 아직 후속입니다. 생성 문단이 있는 section의 기존 field binding 제한도 이 기능으로 자동 해제하지 않습니다.

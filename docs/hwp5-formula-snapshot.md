# HWP5 현재 수식 조회

## MIN/MAX 숫자 셀 계산 확장

HWP5 Range와 기존 숫자 셀 평가기에 MIN/MAX를 추가했습니다. 범위·반복 주소·단일 주소·ABOVE 선택과 셀/검사 예산·현재 모델 입력 검증은 기존 경로를 공유합니다. 최솟값/최댓값의 초기값은 각각 양/음의 무한대이며 각 실제 입력은 finite여야 합니다. 비어 있는 ABOVE·자기/결과 셀·비숫자 입력·역방향/범위 초과·미지원 문법을 임의로0이나 캐시로 대체하지 않습니다. RHWP의 MIN/MAX 처리 존재를 참조했지만 외부 코드를 복사하지 않았습니다. HWPX에는 이번 변경을 적용하지 않았습니다.

ReleaseSafe 후보 `/tmp/hwpjs-minmax-20261011/bin/hwpjs.wasm` SHA256 `a925954a703c213801afa4b5c64dad6d3f2c8e982c62a13eab0ac83637b5e4e4` 빌드 exit0·포맷/diff 검사가 통과했습니다. 실제 chart MIN 범위/MAX 반복 참조의 독립 산술·저장 command/비대상 stream·정확 이력·재열기와 기존 공개/Worker/숫자/구조4파일28/28·skip0·exit0입니다. 후속 전체 음수 MAX=-11.2·MIN=-24.7·입력-100 변경 후MIN=-100·이력/재열기를 포함한 정의 파일6/6도 통과했습니다. native 범위4/4와 ABOVE 관측/구조 범위 전체 할당 실패4/4·exit0입니다. 첫 구조 회귀는 반례 함수 이름 변경으로 원문과 길이가 달라진 테스트 오류였으며 같은3글자 FOO로 바로잡았습니다.

기본 데모는 아직 이 후보로 교체하지 않았습니다. MIN/MAX가 원래 들어 있는 원본 corpus나 모든 숫자/Unicode/함수·일반 의존 그래프·최신 전체 native/브라우저 조판 완료의 증거는 아닙니다. 아래 과거 MIN 미지원 기록은 이 확장 이전 상태입니다.

## 게시된 main의 독립 재현

동일 caf15480 추출본에서 실제 `zig build hwp5-editor-audit -Doptimize=ReleaseSafe`도 exit0으로 종료됐습니다. `/tmp/hwpjs-main-editor-gate-20261011.log`의 정규 선택 결과는290/290·fail0/skip0/cancel0·3300ms입니다. 추출본 기본 zig-out WASM을 사용하며 공개 API/Canvas 이벤트 대역/실제 Worker·저장·구조/이력/숫자·번호 계약의 게시 감사 경로를 확인합니다. 이후 공통 수식 폼의 재진입/close 변경과 미등록 전체 테스트·native 전체·실제 브라우저 전체 지원까지 소급하지 않습니다.

`caf15480813186a74ab0913e76e1dc0dd75840df`를 Git archive로 `/tmp/hwpjs-main-regression.nTseVX`에 추출해 미게시 로컬 파일 없이 ReleaseSafe 빌드(exit0)했습니다. 새 WASM `/tmp/hwpjs-main-regression.nTseVX/verified-out/bin/hwpjs.wasm` SHA256은 `727c38df5ef8d722e87abede19bc181a6b843641f64ac6a2cb59877bef9cd89c`입니다. 추출본 JS/테스트와 이 산출물로 정의/Worker/숫자 corpus/번호4파일14/14·skip0·exit0을 확인했습니다. 앞선 같은 추출본+데모 b8e5409a의14/14와 구분합니다. 이것은 게시 코어와 최근 회귀의 재현 근거이지 모든 정규 감사/전체 fixture 명령·레이아웃 완료 근거는 아닙니다. 외부 데모 artifact는 바꾸지 않았습니다.

## 구조 편집 뒤 필드 바인딩 수정 (2026-10-11)

공개 실패 경계도 기본 b8e5409a에서 확인했습니다. 자기 참조 `SUM(??)`는 UnsupportedFormulaCellDependency, 꼬리 쉼표는 InvalidFormulaReference,33주소는 LimitExceeded, 역방향 범위는 UnsupportedReversedFormulaRange, 미지원 MIN은 UnsupportedFormulaExpression입니다.4096바이트 UTF8 입력 초과와 UTF8 한도 안이지만 UTF16 expression4096바이트 초과인2100문자도 LimitExceeded입니다. 각 거부 후 원문 저장이 동일하고 기존 redo가 살아 있습니다. 반대로32반복 주소는 독립 산술/저장/재열기/이력을 통과합니다. 정의/Worker2파일6/6·skip0·exit0이며 자기 참조의 거부이지 일반 계산식 의존 그래프/순환 평가 지원은 아닙니다.

기본 b8e5409a의 공개 정의 API도 실제 chart의 PRODUCT 범위·PRODUCT 반복 주소·SUM/AVG 반복 주소·단일 SUM 주소5경로에서 검증했습니다. 원본 숫자 셀11.2/24.7/16.3/15.3을 독립 레코드에서 읽어 산술/일반 숫자 문자열을 만들고, 공개 snapshot·저장 CTRL_HEADER command·비대상 stream·정확 undo/redo·재열기와 대조했습니다. 정의/Worker2파일6/6·skip0·exit0입니다. 첫 검사는 저장 후에도 레코드118이라고 가정해 다른 payload를 읽었고 실패했습니다. 저장본의 첫 %fmu 제어를 독립 framing으로 찾도록 고쳤으며 세션 handle의 저장 후 재인덱싱 계약을 유지합니다. 제품 계산식 파서/평가기는 이미 PRODUCT와 반복 주소를 지원하므로 신규 함수 구현으로 계수하지 않습니다.

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

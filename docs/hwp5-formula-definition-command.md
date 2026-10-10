# HWP5 수식 정의 명령 작성 기반

현재 조회 API의 값·소유권과 원본 캐시 구분은 [수식 snapshot](hwp5-formula-snapshot.md)이 소유합니다. 아래 조회 미연결 기록은 당시 단계입니다.

## 선택적 공개 세션/WASM/JS 명령

게시 파일8개만 선택한 tree `396940fdfc8f18c023d65b363af540faedaefce8`의 별도 export `/tmp/hwpjs-formula-api-publication.pgiG6V`에서도 ReleaseSafe 빌드 exit0, 정의 API/기존 이력2파일7/7·skip0·exit0을 확인했습니다. 이 export WASM SHA256은 `3bb5dd8275a329a3eee0dd9ad443344e938384015036972f3dcb620fc99d47d1`이며 아래 main 작업 트리 빌드의 a60c9f와 구분합니다. 미게시 helper나 전체 작업 트리 스냅샷을 원격 기능 증거로 대신하지 않습니다.

`editor.setFormulaDefinition({ section, sourceNode, formula })`를 추가했습니다. 원본 chart.hwp의 예는 `{ section: 0, sourceNode: 118, formula: "=AVG(B?:E?)" }`입니다. sourceNode는 **현재 세션의 불변 CTRL_HEADER 레코드 번호**이며 저장본 재열기 후에도 같은 숫자라고 가정하면 안 됩니다. 별도 조회 API와 Canvas 수식 선택 연결은 후속입니다.

명령은 선행 `=`가 있는 UTF8 문자열을 받고, UTF8 입력/UTF16 계산식 바이트의 상한은4096입니다. 현재 Range 문법의 지원 함수/주소·참조 범위·현재 숫자 입력을 검증합니다. 인식하지 못한 식이나 비숫자 의존 값을 실행하지 않습니다. field binding과 원본 정책 검증·private 모델 clone·전체 재계산·저장 구역 준비가 모두 성공한 뒤 모델을 교체합니다. no-op은 이력이나 redo를 변경하지 않습니다. 묶음 명령의 늦은 실패와 변경 후 checkpoint 예산 초과는 원래 모델로 rollback합니다.

WASM의 `hwp5_edit_set_formula_definition(section, source_node, ptr, size)`는 선택적 export입니다. 입력은 정상 할당된 WASM 메모리 범위를 빌리며 model은 필요한 표현식을 소유 복사합니다. 결과 출력은 먼저 비웁니다. 이전 ABI에서 JS 명령은 `Hwp5FormulaDefinitionAbiUnavailable`을 반환하고 다른 편집/저장/redo를 유지합니다. 계산 결과 텍스트의 직접 수정 보호는 그대로입니다.

2026-10-11 세션/이력 정상·no-op·잘못된 구역/대상/식/참조·예산·늦은 batch 실패 검사가 root 포함2/2·exit0입니다. 별도 **전체 할당 실패**의 open/apply/save/reopen 검사와 기존 redo가 있는 History 명령 검사도 각각 root 포함2/2·exit0입니다. 실패 지점을 샘플링하지 않았습니다. 로그는 `/tmp/hwpjs-formula-definition-allocation-20261011.log`, `/tmp/hwpjs-formula-definition-history-allocation-20261011.log`입니다.

ReleaseSafe API 후보 `/tmp/hwpjs-formula-definition-api-20261011/bin/hwpjs.wasm` SHA256 `a60c9f7203ef6f542a7b25d39ddef2baacdaf02fb2da8f9a94bfbf62283928c0`에서 공개 회귀3파일7/7·skip0·exit0을 확인했습니다. 이후 강화한 정의 API2/2는 독립 CFB/완전 구역·metadata/비대상 stream, 잘못된 식의 일치 실패, 정확 오류/원문·redo 보존, no-op·저장 재열기 뒤 새 handle의 재편집, 정의 변경 후 숫자 입력의 AVG 유지/17.125 및 이력, export 제거 파생 ABI의 거부를 검사합니다. 기본 WASM은 교체하지 않았습니다. 아직 모든 원본/함수·생성 문단/복합 구조 이후·조회/Worker/Canvas·실제 브라우저의 완료 근거는 아닙니다. 아래 단계별 미연결 기록은 당시 상태입니다.

## 모델 소유권과 원본 구역 왕복 기반

후속으로 `FormulaResult.expression`에 새 UTF16LE 표현식만 소유합니다. null은 원본 계산식을 사용한다는 뜻이며 command/display cache는 모델에 넣지 않습니다. `model/formula_result_values.zig`가 깊은 복사·해제·source identity 조회·교체를 소유합니다. upsert는 새 할당이 모두 성공한 뒤에만 기존 값을 소비하며, 기존 모델 표현식을 입력으로 빌려도 먼저 복사해 alias 수명 오류를 피합니다.

문단 clone과 해제, checkpoint byte 예산에 표현식 길이를 연결했습니다. generic 문서 값 비교는 표현식 내용도 비교합니다. 재계산의 범위와 의존성은 수정된 표현식이 있으면 그 값을 사용하고, 저장은 공통 명령 작성기로 값/표현식을 파생합니다. 정의/숫자 결과는 같은 source_node 모델 항목에 남습니다. 세션 명령의 권한·소유권/현재 범위 검증은 여전히 후속입니다.

2026-10-11 native 필터 실행은8/8·skip0·exit0입니다. 표현식 clone/upsert와 checkpoint의 전체 할당 실패, byte 예산 경계·값 비교·정확 undo/redo, 기존 준비 검사와 실제 chart 구역 왕복을 포함합니다. 실제 chart.hwp의 CTRL_HEADER118 `SUM(B?:E?)`를 private 모델에서 `AVG(B?:E?)`로 바꾸고13수식을 재계산했습니다. 새 값16.875와 `=AVG(B?:E?)??%g,;;16.875`, other/instance ID/불투명 꼬리·modified 속성을 저장 구역의 새 트리에서 확인했으며 원본 구역은 불변입니다. 입력 표현식 버퍼를 바꿔도 모델 clone의 정의는 유지됩니다. 구역 왕복이지 공개 API나 전체 CFB 저장/독립 전수 oracle 검사가 아닙니다.

ReleaseSafe 후보 `/tmp/hwpjs-formula-definition-model-20261011/bin/hwpjs.wasm` SHA256 `3658533ba2c4976cf47921efba3a94f25d3230b6451cea626f8601ea7245fe93`의 빌드·포맷이 통과했습니다. 기존 공개 editor/history·표 원값/셀 편집·Canvas 숫자→Worker 수식/독립 저장 이력4파일12/12·skip0·exit0도 통과했습니다. 기본 데모는 교체하지 않았습니다. 실제 HWP5 setFormulaDefinition 세션/API/Worker/Canvas 명령과 그 거래 실패/재열기/독립 oracle는 아직 미완료입니다. 아래 최초 단계의 모델 미연결 기록은 당시 상태입니다.

`src/hwp5/edit/formula_definition_command.zig`는 원본 field Properties, 새 UTF16LE 계산식, 현재 모델에서 새로 평가한 숫자 결과를 받아 소유 명령 payload를 만듭니다. 계산식은 선행 `=` 없는 기존 Range 문법이며4096바이트로 제한합니다. format·instance ID·other·미해석 attributes/extra는 원본을 보존합니다. 계산식이 달라지면 modified 비트를 설정하고, 표시 cache는 공통 `formula_command_writer`로 새 결과에서 파생합니다. 같은 식/같은 표시 결과의 no-op은 byte-exact입니다.

이 계층은 세션을 수정하거나 평가를 수행하지 않습니다. caller가 제어 ID/소유권·편집 권한·현재 모델의 의존성/범위와 예산을 검증해야 합니다. 임의 숫자를 계산 결과로 승인하는 공개 API가 아닙니다. 모델에 명령 바이트/표시 문자열 cache를 추가하지 않습니다. 표현식과 평가 결과를 단일 편집 상태로 조립하고 기존 저장 writer에서 파생해야 합니다.

2026-10-11 ReleaseSafe root 필터 `formula definition command`는4/4·skip0·exit0입니다. root 등록·기존 HWPX 정의 거래1개와 신규 HWP5 준비2검사를 포함합니다. 신규 검사는 전체 할당 실패 주입·새 결과/포맷·ID/불투명 꼬리/unknown attributes 보존·원문 불변·정확 no-op·잘못된 envelope 삽입/홀수 UTF16/비유한 결과/크기 제한을 검사합니다. 첫 실패2개는 테스트 factory가 지역 wire 버퍼 포인터를 반환한 수명 오류였으며 정적 보관으로 수정했습니다. 실제 원본 문서 편집 실패로 계수하지 않습니다.

포맷 검사와 별도 prefix `/tmp/hwpjs-formula-definition-prep-20261010`의 ReleaseSafe 빌드도 exit0입니다. 기본 데모 WASM은 바꾸지 않았습니다. 실제 HWP5 수식 정의 세션 거래·모델 clone/해제·의존 재계산·저장 재열기/독립 oracle·WASM/JS/Worker/Canvas 연결·원본 전수는 후속입니다. 이 기반 추가를 HWP5 계산식 변경 API 완료로 해석하지 않습니다.

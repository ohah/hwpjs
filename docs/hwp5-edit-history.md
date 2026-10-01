# HWP5 편집 이력 기반

현재 native 체크포인트·bounded undo/redo 스택과 공개 WASM/JS API 및 Worker 연결을 구현했습니다. 기존 Canvas의 historyAvailable 기반 단축키·버튼 경로를 사용하며 software 제목의 실제 브라우저 검증을 마쳤습니다. 전체 fixture 브라우저 검증은 아닙니다. HWP 파일의 DocHistory/VersionLog 저장 기능도 아니며 해당 원본 스트림을 생성하거나 수정하지 않습니다.

## Worker 연결 검증

2026-10-02 외부 preview 주소의 실제 Chromium에서 software 공모 참가신청서 제목 셀을 클릭하고 `이력😀`를 입력했습니다. Meta+Z로 원본 제목을 복원하고 다운로드한 HWP가 원본과 바이트 단위로 같음을 확인했습니다. redo 버튼으로 편집 제목을 재적용하고 배치 유지 저장을 명시적으로 허용한 다운로드는 독립 CFB.js/Node 전체 Section 및 비본문 스트림 oracle을 통과했으며 native 재열기/재저장도 일치했습니다. `/private/tmp/hwpjs-hwp5-history-e2e.png`를 캡처하고 확인했습니다. 자동 Chromium 입력이며 실제 OS IME·한컴 조판 검증은 아닙니다. 첫 대기 조건의 ‘반영’ 문자열은 실제 ‘변경 적용’ 안내와 달라 타임아웃됐지만 입력값·후속 상태·다운로드 검증으로 제품 성공을 별도로 확인했습니다.

Worker는 enable 시 native 이력을 한 번만 켭니다. undo/redo 뒤 현재 native 저장본을 다시 읽어 모든 문단·제어 위치·계산 결과의 표시 projection을 재생성합니다. 최초 load 바이트나 JS 역명령을 복원값으로 사용하지 않습니다. native 변경 후 projection 실패는 applied=true로 알려 기존 Canvas fail-closed 경로를 유지합니다.

`tests/hwp5/reader-worker.test.mjs`의 실제 제품 WASM 검사는 charshape 텍스트/서식·software 공모 제목 중첩 셀·chart 숫자/의존 계산 결과·교차 필드·빈 표 셀의 6개 명령을 검사합니다. 전체 표시 metadata의 undo/redo 일치, undo 후 기본 strict save의 원본 CFB 바이트 및 reflow=false, redo 후 편집본 바이트 일치, 거부 뒤 redo 유지, 반복 enable과 파일 변경 후 이력 초기화를 확인했습니다. 독립 decoder·실제 브라우저·OS IME 검증의 대체는 아닙니다.

## 소유권과 SSOT

`editor_checkpoint.zig`는 기존 `model/clone.zig`의 section 복사를 사용하여 현재 모델의 모든 section·문단·토큰 원시 바이트·글자 모양·선택적 range_tags·field_attributes·formula_results를 소유합니다. 원본 CFB·해제 Section·스타일 원문 위치는 Session에 그대로 유지하고 복사하지 않습니다. 표시 문자열이나 직렬화 HWP를 복원 모델로 만들지 않습니다.

Session의 `createCheckpoint(max_checkpoint_bytes)`는 opaque Checkpoint를 반환합니다. 호출자는 모델 slice를 직접 변경할 수 없고 `restoreCheckpoint(checkpoint)`로 교환합니다. 교체된 값을 체크포인트가 보관하므로 다시 교환하면 편집 상태가 재적용됩니다. `checkpointSize(limit)`는 크기를 조회합니다. 체크포인트는 원래 세션 수명 안에서만 사용할 수 있고 세션보다 먼저 deinit해야 합니다. 닫힌 세션 핸들·다른 세션에 재사용하는 계약은 없습니다.

크기는 State·section/paragraph 배열·token 배열/원시 바이트·character_runs·세 선택 배열의 실제 길이를 합산합니다. 정수 곱셈·덧셈·한도를 검사합니다. source 포인터·ZIP 사본·문서 전체 실행 메모리까지 포함한 총량 한도는 아닙니다.

capture는 복사/State 할당이 모두 성공한 뒤 반환하고 실패 시 초안만 해제합니다. exchange는 세션 identity·할당자·format/coverage·section/paragraph 개수·원본 record 개수를 확인하고 현재 모델의 크기 한도를 검사한 뒤 추가 할당 없이 Document 값을 교환합니다. 직접 편집으로 크기가 한도를 넘으면 restore가 거부됩니다. History 명령의 성장 한도 rollback은 보존된 목적 상태의 한도를 검사한 뒤 추가 할당 없이 복구하며, 실패한 성장 초안은 폐기합니다.

## native 이력 스택

`editor_history.zig`는 포맷 명령·checkpoint 어댑터만 소유합니다. `History.init(allocator, session, max_entries, max_checkpoint_bytes)`는 양수 한도와 곱셈 오버플로를 검사하고 세션 identity에 바인딩합니다. 항목 목록의 allocator는 주입받으며 checkpoint는 Session의 allocator로 소유합니다. History를 세션보다 먼저 deinit하고 직접 Session.apply와 이력 명령을 혼용하지 않습니다.

분기·항목 수·버퍼 준비·이동은 HWP5와 HWPX가 같은 `model/history_stack.zig`를 사용합니다. apply는 원래 상태를 capture하고 스택 용량을 준비한 뒤 명령을 실행합니다. 현재 상태와 checkpoint가 같으면 false이며 redo를 유지합니다. 성공한 변경만 redo를 해제하고 오래된 undo를 제거합니다. 변경 후 크기 한도 실패는 원본 모델을 rollback하고 스택 개수·redo를 유지합니다.

undo/redo는 대상 목록의 용량을 준비하고 포맷 checkpoint의 검증·교환이 성공한 뒤에만 항목을 이동합니다. 교환 어댑터는 오류를 상태 교환 전에 반환해야 합니다. 실패 시 목록 용량은 늘어날 수 있지만 의미 상태·항목 개수는 유지됩니다. 공통 스택은 별도 편집값·저장 바이트·모델 해시를 소유하지 않습니다.

## 공개 API 연결

`createExperimentalHwp5Editor`는 원본을 연 뒤 `enableHistory({ maxEntries = 16, maxCheckpointBytes = 8 * 1024 * 1024 } = {})`로 이력을 명시적으로 켭니다. 양수 u32 한도를 native에서 검사하고 곱을 128 MiB 이하로 제한합니다. 이력을 켜기 전의 기존 텍스트/글자 모양 명령 동작은 유지하며 활성화 후 두 명령을 모두 History.apply로 전달합니다. 저장은 이력을 만들거나 지우지 않습니다.

`undo()/redo()`는 변경 여부 Boolean을 반환합니다. HistoryNotEnabled·HistoryAlreadyEnabled와 원자적 LimitExceeded를 별도로 반환하며 close 뒤에는 EditorClosed입니다. raw WASM history_enable은 성공 1/오류 0, undo/redo는 무변경 0/변경 1/오류 2를 반환합니다. 실패한 raw open은 현재 이력을 유지하고 성공한 open과 close는 이력을 초기화합니다. close는 History를 Session보다 먼저 해제합니다.

두 포맷의 JS optional 이력 호출은 `js/editor-history.mjs`를 공유합니다. 기존 필수 ABI 목록이나 version은 변경하지 않았으며 오래된 모듈에서 이력을 호출하면 형식별 HistoryAbiUnavailable 오류를 반환합니다. 숫자·문자열 validation의 기존 형식별 오류 계약도 유지합니다. 이력 응답은 정확히 0/1만 Boolean으로 해석하고 나머지 값은 오류로 처리합니다.

공개 HWP5 이력 4개·공통 ABI 반례 1개·HWPX 기존 이력 3개는 합계 8/8로 통과했습니다. 실제 계산식·교차 필드·빈/중첩 셀·글자 모양의 원본 CFB 복원과 편집본 재적용, 기본 save의 reflow 거부/복구, 한도·항목 개수·no-op/거부 뒤 redo 보존, 실패/성공 재열기·close 경계를 포함합니다. 실제 웹 이력·독립 CFB 이력 oracle의 완료 증거는 아닙니다.

## native 검증

Worker·독립 이력 oracle·corpus 검사 도구 반례를 포함한 최신 ReleaseSafe 제품 audit은 HWP5 85/85·HWPX 29/29 및 9/9 빌드 단계로 통과했습니다. 문서 도구 반례는 2/2, 인라인 로컬 링크 3,061개는 누락 0입니다. 이후 전체 ReleaseSafe native도 2,805/2,805 테스트·7/7 단계·종료 코드 0으로 통과했습니다. root 2,796개와 별도 9개를 포함하며 실행 약 10분·최대 RSS 37 GiB입니다. stderr의 `failed command:` 라벨과 실제 성공 요약/종료 코드를 구분합니다.

`node tools/hwp5-edit-corpus-audit.mjs --history`는 추적 HWP 48개 중 미리보기 가능한 45개 문서의 1,481문단에 prefix 삽입을 시도했습니다. 1,433개 편집의 undo/redo 전체 저장값·reflow 복원이 모두 통과했고 최종 저장의 전체 문단 텍스트·비본문 스트림은 독립 CFB.js/Node와 일치했습니다. 48개 숫자 셀은 임의 한글 prefix의 InvalidFormulaNumber로 거부됐으며 거부 전후 전체 저장값이 같았습니다. 보호 HWP 3개는 기존 읽기 거부입니다. HWPX 44개 읽기 성공·1개 암호화 거부는 이 도구의 편집 검증 대상이 아니며 별도 HWPX corpus가 소유합니다. prefix 한 위치 조사이고 모든 위치·명령·필드·조판 완료 증명이 아닙니다.

추가 독립 검사는 CFB.js로 모든 스트림을 읽고 Node 레코드 oracle로 charshape 일반 문단·software 중첩 셀·table 빈 셀의 두 연속 삽입과 새 분기의 전체 Section 기대값을 생성합니다. undo 두 번·redo 두 번·분기 뒤 undo의 모든 스트림을 해당 기대 상태와 비교했습니다. 공개 이력 및 Worker 집중 검사는 9/9로 통과했습니다. 계산식·교차 필드·서식 이력의 독립 기대값까지 증명한 범위는 아닙니다.

공통 스택 통합 후 HWP5/HWPX native 이력 집중 검사는 Debug·ReleaseSafe·ReleaseFast 각각 6/6(root 포함)으로 통과했습니다. 실제 HWP5 일반 문단의 분기·무변경/거부 뒤 redo 보존·최대 항목 수, 빈 스택 및 이전 redo가 있는 상태의 성장 한도 rollback을 검사했습니다. apply·undo·redo의 전체 할당 실패에서는 저장값과 각 스택 개수가 유지됐습니다. 별도 fixture 테스트는 실제 계산식·교차 하이퍼링크·글자 모양·스타일·빈 표 셀·중첩 셀의 원본 HWP 바이트 복원과 편집본 재적용을 확인합니다.

공개 이력 추가 시점의 ReleaseSafe 제품 audit은 HWP5 82/82·HWPX 29/29 테스트와 9/9 빌드 단계로 통과했습니다. 두 포맷이 공통 스택과 JS optional 호출을 실제 제품 WASM에서 사용합니다. 이후 Worker·독립 oracle·전수 prefix 이력·software 브라우저 및 전체 native 검증은 위 기록을 따릅니다. 앞선 audit 개수를 후속 테스트 추가 후의 개수로 읽지 않습니다.

이력 스택 연결을 위한 무변경 판정은 `model/equality.zig`의 공통 값 비교를 사용합니다. 모델 struct 필드를 재귀적으로 비교하므로 scalar 메타데이터·토큰 원시 바이트·글자 모양·range tag·필드 속성·계산 결과를 함께 확인합니다. slice 주소가 아닌 내용, null과 빈 배열의 구분, float의 정확한 비트(+0/-0·NaN payload 포함)를 보존합니다. 알려지지 않은 타입은 컴파일 오류이며 XML/CFB 유효성 검사나 raw 파일 비교를 대체하지 않습니다.

`Session.matchesCheckpoint`는 기존 source identity·할당자·원본 구조 바인딩을 검사한 뒤 현재 모델과 checkpoint의 값 동일 여부를 반환합니다. 변경 값을 외부에 노출하거나 저장본·화면 문자열을 비교하지 않습니다. 기존 값의 set_style은 무변경으로 판별하고, 텍스트가 같아도 dirty·서식이 다르면 변경으로 판별합니다. 모델 비교와 체크포인트 집중 검사는 Debug·ReleaseSafe·ReleaseFast 각각 6/6(root 포함)으로 통과했습니다. 비교 반례는 별도 equality_tests에 둡니다.

Debug·ReleaseSafe·ReleaseFast에서 `HWP5 checkpoint` 집중 검사 각각 5/5(root 포함)가 통과했습니다. 실제 charshape 일반 텍스트와 글자 모양, table 빈 셀, software 중첩 셀, 교차 하이퍼링크 fixture, chart 계산식에서 원본 HWP/CFB 전체 바이트 복원 및 편집본 바이트 재적용을 확인했습니다. 복원 뒤 기본 save는 재조판 opt-in 없이 성공하고 원래 reflow=false 상태도 복구됩니다.

다른 세션 거부, capture/크기 한도 0 거부, 성장 한도에 걸린 restore 뒤 편집본 보존, open/capture 전체 할당 실패 정리도 확인했습니다. 할당자가 allocation·resize를 거부한 상태에서도 exchange는 성공하고 할당 횟수가 증가하지 않습니다.

기존 제품의 자기 저장본·원본 바이트 비교이며 독립 CFB decoder·실제 한컴/브라우저 실행 취소·전체 fixture 이력 검증은 아닙니다. 전체 native 검증 2,797건은 이전 HWPX 이력 커밋의 결과이며 이 새 기반을 포함한 전체 실행으로 읽지 않습니다.

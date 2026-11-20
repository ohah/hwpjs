# 전체문서 검색의 읽기 선택 관측

전체문서 검색 snapshot의 `row.paragraph`는 검색 순서다. 이를 화면 선택 좌표로 쓰지 않는다. Native의 `document_text_selection` 조회가 현재 snapshot binding·발급 참조·예상 문자열·UTF-16 스칼라 경계를 다시 검사하고, 현재 표시 문단 주소 또는 typed 생성 셀 식별자를 돌려준다.

이 응답은 읽기 전용 관측이다. `executionAuthority:false`이며 새 편집 권한이나 화면 geometry를 발급하지 않는다. Core의 `getDocumentTextSelection(index, match)`는 기존 FIFO/read admission을 거쳐 현재 index·token·stateVersion·Native revision을 재검사하고 소유된 읽기 관측을 돌려준다. 실제 선택이나 History, 현재 표시 창을 변경하지 않는다. Surface는 적용 시점의 token과 실제 현재 renderer owner·geometry를 별도로 확인해야 한다. 현재 표시된 owner의 선택 변경은 Surface·데모 연결 소스로 존재한다. 실제 정상 SDK/GUI 검증과 화면 창 이동·입력 포커스 전체 의미의 완료를 뜻하지 않는다. 현재 화면에 없는 대상은 실제 Runtime 읽기 뷰 갱신과 painted owner 확인 뒤 새 index로 재관측한다. 이는 History 활성화나 기존 Native 참조 재태깅을 허용하지 않는다.

HWP5는 현재 Native 원문/생성 문단과 control 투영 축을 확인한다. HWPX는 현재 읽기 전용 display serializer를 재사용하며, typed 대기 셀은 별도 식별자로 구분한다. 비-pending 문단의 serializer 결과와 모델 간 개별 emission 증명은 아직 순서·개수 검사를 강화해야 할 잔여다. 문자열 일치만으로 독립적인 소유권 증명을 대신했다고 주장하지 않는다.

JS 전송 모듈은 accessor 없는 소유 요청, 유효 UTF-8/JSON, 응답 크기, binding과 참조의 일치, kind별 필드, lossless u64 셀 식별자, 예상 문자열과 스칼라 경계를 검사한다. Native 입력/출력을 각각 정리하며 구형 ABI에서 setter 반복으로 대체하지 않는다. 읽기 전용 revision null은 허용하지만 쓰기 요청으로 전환하지 않는다.

Canvas direct의 `selectTextRange`는 생성 셀의 `createdCell` 식별자를 보존한다. 문단 주소와 혼합한 대상은 거부하며, 현재 layout에 유일한 셀 owner가 있어야 한다. renderer의 첫 일치 또는 일반 문단 fallback만으로 승인하지 않는다. `expectedText`가 주어진 경우 현재 전체 원문과 같아야 하고, 기존 스칼라 경계·현재 입력·뷰 정책과 실제 시작/끝 caret geometry를 확인한다. 기존 선택 게시·방향·스크롤 경로를 재사용한다. 이 direct 경로 보완을 Native 조회에서 실제 Surface/UI까지 연결한 증거로 해석하지 않는다.

합성 Node 검사는 실제 Native/WASM·전체문서 UI·저장 검증과 별개다. 추가 Native 검사 소스는 `document_text_selection_probe.zig`에 분리하며 기존 HX25 probe와 fixture·기대값을 변경하지 않는다. 이 단계에서 Native 컴파일·실행은 하지 않았다.

`document-search-controller.ts`는 전체 Native 관측과 기존 Core literal matcher를 연결하는 UI 수명 경계다. 입력 barrier가 끝난 현재 상태를 관측하고, 검색 match의 Native 선택 조회 뒤 실제 Surface 선택을 요청한다. Surface가 확인한 현재 state receipt가 없으면 선택 성공으로 보고하지 않는다. 상태가 바뀌거나 창이 닫힌 늦은 응답을 적용하지 않으며, 새 문서·Native revision·중복 요청·정리 뒤의 재진입을 거부한다. 다음/이전 및 명시적 순환은 직전 확인된 검색 cursor를 사용한다.

현재 소스는 demo-controller·text-tools bridge에서 이 컨트롤러와 Surface 포트를 연결하고, React/Svelte는 mount relay로 전달한다. 이는 소스 배선과 통제 포트 검증이며 실제 정상 SDK/GUI 완료 증거가 아니다. 시작 기준이 될 Native cursor가 없으면 문서 경계부터 찾는다. 일반 화면 caret에서 Native 검색 참조로 역변환하는 경로를 문자열/문단 번호 추정으로 대신하지 않는다. 일반 caret의 Native 역조회와 실제 읽기 뷰 갱신·화면 밖 owner 재조회는 후속 소스로 연결했다. 이 연결을 일반 키보드 찾기 전체 의미의 실측 완료로 해석하지 않는다. 컨트롤러의 editor/Surface 포트를 통제한 합성 검사와 실제 UI 증거도 구분한다.

Surface의 `selectDocumentText(observation, current?)`는 현재 표시된 대상의 Native 관측을 기존 direct 선택 경로에 넘긴다. token·stateVersion·Native revision·실제 현재 모델과 원문·스칼라/geometry·view 정책을 확인하며, 기존 Core 선택 게시가 끝난 뒤 실제 direct 선택과 게시된 Core 상태를 다시 확인한다. 별도 선택 큐나 Native 쓰기를 만들지 않는다. 모달 종료·수명 상실·문서/뷰/Native revision 변경·게시 실패 또는 선택 소실은 확인 응답을 반환하지 않는다. 생성 셀은 현재 Surface의 typed 선택으로 유지하고 Core의 일반 문단 선택으로 바꾸지 않는다. 이 메서드의 demo 컨트롤러 배선은 현재 소스에 있으나 화면 밖 표시·readonly materialization과 실제 SDK/GUI 완료를 뜻하지 않는다.

현재 읽기 전용 선택 후속은 Core가 비공개로 발급한 관측과 현재 Native 읽기 증거를 Surface의 별도 permit으로 확인한다. permit은 문서·뷰·Native session/epoch/serial·controller 수명과 정확한 문단/생성 셀 범위에 결합한다. 현재 실제 행의 전체 원문·스칼라 경계·유일 owner·시작/끝 caret geometry가 모두 필요하다. 복사한 DTO나 accessor로 발급 이력을 만들지 못한다. 기존 일반 편집 선택의 view 정책과 Native 쓰기 권한은 그대로 유지한다.

Canvas의 별도 읽기 선택은 입력을 읽기 전용으로 유지하고 변이 이벤트·요청을 차단한다. 복사 및 기존 undo/redo의 독립 경로는 쓰기 권한 승격이 아니다. 생성 셀을 Core 일반 문단 주소로 추정하지 않는다. 이 연결은 Node의 통제 포트·실제 Canvas 제어기 소스 검사 범위이며 정상 SDK·실제 GUI의 완료 근거가 아니다.

현재 미완료 범위는 NativeSession 자체가 열리지 않는 readonly H5, pending 셀의 읽기 뷰 갱신 후 선택 복원, IME/hard-paragraph 전체 의미, 복잡 profile과 개별 emission 증명의 전체 폐쇄다. 공통 control-aware batch가 실제 호출부에 위임되기 전에는 현재 투영의 비선형 구간을 해결했다고 주장하지 않는다. 현재 후속의 Native·ABI/WASM·SDK·GUI 미실행과 이전 동결 코호트의 Native 결과를 구분한다.

공통 batch 연결 후속에서는 HX Snapshot, caret 역조회, 선택 조회와 transaction 후상 확인이 `control_text_read_context.Context`를 구역당 한 번 구성해 실제 current index와 template owner를 함께 확인한다. `partial`을 complete로 승격하지 않는다. canonical serializer와 physical/logical placement receipt 증명을 유지하며, Native 읽기 래퍼는 외부 generation을 조회 전에 캡처하고 응답 게시 전에 다시 검사한다. batch JSON의 동기 `readStamp.session/serial`을 외부 generation/쓰기 lease로 대체하지 않는다. 기존 17개 비선형 구간 전체가 해결됐다는 주장은 하지 않는다.

별도 readonly H5 Native owner는 편집 전역과 출력 버퍼를 공유하지 않는다. readonly SDK는 `hwp5_read_*` optional ABI만 사용하고 `v-s` session 및 `v-d2` 참조를 발급받는다. 같은 epoch/serial의 editor 참조를 서로 수락하지 않는다. 이전 읽기 문서는 새 읽기 시도·실패·종료 전에 퇴역한다. NativeSession/History를 켜거나 readonly를 해제하지 않으며, 공개 readonly SDK에 save/edit 메서드를 제공하지 않는다. required ABI6는 그대로이고 구형 WASM의 preview와 optional 검색 거부를 구분한다.

실제 SDK/Runtime/Core 소스 호출 경로는 통제 Native exports와 모듈 자격 메타데이터로 검사한다. 이는 Native 컴파일·정상 SDK 산출물·실제 화면 검증이 아니다. readonly H5의 표/글상자/반복 영역에 필요한 읽기 전용 구조·geometry 연결과 모든 offscreen owner 폐쇄는 후속 검증이 남는다. 일반적인 NativeSession 미개방 문제를 위 구성요소만으로 전체 해결했다고 선언하지 않는다.

HWPX batch v1의 `readStamp.serial`은 기존 Session serial로 유지한다. r7 SDK의 현재성 검증 경로는 별도 optional current export의 schemaVersion2를 요구하며, v2 serial은 외부 Native read-generation이다. Native identity에서 구역의 1-based first ordinal·행수와 session/epoch/generation을 조회 전후 캡처한다. 첫 ordinal0·first 이동·개수 변경·stale stamp·NoHistory ABA를 거부한다. H5의 0-based 문단 주소와 이 범위를 합치지 않는다. 구형 batch만 존재하면 current SDK는 명시 거부하며 per-paragraph anchor로 대체하지 않는다. raw v1 decoder와 이전 동결 SDK의 의미를 조용히 변경하지 않는다.

## Native와 화면 문단 좌표 경계

Native HWPX current selection/anchor의 물리 문단은 `first_paragraph + index`의 1-based 축이다. 화면 문단은 같은 event의 0-based 축이다. `js/document-text-coordinates.mjs`를 producer·caret capture·read permit·Surface 선택에서 공유하며, Native DTO의 target/ref/readBinding은 변경하지 않는다. 예를 들어 Native9001은 화면9000이고, 첫 Native1은 화면0이다. window reveal은 Native event identity를 직접 resolve한다. HWP5 문단0과 typed created-cell identity/host는 이 HWPX 변환을 적용하지 않는다.

Session 기반 공통 read Context는 `document_text_read_options.fromSession`에서 기존 `editor.siteOptions`의 branch 정책을 받는다. inactive branch의 같은 field ID와 unknown control이 있는 실제 Session 호출 회귀는 추가했으나 새 Native 실행 증거는 아직 없다. source-only 검사와 기존 Native16 자체 kernel 관측을 구분한다.

## 선택 run 조회 후속 r9: 소스 후보와 미실행 경계

KS X 6101:2024 공식 기계가독 원문의 17.2와 17.3에서 호환 구조의 case/default 대체 규칙 및 run/switch의 chart/OLE 예를 직접 대조했다. [공식 원문](https://standard.go.kr/KSCI/api/std/viewMachine.do?reformNo=03&tmprKsNo=KSX6101&formType=STD)의 규칙과 한컴 고정 공개 모델의 RunType·ctrl·fieldBegin·ParaListType 자식 등록을 사용한다. 그 등록은 전체 XSD 검증이 아니며 2024 자료만으로 2011 문서 전체 적합성을 선언하지 않는다. 승인 문서45의 EPUB namespace header switch 관측도 section run 지원의 실행 근거가 아니다.

원 Native 시험의 case/default 직접 p는 그대로 유효하다고 보지 않는다. 새 읽기 회귀는 실제 run 자식 t/ctrl와 fieldBegin/subList/p 소유 구조를 사용한다. 바꾸는 BASELABEL 문단은 기존 직접 run의 정상 소유자이고, 다른 문단의 비활성 case에는 별도 subList 문단·같은 field ID·미지 제어가 있다. 이 입력을 정규검사에서 빼 완료 처리하지 않으며 실제 Session의 snapshot·anchor·selection·transaction 검증 경로를 계속 요구한다. 원 입력은 이전 동결본으로 보존한다. 새 XML은 별도 fixture 파일에 두며 독립 Python 검사는 소유 구조만 검사한다.

조회 Context는 기존 선택 visitor의 active/kind/in_text와 실제 paragraph owner로 요청당 부모 인덱스를 만든다. 선택 wrapper의 자식은 원래 run 자식 규칙으로 다시 판정한다. 직접 p·미지 활성 자식·branch CharData는 거부하며, subList/새 문단/도형 경계에서는 기존 run을 전파하지 않는다. 조건부 개체 모양을 먼저 판정하고 그 wrapper와 선택 개체를 이중 제어로 세지 않는다. 조회 사실 분류는 기존 SSOT에서 공유하되 편집의 physical direct-run guard와 쓰기·History 권한은 유지한다.

프레임 생성은 기존 검증 XML visitor에서 임시로 빌린 namespace scope로 같은 선택 정책을 호출한다. 매 case마다 조상 태그를 재파싱하지 않고 scope/tag를 callback 밖에 저장하지 않는다. 원 tree의 span/name/parent·report 대조와 예산을 유지한다. 인덱스의 노드 방문과 실제 XML bytes·sites·parts·control routes 비용을 구분하며, 기존 전체17 비선형 지점이 해결됐다고 주장하지 않는다.

r9의 새 Native 선언7을 같은 batch-delegation 필터에 연결한다. 기존 5선언은 이름과 기대값을 보존하며 그 중 부정합 입력1을 위 소유 구조로 교정·undo/redo 바이트 비교를 강화한다. 정적 표는13그룹/123회(고유117), 새 집중 선택은9+8+12+13+3=45회다. Native 컴파일·실행과 실제 2011 XSD validation, WASM/SDK/GUI는 이 소스 후보에서 아직 수행하지 않았다. 기존9065 Native16과 이전 검색 Native71은 이 후속 성공으로 승계하지 않는다.

## Session 모델 예산과 문서 검색의 읽기 보존 예산

필드·전체문서 찾기/바꾸기 후속 후보는 `editor_session.Options.max_text_bytes`를 문서 전체 소유 UTF-8 모델 예산으로 유지한다. inventory와 source 쓰기 준비·변경 후 전체 모델 검사는 이 예산을 계속 사용한다. `max_read_retained_bytes: ?usize`는 별도로 각 섹션 읽기 커널의 plain+visible 보존량을 제한한다. 공통 `control_text_read_context.Limits.max_bytes`의 기존 의미와 합산/오버플로 검사는 바꾸지 않는다.

null 기본값은 읽기 입장 시 `std.math.mul(usize, max_text_bytes, 2)`로 계산하며, 오버플로는 `LimitExceeded`로 거부한다. 명시 cap은0을 포함해 그대로 사용한다. 명시값이 있으면 기본 곱셈을 계산하지 않는다. 포화·자동 확대·재시도는 없다. 생성 제어 문자열은 기본 두 복사본의 allowance를 넘을 수 있으므로 명시 cap이 필요할 수 있다. 이 값은 전체 heap 또는 문서 전체 retained 합계 한도가 아니다.

snapshot·selection·anchor·verifyAfter의 커널과 visible 복사는 같은 읽기 cap을 사용한다. 저장 후 같은 Session 옵션으로 재열어 검사하며, 읽기 사실은 필드 쓰기 권한을 발급하지 않는다. 기존 subtree 보호·semantic 제한·History 게시 순서와 원자적 거부를 유지한다. 이 설정은 Native Session 옵션이며 공개 SDK/ABI의 임의 cap 설정 API를 새로 추가한 것은 아니다.

원래 단일 섹션의 model61바이트/cap62/retained122바이트 예산 실패는 기존 봉인된 boundary 코호트의4 PASS/1 FAIL에 남아 있다. 두 섹션으로 균형을 맞추는 시험 변경으로 이 정책 갭을 대체하지 않는다. 후보의 원래 single-section5개와 별도 policy/retained6개는 의미적 exact/+1, 읽기 cap exact/+1, 기본·명시·산술 오버플로, 전체 저장 바이트·유효 prior redo·이력·fresh reopen을 요구한다. 새 scoped 합성 후보에서 이 Native 시험의 컴파일/실행은 아직0회다.

canonical scoped tree `63268d1f873a5985d195233b1678665dc7993279` 기반의 합성 준비에서는 소스 계약26개, JS/TS 구문109경로, ABI 생성 일치와 정규 Zig fmt를 확인했다. 이 검사는 실제 Native·SDK·GUI나 전체 TypeScript 타입 검사의 증거가 아니다. 실제 실행은 Main이 현재 수식/전체 슬롯과 조율하며, 별도 경계5와 budget6은 다음 최대2개 cohort의 검토안이다. 소스 선언 명부를 실행 수나 성공 수로 기록하지 않는다.


### 3bbb 집중 실행과 b972 포트의 구분

뒤이은3bbb99b 후보의 승인된 집중 Native에서 boundary5는 이름5·익명3 PASS, read-budget6은 이름6·익명3 PASS였고 두 stage 모두 skip0·exit0·전후 핀 일치와 전체 소유 PG 종료를 확인했다. 원래 단일 섹션 예산 시험은 preconditions 뒤 model61/cap62에서63 거부·62 성공, 저장 전체 바이트·이력·재열기에 도달했다. 기존 실패4 PASS/1 FAIL의 로그와 원래 소스는 보존했다.

이후 차트·새 문서·수식 통합 b972 tree에 대한 포트는 다른 합성 후보다. 차트 resource callback/서명, HWP5 HistoryV2 수식 삽입과 기존 readonly 저장 경계를 필드 경로와 함께 유지하고 스키마를 SSOT에서 재생성한다. b972 포트의 컴파일·Native/SDK/browser 실행은0이며 앞선3bbb 집중 성공을 합본 실행 근거로 사용하지 않는다.

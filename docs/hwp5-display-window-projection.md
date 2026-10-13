# HWP5 구간 표시 투영

## 현재 범위

전체 참조 읽기 inventory에는 20,000문단 초과 문서가 5개 있습니다. 최대 HWP5는 `task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp`의 53,448문단입니다. 기본 표시 한도를 늘리는 대신 원하는 구간의 원본 식별자를 보존하는 기초 투영을 추가했습니다.

`web/preview/content.mjs`의 `displayContent`는 선택적 `paragraphOffset`을 받습니다. 전체 문서 평탄 순서의 0부터 시작하는 offset이며, 결과 행의 section/local paragraph 번호는 원본 그대로입니다. HWPX의 1-based native paragraph 번호와 혼용하지 않습니다. `totalParagraphs`는 선택 구간이 아니라 전체 문서의 문단 수입니다. source/native 편집 문서나 저장 입력을 변경하지 않습니다.

기본 offset 0, 최대 텍스트 200,000 UTF16·최대 문단 20,000을 유지합니다. bounds는 음이 아닌 안전한 정수여야 하며 모호한 값은 `InvalidDisplayBounds`로 거부합니다. 텍스트 소진 뒤의 문단 식별자는 문단 한도 안에서 clipped·비편집 상태로 보존합니다. 앞/뒤 생략은 limited로 알립니다.

## 검증과 남은 연결

`tests/hwp5/paragraph-offset-projection.test.mjs`는 합성 다구역의 2만 경계·마지막 문단·Unicode 예산·잘못된 bound·입력 불변과 실제 53,448문단 문서의 offset 0/19,999/20,000/53,447 식별자를 확인합니다. 후보 e1609e28 및 현재 기본 WASM cbaaf27f 각각 3/3·skip 0·종료코드 0입니다. 기존 bounded identity/Canvas preview와 기초 합성 검사는 15/15로 통과했습니다.

이 투영만으로 HWP5 UI 구간 이동을 구현한 것은 아닙니다. Worker 연결, 표·그림·주석·필드 소유 문단의 구간 밖 의존성 보존, native 현재 텍스트/서식 갱신, 이동 후 편집·이력·저장·재열기와 실제 브라우저 검증이 남습니다. 구간 선택 뒤 전체 표를 버리거나 미완성 소유권 검사기를 완화하지 않습니다. 원본 조판 동일성이나 모든 큰 문서 편집 지원 완료도 주장하지 않습니다.

## 비연속 소유 문단 계획

`paragraph-dependency-plan.mjs`는 선택 구간과 그 의존 문단의 유한 closure를 정렬된 원본 ordinal 목록으로 계산합니다. 예산은 실제 보존하는 문단 수이며 멀리 떨어진 소유 문단과 사이의 모든 문단을 강제로 펼치지 않습니다. 입력 Map은 변경하지 않고 잘못된/중복 식별자·범위/예산을 거부합니다. 그래프의 서로 필요한 group 순환은 visited로 종료하지만 포맷 소유권 순환의 유효성을 인정하지는 않습니다. 해당 검사는 native adapter/소유권 검사기의 책임입니다.

후보 e1609e28의 실제 대형 원본에서 독립 레코드 oracle와 native table bindings/placements를 전부 대조해 표 129개·셀 문단 연결 52,075개를 확인했습니다. offset 50,000/count 100의 소유권 계획은 context ordinal 35,871 하나를 추가해 101문단이며 원문 저장은 바뀌지 않았습니다. 순수 계획 반례와 실제 소유권 검사는 합계 3/3·skip 0·종료코드 0입니다. native 질의와 순수 계획 검증이지 해당 구간의 실제 화면/편집 성공은 아닙니다.

표 어댑터, 구간 밖 문단의 clipped context 표시, 그림·주석·필드 dependency, Worker/UI 이동 및 현재값 갱신은 계속 남아 있습니다. 기본 표시나 HWPX의 기존 구간 정책을 이 계획으로 자동 대체하지 않았습니다.

같은 세 검사를 기본 cbaaf27f artifact에서도 재실행해 3/3·skip 0·종료코드 0을 확인했습니다. source/native 전체 gate 통과로 소급하지 않습니다.

## 표 구간 어댑터 구현

`hwp5-table-window-dependencies.mjs`는 native 표 연결과 배치를 ordinal dependency로 옮깁니다. 셀 문단의 host, 중첩 부모의 소유 table/list 연결을 검증하고 host를 선택하면 표의 대표 셀 식별자를 함께 보존합니다. 중복 소유권·없는 host/parent·부모 list 불일치·표 소유권 순환은 거부하며 텍스트 전체나 표 셀 전체를 강제로 확장하지 않습니다.

공통 `displayContent`의 선택적 `paragraphOrdinals`는 정렬된 원본 식별자를 한 번 순회로 표시하며 offset과 혼용하거나 중복/역순/범위 밖 값을 받지 않습니다. 의존 문단 수가 예산을 넘으면 일부를 조용히 삭제하지 않고 거부합니다. `hwp5-table-window-projection.mjs`는 선택 구간과 readonly·비선택 context를 구분하고, 필요한 실제 텍스트가 clipped되면 명시적으로 거부합니다. native 텍스트·저장 모델을 복제하지 않습니다.

실제 대형 원본에 어댑터 및 sparse 표시를 적용해 선택 100개·readonly context·독립 검증된 표 연결과 기존 strict nested ownership 검사·원문 저장 불변을 확인했습니다. 후보의 관련 7/7·skip 0·종료코드 0, 공통 표시/Canvas 회귀 17/17입니다. 후속 source schema guard와 clipping/잘못된 요청 선검사 반례를 추가하여 기본 artifact로 다시 실행 중입니다.

현재 어댑터는 표 소유권만 연결했습니다. 그림·주석·필드와 caption 전체의 의존성, 현재값 갱신·Worker/UI 이동·실제 브라우저/저장 E2E는 아직 남아 있으며 일반 HWP5 window route에 연결하지 않았습니다.

기본 cbaaf27f artifact의 최종 재실행은 8/8·skip 0·종료코드 0으로 완료됐습니다. 순수 표/의존성 반례도 5/5이며 위 실행 중 상태를 갱신합니다. 최신 native 전체 gate는 별도 실행 중입니다.

## 주석·캡션 의존성과 공통 투영

`hwp5-window-identities.mjs`로 전체 문서 ordinal/source identity 계산을 공유합니다. `hwp5-list-window-dependencies.mjs`는 native current paragraph flow와 note/caption source를 대조해 본문·호스트를 함께 보존합니다. 캡션은 native table layout의 정확한 control/table record 연결도 검사합니다. 소스 선언상 빈 목록은 문단을 만들어 채우지 않고, 선언된 본문 누락·잘못된/중복 목록·미해결 flow는 거부합니다.

`hwp5-owned-window-dependencies.mjs`는 표와 목록 관계를 새 Map으로 합성합니다. 공통 `hwp5-window-projection.mjs`가 요청 선검사·예산·표시·readonly context 구분을 단독 소유하며 기존 표 전용 함수를 이 계층에 위임했습니다. 이 합성은 아직 그림·필드 family를 포함하지 않습니다.

실제 `footnote-endnote.hwp`의 첫 각주 문단 선택은 host 및 두 각주를 포함하는 ordinal 0/1/2를, 미주는 3/4/5를 보존했습니다. 실제 `table-caption.hwp`에서도 캡션·표 관계를 합성한 구간과 context 비편집 상태·원문 저장 불변을 확인했습니다. 잘못된 표 control/목록·중복·누락·unclaimed flow 반례와 표 회귀는 후보/기본 artifact 각각 6/6·skip 0·종료코드 0입니다. 공통 identity/투영 리팩터링 후 대형 표 원본 회귀도 기본 artifact로 재실행 중입니다. Worker/UI·표시/저장 E2E 완료를 뜻하지 않습니다.

최종 리팩터링의 실제 대형 표·주석·캡션·표 반례 재실행도 기본 artifact 7/7·skip 0·종료코드 0으로 완료됐습니다. 위의 실행 중 상태를 갱신합니다. 범위 dependency의 그림·필드와 현재값/이력·실제 UI 연결은 여전히 남습니다.

## 도형 본문·캡션 의존성

`hwp5-drawing-window-dependencies.mjs`는 기존 drawing source validator와 공통 ordinal 계산을 재사용합니다. 본문 component의 부모 사슬을 root anchor까지 확인하고, 캡션의 control 소유자와 current paragraph flow의 정확한 parent/list를 대조합니다. 호스트와 본문은 서로 필요한 문단으로 보존하며 누락·미해결 flow·잘못된 root와 빈 선언을 구분합니다. 표·주석과의 합성은 기존 공통 window projection에 연결했습니다.

후보 e1609e28에서 실제 `textbox`, `shaperect`, `shapecontainer-2`의 본문 선택·readonly context·원문 저장 바이트 불변과 기존 각주/표 캡션 회귀, 합성 캡션 반례를 단일 동시성으로 실행해 7/7·skip 0·종료코드 0을 확인했습니다. 이 결과는 필드 의존성, 구조 편집 후 갱신, Worker/UI 이동과 실제 화면 조판을 증명하지 않습니다. 일반 HWP5 UI window route는 아직 활성화하지 않았습니다.

이전 native 전체 gate의 프로세스와 임시 로그는 현재 환경에서 남아 있지 않습니다. 실행 중이라는 과거 기록을 완료로 계산하지 않으며, 새 전체 gate의 결과가 필요합니다.

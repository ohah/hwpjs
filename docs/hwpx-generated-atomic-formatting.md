# HWPX 생성 본문의 일괄 서식

같은 편집 세션에서 분할·병합으로 만든 최상위 HWPX 본문에 `queryFormatting`과 `APPLY_FORMATTING_PATCH_COMMAND`를 사용합니다. 글자·문단 속성의 결합 적용과 현재 문단 스타일 기준 character/paragraph/all 초기화를 지원합니다. 현재 선택 token·범위·Native 권한이 필요합니다. 생성 셀·그리기·각주·캡션 등 중첩 소유자는 이 확대 범위가 아니며 원본 중첩 문단의 기존 조건은 유지합니다.

## 원인과 소유권

기존 projection의 owner와 초기화 helper가 `source_ordinal == null`을 일괄 거부했습니다. 이 값은 불변 원본에서의 출처이며 현재 문단이나 텍스트의 부재를 의미하지 않습니다. 실제 Core와 이전 WASM에서는 생성 본문 검사 6개가 `UnsupportedFormattingOwner`로 실패하고 원본 본문 검사는 통과했습니다.

현재 순서·텍스트는 기존 `structure_values`와 Sites가 소유합니다. 생성 문단의 nonzero generated ID, 중복된 section Sites 소유권 부재, 불변 section 소스 봉인, section 루트의 직접 `hp:p` 템플릿과 각 현재 site의 귀속을 확인합니다. joined 문단은 조각별 템플릿과 site를 검사합니다. 저장·재열기로 원본 문단처럼 바꾸거나 원본 텍스트를 현재 값으로 사용하는 우회는 하지 않습니다. 필드·제어문자·scalar 경계와 실제 쓰기 권한은 기존 검증기를 재사용합니다.

초기화는 같은 owner resolver로 실제 상속한 `styleIDRef`를 읽습니다. 사용자 지정 nonzero style도 사용하며 누락 style을 ID0으로 추정하지 않습니다. 기존 `History.applyBatch`가 단일 이력·후기 실패 rollback·redo 보존을 소유합니다.

## 요청 수명과 비용

Snapshot은 구역별 현재 view와 소스 봉인, owner별 검증·초기화 결과를 요청 안에서 공유하고 해제합니다. 초기화는 같은 current view를 빌리며 owner마다 전체 view를 다시 만들지 않습니다. 스타일 ID와 charPr/paraPr 참조의 인덱스도 같은 parsed header 수명 안에서 종류별 한 번만 구축합니다. 선택된 style 중복과 잘못된 ID의 기존 오류 우선순위, 리소스의 FIRST-match와 선택하지 않은 중복 허용 동작을 유지합니다. OOM은 정상 결과로 캐시하지 않으며 부분 구축 Map을 게시하지 않습니다.

Session의 불변 XML은 강제 depth 256 제한을 사용하며 257 거부를 검사했습니다. 새 site 귀속 검사는 이 제한 안에서 수행하고 owner별 성공을 공유합니다. 이는 일반 projection·각 리소스 writer·전체 transaction까지 모두 O(n)이라는 주장이 아닙니다. 이번 변경은 생성 owner와 reset 조회의 반복 순회를 줄이는 범위입니다.

## 검증 범위

Native 집중 검사는 Debug와 ReleaseSafe 각각 17개(집중 16개·등록 1개)가 통과했습니다. 같은 세션의 결합 적용·세 reset·nonzero/missing style·반복 split/merge·stale binding·후기 scalar 실패·단일 이력·보호 필드와 중첩 생성 거부·봉인/귀속 모순·새 cache OOM 및 오류 순서를 검사합니다. 전체 transaction OOM 전수검사나 대규모 지연 측정은 별도입니다.

새 ReleaseSafe WASM에서 실제 Core 7개와 정규 공개 SDK 산출물 7개가 통과했습니다. 첫 생성 query·결합 적용은 저장/재열기 전에 실행합니다. 독립 Python ZIP/XML은 원본 리소스 원문, 비대상 문단, 수정하지 않은 ZIP 구성원·압축 바이트·메타데이터와 UTF-16별 서식 및 reset 범위를 확인했습니다. HWP5 기존 생성 atomic 8개·확장 서식 11개, Worker/입력/이력 계약 41개도 통과했습니다.

같은 고정 JS·입력에서 기존 e140 Native와 새 후보를 비교해 고유 91개 읽기, 편집 가능한 89개 흐름·반복 무편집 저장 결과에 차이가 없었습니다. 배포 문서 2개의 기존 편집 거부도 유지됐습니다. 이 corpus 검사는 모든 문서의 편집·원본 앱 bitmap 동치를 뜻하지 않습니다. 독립 검토의 오류 순서 모델 335,922회와 서로 다른 BODY 템플릿의 joined Native probe는 실제 335,922개 문서 검사와 구분합니다.

근거는 `zig-out/verification/hwpx-generated-atomic-r1/`에서 Native·SDK·canonical·corpus·리뷰·브라우저를 분리합니다. 검증 WASM은 `a5242be8ce0118a22bb9d48fbca4149043e9e21142008deee85ae4503043184f`입니다. 실제 GUI 및 공개 배포는 별도 gate이며, 이 기록 자체로 npm 게시나 RN 검증을 주장하지 않습니다.

동일한 고정 공개 데모 빌드에서 Vanilla·React·Svelte 각각 생성 HWPX 본문의 글자(굵게·19pt·RGB색)와 문단(가운데 정렬·grid false) 모달 6개가 통과했습니다. 실제 새 문서의 hard Enter 두 번으로 만든 p2를 선택하고 첫 조회·적용 전에 저장/재열기를 하지 않았습니다. 한 번의 적용·undo/redo, 노출된 character reset·후속 입력·재열기와 독립 XML 45개를 검사했습니다. p0/p1 원문과 secPr/colPr 개수·소유 문단도 유지됩니다. 다른 두 reset 범위는 GUI가 아니라 별도 실제 SDK로 검증했습니다. 소유 브라우저 2세션과 49196 서버는 종료·재확인했습니다. 이 근거는 로컬 고정 빌드의 실제 GUI이며 공개 서버 실행 증거와 구분합니다.

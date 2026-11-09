# HWPX 동기 읽기의 문단 뷰 공유

HWPX CLI/MCP 본문 수집은 문단·표·그림 등 16개 관측을 조립합니다. 기존 경로는 각 관측에서 `display_current_paragraphs.read`를 호출해 같은 원본 XML을 다시 스캔하고 문단 뷰를 생성했습니다. Noori 실측에서 모델 수집만 약 32ms였으며 WASM 컴파일·문서 열기와 별도인 비용입니다.

열기 안의 Tree/텍스트 수집 중복 파싱 제거는 [별도 수명 계약](hwpx-open-content-reuse.md)이 소유합니다.

CLI·MCP의 반복 컴파일과 입력 복사 비용은 [WASM 준비 계약](wasm-preparation.md)이 소유하며 관측 재사용의 개선량과 합산하지 않습니다.

## 소유권과 수명

원본 XML 트리, 현재 텍스트 사이트와 구조 편집값이 계속 SSOT입니다. 새 `paragraph_read_scope.Scope`는 한 Section을 읽는 동기 구간에서만 문단 뷰를 공유합니다. 현재 문서 모델이나 편집 원문의 별도 영구 복사본을 보관하지 않습니다.

Section의 `paragraph_query_cache`는 Scope 내부의 임시 Cache를 빌립니다. 정확한 원본 Section 주소가 일치해야 재사용하며, Session/Section 복사 투영은 원래의 uncached 경로로 계산합니다. 관리되는 변경의 serial이 달라지면 빌린 문단에 접근하기 전에 `StaleParagraphReadScope`로 거부합니다. 구조 편집값이 이미 있으면 그 값을 빌리고, 해제할 때 canonical 값을 해제하지 않습니다. Scope 초기화·연결은 선택 Section만 O(1)로 검사합니다.

원본 태그 연결도 source 순서의 cursor를 사용합니다. 무작위 조회용 기존 `startTagIndex`는 유지하고, 문단·텍스트 위치를 스캔할 때는 각 indexed element를 최대 한 번 지나는 `startTagIndexForward`로 연결합니다. 동일한 span·소유권 검사를 공유하고, 실패 시 cursor를 갱신하지 않습니다. 선택 분기·중첩·빈 문단의 기존 scanner ordinal을 바꾸지 않습니다.

Native의 선택 ABI `hwpx_edit_read_scope_begin(section)`은 0이 아닌 토큰을 반환합니다. 토큰은 재사용하지 않으며 한 인스턴스의 중첩 Scope는 거부합니다. `end(token)`은 정확한 활성 토큰만 종료하고 오래된 토큰으로 새 Scope를 종료하지 않습니다. close와 성공한 문서 교체는 Session 해제 전에 Scope를 끝냅니다. 실패한 open은 기존 Scope를 유지합니다.

WASM Scope 안에서는 중앙 편집·배치·이력 이동 및 이력 설정 가드가 변경을 거부합니다. raw Zig 내부 Scope는 호출자가 읽기 수명을 지켜야 합니다. 기본 Session의 직접 변경과 임의 필드 쓰기까지 serial이 자동으로 추적한다고 주장하지 않습니다. 관리되지 않은 변경을 한 뒤 기존 뷰를 계속 사용하는 것은 이 내부 수명 계약 밖입니다.

## JS와 모델 연결

`hwpx-read-scope.mjs`는 선택 ABI가 둘 다 있는 경우에만 동기 `withReadObservations`를 제공합니다. 구형 WASM에는 capability가 없습니다. 준비 실패는 재사용만 생략하고 기존 getter를 그대로 실행하므로 데이터·오류 검사를 생략하지 않습니다. callback은 한 번만 실행하며 원래 getter와 codec을 재사용합니다. 별도 집계 wire나 중복 관측 파서는 없습니다.

모델 수집기는 Section별로 Scope를 열고 기존 결과를 조립합니다. callback 생략·중복·결과 대체는 거부하며 prototype에서 주입된 capability를 채택하지 않습니다. callback 오류에도 토큰을 해제하고, 해제도 실패하면 두 원인을 보존합니다. Promise/thenable 반환은 거부합니다. 이 검사는 이미 예약된 비동기 continuation의 취소를 보장하지 않습니다.

## 검증과 측정 경계

실측 원자료는 `zig-out/verification/read-performance-r1/`에 있습니다. `candidate-comparison.json`은 같은 후보 WASM에서 Scope 사용 여부만 달리한 대조를 포함합니다. Noori HWPX의 후속 6회 중앙값은 모델 수집 32.93ms → 11.02ms, 열기·모델 수집 합계 53.86ms → 31.23ms였습니다. 전체 DocumentView와 텍스트·Markdown은 baseline 및 두 후보 경로에서 정확히 일치했습니다. HWP 경로는 변경하지 않았으며 HWP 시간의 작은 차이를 개선 효과로 계산하지 않습니다.

이 수치는 프로세스 시작·파일 IO·전체 CLI 시간을 포함하지 않습니다. 지원 범위·오류 검사를 줄여 만든 빠른 경로가 아니며 원본 조판의 동치를 뜻하지 않습니다. 실제 Native 수명·편집/undo 및 다양한 실물 문서의 결과는 후속 runtime-review 증거와 구분해 확인합니다.

마지막 선형 cursor 후보는 `candidate-linear.wasm`, SHA256 `f7270ba5cf1a1dc808af88e9ca69e110253676046f9983d843c62364eb2e6f7e`입니다. 해당 후보의 동일 바이너리 대조는 모델 수집 33.26ms → 11.27ms, 열기·모델 합계 54.06ms → 32.27ms였습니다. 설치된 실제 CLI의 Noori HWPX text 읽기는 공개 0.1.1 108.66ms → 로컬 후보 91.73ms, Markdown은 108.50ms → 91.27ms였습니다. 모두 교대 실행한 후속 6개 표본의 중앙값이며 stdout 전체 바이트가 일치했습니다. HWP CLI는 72.99ms와 73.72ms로 개선을 주장하지 않습니다.

`runtime-review/final-linear/`에서 8개 실물 문서의 초기·편집·undo·redo·split undo 상태와 Native 토큰/close/open/변경 거부를 검증했습니다. 문단 split 직후에는 scoped·unscoped·baseline 모두 `DuplicateParagraphSourceIdentity`로 완성 모델 생성에 실패합니다. 이는 기존 source node를 두 현재 문단이 공유하는 별도 문제입니다. 그 상태의 관측값 자체는 같지만 정상 모델 생성까지 통과했다고 계산하지 않습니다.

같은 WASM을 포함한 로컬 패키지를 별도 디렉터리에 설치한 뒤 실제 CLI의 생성·조회·편집·변환과 stdio MCP의 16개 도구 연결을 검사했습니다. 두 E2E 진입점 모두 통과했으며, 근거는 `final-installed-e2e.log`와 `final-installed-e2e/`에 있습니다. 공개 npm 버전이나 브라우저 배포의 검증은 아닙니다.

구형 WASM 호환 경로는 별도로 검사했습니다. 사용자 작업 중인 변경을 제외한 검증 소스에서 Node 24.20.0·기존 Native820을 명시한 CLI 32개 파일의 545개 검사가 모두 통과했고 skip은 없었습니다. strict 타입 검사도 통과했습니다. 근거는 `final-source-tests/RESULT.json`입니다. 새 JS Scope·문서 모델의 57개 집중 검사와 일부 사례가 겹치므로 두 수치를 고유 검사 수로 합산하지 않습니다.

포맷 검출 뒤 해당 editor만 초기화하는 dynamic import 후보도 비교했습니다. 같은 WASM·단일 파일 번들을 사용한 두 집단에서 CLI 시간이 일관되게 줄지 않아 채택하지 않았습니다. 208회 읽기의 text·Markdown 출력은 일치했으며, 이 결과는 `startup-implementation/REPORT.md`에 보존합니다. 남은 프로세스 시작·문서 열기·표 관측 비용을 문단 뷰 공유의 개선량에 합산하지 않습니다.

이 변경은 로컬 검증 후보입니다. 사용자의 배포 전 확인 요청에 따라 npm 게시·main 푸시·배포 산출물 교체를 수행하지 않습니다.

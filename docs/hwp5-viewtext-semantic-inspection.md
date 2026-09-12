# ViewText 의미 검사 선택과 검증

## 현재 확인한 경계

기본 정책에서 컨테이너의 ViewText는 [경계 검사](hwp5-track-change-viewtext.md)만 수행하고 모든 레코드를 의미 검증 보류로 보고합니다. 별도 엄격 의미 검사는 명시적으로 선택합니다. [줄 캐시 좌표 조사](hwp5-line-cache-coordinates.md)는 병합 좌표 가설을 계산했지만 원본 프로그램의 좌표 기준을 확정하지 못했습니다. 위치 검사를 무시하거나 병합 길이로 임의 변경하지 않습니다.

2026-09-12, `cd4e3d866f4ce97560f9a7d2743b678e171d3e4f`의 문서 검사 로직에서 기존 테스트용 mode 24로 실패 경계를 재확인했습니다. `issue5169_viewtext_changetracking.hwp`는 BodyText 24,344바이트/775레코드는 통과하고 ViewText 105,182바이트/2,814레코드는 InvalidLinePosition입니다. `task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp`는 BodyText 5,838,134바이트/212,001레코드와 ViewText 8,015,903바이트/265,451레코드 모두 통과했습니다. 이 검사는 원본을 변경하지 않고 Node raw DEFLATE 해제 후 기존 decoded 문서 검사기에 각 뷰를 별도로 공급했습니다. 기존 `/tmp/hwpjs-preview-probe.wasm`을 사용한 재확인이며 새 연결 코드의 검증 증거는 아닙니다.

## 책임 분리

`src/hwp5/document/section_set.zig`에 기존 구역 배열 순서·공유 레코드/양식 예산·구역 간 메모 참조 검사를 분리했습니다. 구역 배열을 소유하는 보고서를 반환하며, 문서 validation은 배열 소유권을 문서 보고서로 이전합니다. DocInfo 재파싱이나 CFB 조회는 수행하지 않습니다. 입력 바이트 한도·헤더·DocInfo·옵션 검증은 호출자 책임입니다.

ViewText 연결은 이 공통 구역 검사기를 재사용합니다. BodyText와 ViewText의 메모 ID를 하나의 인덱스에 섞지 않고 각 뷰 안에서 구역 간 참조를 확인합니다. 기존 엄격한 문단 좌표 규칙을 선택한 검사가 성공하더라도 미지원 payload나 줄 캐시 해석 전체가 완료된 것으로 표시하지 않습니다. 기본 ViewText 경계 검사의 의미 보류를 자동으로 지우지 않습니다.

`container.Options.view_text_semantics`는 기본 uninspected이며 strict_document_rules를 명시적으로 선택할 수 있습니다. 선택 후 ViewText가 있으면 같은 DocInfo 리소스 개수와 문서 옵션으로 공통 구역 검사기를 호출하고, 반환 보고서의 view_text_semantics가 구역 배열을 소유합니다. 부재하거나 미선택이면 null입니다. 엄격 검사 실패 시 framing-only 성공으로 재시도하지 않습니다. 암호화/DRM/배포용 문서 게이트는 바꾸지 않습니다.

기존 view_text 보고서는 framing 증거로 유지하며 deferred_records를 자동 차감하지 않습니다. 선택 보고서는 등록된 검사 결과를 제공하지만 기존 의미 검사기의 미지원/보류 진단도 유지됩니다. 복호화는 한 번만 하며 원본 ViewText 바이트 한도와 문서 공유 레코드 한도를 유지합니다. 의미 검사를 위한 두 번째 레코드 순회가 입력 소비량을 두 번 차감하지는 않습니다. 양식 개수·속성 바이트·노드 예산은 공통 form_budget.consume으로 BodyText 소비량을 차감한 뒤 ViewText 구역들에 공유합니다. 메모 참조 인덱스는 뷰별로 독립적입니다.

ViewText 임시 해제 버퍼는 구역 검사 종료 후 정리됩니다. 성공 보고서의 구역 배열은 컨테이너 보고서로 소유권을 이전하고, 후속 BinData/PrvImage 등 검사에서 실패하면 errdefer로 해제합니다.

분리 후 `zig build test --summary all`은 5/5 단계·963/963 네이티브 테스트, 종료 코드 0입니다. 이 결과를 새 ViewText 연결의 검증 완료로 해석하지 않습니다.

초기 연결 후 전용 네이티브 테스트는 Debug/ReleaseSafe/ReleaseFast 각각 5/5(root 포함), 종료 코드 0으로 통과했습니다. 다구역 보고서의 입력 해제 후 수명, 성공/후속 컨테이너 실패 경로의 OOM 및 명시적 할당 회계, InvalidLinePosition 유지, 공유 한도의 정확한 경계와 한 단위 부족을 검사합니다. 이후 추가한 실파일 WASM·양식/메모 범위·소스 변형·정규 audit 결과는 아래 항목에 기록합니다.

## 양식 예산 추가 검증

추가 테스트와 공통 fixture 분리 후 `zig build test --summary all`은 5/5 단계·968/968 테스트, 종료 코드 0으로 통과했습니다.

기존 문서 양식 fixture를 `document/form_test_fixture.zig`로 분리해 본문 검사와 컨테이너 검사에서 재사용합니다. 본문 2구역과 ViewText 2구역에 각각 양식 1개를 배치하고, 합계 4개·속성 노드 8개·속성 바이트 합계의 정확한 한도는 통과하며 각 한도를 독립적으로 1만큼 줄이면 FormControlLimit/FormPropertyInputLimit/FormPropertyNodeLimit으로 거부함을 확인했습니다. ViewText 의미 검사를 끄면 본문 소비량만으로 통과합니다.

추가 후 전용 테스트는 Debug/ReleaseSafe/ReleaseFast 각각 6/6(root 포함), 종료 코드 0입니다. 격리한 소스 사본 `/tmp/hwpjs-view-form-mutant.5hFdr1`에서 ViewText 진입 시 본문 양식 소비량 차감을 제거하자 Debug 테스트가 예상 FormControlLimit 대신 성공 보고서를 받아 실패했습니다(2개 중 1개 실패, 종료 코드 1). 이 변형 실행의 누수 로그는 expectError가 예상 밖 성공 보고서를 해제하지 못한 결과이며, 정상 구현 누수의 증거로 해석하지 않습니다. 이 검증은 합성 CFB의 양식 예산 경계에 한정하며 실파일 WASM·메모 참조 범위·전체 audit 완료를 뜻하지 않습니다.

## 메모 구역 연결과 뷰 격리

`container/view_memo_tests.zig`의 합성 CFB는 디렉터리에서 Section1을 먼저 배치하되 논리 Section0에 필드 시작, Section1에 종료 토큰과 참조 대상 리스트를 둡니다. BodyText와 ViewText 모두 동일한 메모 번호를 사용합니다. 두 뷰의 참조·종료 참조·범위 보고서가 같고, 각 뷰에 참조 1개·대상 1개·구역 간 연결 1개·구역 간 범위 쌍 1개이며 중복 대상·고립 종료·미종료 시작은 없음을 검사합니다. field instance ID 99와 메모 번호는 구분합니다.

ViewText 대상 번호만 바꾸면 BodyText에 올바른 대상이 있어도 MissingMemoTarget이어야 합니다. 의미 검사 미선택 시에는 이 검사를 수행하지 않습니다. 메모 번호 0과 UINT32_MAX도 확인했습니다. 정상/잘못된 대상 경로에 checkAllAllocationFailures를 수행했으며 전용 네이티브 테스트는 Debug/ReleaseSafe/ReleaseFast 각각 3/3(root 포함), 종료 코드 0입니다.

격리 사본 `/tmp/hwpjs-view-memo-mutant.EMvocv`에서 section_set의 memo_report.validateKnown 호출을 제거하자 잘못된 ViewText가 성공해 테스트가 실패했습니다(Debug 3개 중 1개 실패, 종료 코드 1). 합성 연결 검증이며 새 컨테이너 연결의 실파일 WASM 검증을 대신하지 않습니다.

메모 테스트 추가 후 전체 네이티브 검증은 `zig build test --summary all` 5/5 단계·970/970 테스트, 종료 코드 0입니다.

## 테스트용 WASM 연결

비공개 mode 297을 추가했습니다. 입력은 정책 u8(0 미선택/1 엄격)·기존 17바이트 양식 선택·문서 바이트 한도 u32·CFB입니다. 제품 JS 공개 API는 변경하지 않습니다. 출력은 기존 ViewText framing 6개 u32, 전체 소비 바이트·미검사 스트림·의미 보고서 존재 각 u32입니다. 존재하면 구역 수·레코드 수, 메모 참조/종료/범위 보고서, 구역 보고서 배열을 추가합니다. 기존 document-probe의 구역 직렬화를 함수로 분리해 재사용하며 기존 mode의 필드 순서는 바꾸지 않습니다.

`tests/hwp5/view-semantic.mjs`는 실파일 ViewText를 기존 스트림 검사로 해제한 뒤 mode 24/90/92/94의 별도 문서 검사 결과와 새 컨테이너 경유 결과를 바이트 단위로 비교합니다. 이는 연결 동등성 검증이지 독립 파서에 의한 명세 정확성 증명은 아닙니다. 각 파일에서 ViewText만 BodyText의 검증된 바이트로 교체한 합성 대조군도 검사합니다. 정확한 총 바이트/레코드 한도 통과, 각각 1 부족 시 LimitExceeded, 오류 후 재호출, 미선택 보고서, 잘못된 정책 InvalidMode를 포함하며 오류는 정확한 Error 생성자와 메시지를 확인해 WASM trap을 허용하지 않습니다.

Debug WASM에서 issue5169 원본 ViewText 105,182바이트/2,814레코드는 InvalidLinePosition을 유지하고 미선택은 통과했습니다. task2070 시장구조조사 원본 ViewText 8,015,903바이트/265,451레코드는 956바이트의 기대 의미 보고서와 일치했습니다. 두 파일의 BodyText 교체 대조군도 각각 956바이트로 일치했습니다. 이 검사를 정규 HWP audit에 연결했으며 최종 결과는 아래 정규 audit 항목에 기록합니다.

같은 실파일/교체 대조군·한도·오류 복구 검사를 ReleaseSafe와 ReleaseFast 독립 WASM에서도 실행해 동일한 결과와 종료 코드 0을 확인했습니다. 산출물은 `/tmp/hwpjs-view-semantic-probe.wasm`, `/tmp/hwpjs-view-semantic-ReleaseSafe-probe.wasm`, `/tmp/hwpjs-view-semantic-ReleaseFast-probe.wasm`입니다. 구역 직렬화 SSOT 분리 후 기존 전체 mode의 회귀 검사도 아래 정규 audit에 포함했습니다.

## 출력 변조와 trap 검증

각 빌드 모드에서 실파일 검사 호출과 CFB 응답을 한 번 기록한 다음, 같은 호출 순서의 재생에서 첫 성공 의미 보고서(956바이트)의 각 바이트를 독립적으로 XOR 1 변조했습니다. 956/956 경우 모두 비교 assertion이 실패했습니다. 예상 InvalidLinePosition의 Error를 같은 메시지의 WebAssembly.RuntimeError로 치환한 경우도 assertion이 실패했습니다. Debug/ReleaseSafe/ReleaseFast 각각 출력 변조 956개·trap 1개 탐지, 실행 종료 코드 0입니다. 이 결과는 기록한 출력의 검사 민감도이며 매 변조마다 실제 WASM을 다시 실행한 퍼징 결과는 아닙니다.

## 소스 변형 재검증

`/tmp/hwpjs-view-final-mutants.6wlYrt`의 격리 사본에서 (1) ViewText 진입 시 본문 양식 예산 차감 제거, (2) 후속 컨테이너 실패 시 의미 보고서 errdefer 제거, (3) 메모 참조 대상 validateKnown 제거를 각각 적용했습니다. 세 변형을 Debug/ReleaseSafe/ReleaseFast로 실행한 총 9회 모두 ViewText 필터 테스트 12개 중 1개가 실패해 변형을 탐지했습니다. 컴파일 실패가 아니라 테스트 assertion 실패이며 각 변형 실행은 종료 코드 1, 전체 탐지 실행은 종료 코드 0입니다. 후속 실패 누수 변형은 ReleaseFast에서도 명시적 DebugAllocator 잔여 할당량 검사로 탐지했습니다. 정상 작업 트리에는 변형을 적용하지 않았습니다.

## 정규 audit

정규 audit와 별도로, 기존 previewImageFixture의 0개 구역 문서를 재사용한 인메모리 CFB로 빈 경계를 검사했습니다. ViewText 부재는 선택 여부와 무관하게 의미 보고서 null(36바이트), 빈 ViewText 저장소는 미선택 시 null·선택 시 0개 구역/0개 메모 보고서(156바이트)입니다. 같은 이름의 stream은 InvalidHwpEntryKind, ViewText 없이 track_changes 비트를 설정한 문서는 MissingViewText이며 두 정책 모두 같은 오류입니다. 세 standalone WASM 모드 각각 성공 기대 4건·정확한 오류 기대 4건이 통과했습니다. 이 추가 실험은 정규 audit 테스트 수에 포함되지 않습니다.

소스와 테스트를 고정한 상태에서 Debug → ReleaseSafe → ReleaseFast 정규 audit를 순차 실행했습니다. 세 모드 각각 26/26 단계·970/970 네이티브 테스트·HWP/WASM 7,840,755회 검사로 통과했으며 종료 코드 0을 확인했습니다. 로그는 `/tmp/hwpjs-view-semantic-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 변경 Zig 파일 포맷·git diff 공백 검사 및 변경 문서 3개의 로컬 링크 26개 확인도 통과했습니다. 최종 제품 빌드·게시 게이트는 별도로 확인합니다.

정규 audit 이후 최종 `zig build test --summary all`은 5/5 단계·970/970 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다(각 종료 코드 0). 이번 단계는 ViewText의 선택 검사 연결을 검증한 것이며 변경 추적 줄 좌표 해석·미지원 payload·HWPX·문서 편집/쓰기·공개 HWP JS API 완료를 뜻하지 않습니다.

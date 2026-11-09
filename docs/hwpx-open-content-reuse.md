# HWPX 열기의 텍스트 이벤트 재사용

기존 `editor_session.open`은 `xml_part_tree.parse`로 구역 XML을 검증한 뒤, `text_sites.collect`의 `Tree.visitContent`에서 같은 XML을 다시 파싱했습니다. Node 시작·WASM 준비와 별개인 문서 처리 비용입니다. [동기 관측의 문단 뷰 공유](hwpx-read-observation-scope.md)는 열기 이후 조회를 최적화하며, 이 문서는 열기 안의 중복 작업 제거를 소유합니다.

## 소유권과 적용 범위

`parseWithContent`는 기존 `parseInternal`과 같은 XML 문법·namespace·자원 한도 검사를 수행하면서 CharData/CDATA 이벤트를 임시로 보관합니다. 이벤트의 값은 Tree가 소유한 원문을 빌리고, 부모는 같은 Builder가 만든 요소 인덱스입니다. 별도 XML 파서나 저장 모델은 없습니다.

`editor_session.open`만 freshly parsed Tree와 그 이벤트를 외부 개입 없이 즉시 `text_sites.collectParsed`에 전달합니다. 기존 텍스트 수집기의 branch 선택·run 공백 검사·빈 텍스트·anchor/tab 보정·디코딩·편집 한도는 공유합니다. Site는 문자열을 복사하고 위치를 정수로 보관하므로 이벤트 배열은 구역 열기 중 해제합니다. Session에는 새 이벤트 캐시나 편집 원문의 복사본을 남기지 않습니다.

기존 `parse`, `collect`와 `Tree.visitContent`는 유지합니다. 임의로 변경하거나 위조한 Tree/event 쌍에 `collectParsed`를 적용하는 것은 내부 계약 밖입니다. 일반 Tree 조회의 span/name/parent/end/report 재검증을 이 경로로 대체하지 않습니다.

## 메모리와 실패

최대 16,384개의 이벤트까지만 수집합니다. 다음 이벤트가 오면 부분 배열을 해제하고 저장을 중단합니다. XML 검증은 끝까지 계속하고, 결과의 `events = null`을 받은 수집기는 기존 `visitContent` 경로를 사용합니다. 입력을 새로 거부하거나 일부 텍스트를 버리는 한도가 아닙니다. content가 실제로 없는 빈 배열과 최적화를 포기한 null을 구분합니다.

추가 순회는 이벤트 수에 선형이고 임시 배열은 위 개수에 제한됩니다. ArrayList의 여유 capacity가 있으므로 정확한 바이트 상한을 이벤트 개수와 구조체 크기의 곱으로 단정하지 않습니다. 엔진 전체나 기존 Site 정렬까지 선형이라고 주장하지 않습니다.

할당 실패는 `OutOfMemory`로 전파하고 트리·이벤트·Site의 부분 소유권을 정리합니다. 추가 할당 때문에 과거와 같은 할당 번호에서 실패하거나, 메모리 부족과 뒤쪽 XML 오류의 우선순위까지 같다고 주장하지 않습니다.

## 검증과 측정

근거는 `zig-out/verification/read-performance-r2/`에 보존합니다. 집중 검사는 독립 parse의 XML Report, 기존 collector와 모든 Site 값, CDATA·문자참조·선택 분기·중첩·빈 문단·tab·외부 namespace·run 공백, 원본 버퍼 변경과 Tree 수명, UTF-16 편집 거부·한도·할당 실패를 비교합니다. 16,383/16,384/16,385 이벤트 경계와 capture 중단 뒤 잘못된 namespace의 거부도 검사합니다.

CLI 번들 분할과 포맷별 import를 조합한 별도 후보는 HWPX 읽기에서 일관된 이득이 없어 채택하지 않았습니다. 해당 108회 실행의 출력은 이전 text·Markdown SHA와 같았습니다. `chunks/cli-comparison.json`은 이 미채택 후보의 증거이며 아래 Native 후보와 합산하지 않습니다.

메모리 한도 보완 전 후보의 같은 설치형 CLI 대조에서는 양쪽에 `--wasm`을 명시해 HWPX text 102.74→99.08ms, Markdown 100.12→97.27ms를 측정했습니다. 후속 12쌍의 paired 중앙값은 각각 약 -3ms였고 11쌍에서 후보가 빨랐습니다. 원자료는 `fused/cli-comparison.json`입니다. 이전 기본 로더의 약 92ms와는 조건이 다르므로 직접 연결하지 않습니다. 최종 한도 포함 후보는 별도로 검증·측정합니다.

최종 한도 포함 WASM은 SHA256 `677b17cb24e98b47c08e2f15b6b652115d2459121f349d8f9d507b3af9d766b3`, 6,992,130바이트입니다. 동일 CLI 번들 바이트와 각각의 기본 WASM을 포함한 로컬 패키지를 설치해 비교했습니다. 126개 파일의 설치 전후 바이트 일치와 Node 24.20.0을 확인했습니다. 새 프로세스·컴파일 캐시 비활성·OS 캐시 미초기화 조건이며 시스템 무부하는 보장하지 않습니다.

기본 로더의 첫 집단(첫 회 제외 12쌍)에서 HWPX text 중앙값은 97.06→94.58ms, Markdown은 96.85→94.59ms였습니다. 실행·문서 순서를 반대로 한 두 번째 집단은 각각 97.01→94.72ms, 97.30→94.46ms였습니다. paired 중앙값 절감은 text 2.23~2.52ms, Markdown 2.73~3.29ms이며 각 집단 text 12쌍, Markdown 11~12쌍에서 후보가 빨랐습니다. 두 집단의 208회 read 출력 SHA는 기존 text·Markdown과 정확히 같았습니다. 원자료는 `fused/cli-default-budget.json`과 `cli-default-budget-repeat.json`입니다. 앞선 92ms와 실행 시점이 다르므로 그 수치에서 이 절감량을 빼 새 절대 시간을 만들지 않습니다.

HWP5 경로는 변경하지 않았지만 같은 두 집단에서 HWP CLI는 paired 중앙값 약 0.40~1.12ms 증가했습니다. 이 작은 증가의 원인을 확정하지 않았으며 HWP 성능 개선이나 모든 형식의 무회귀 속도를 주장하지 않습니다. Native 모듈 전체·Node 시작 비용까지 포함한 측정입니다.

최종 `test-hwpx-open-content`는 5개 검사(실질 4개와 import 진입점), 3개 빌드 단계가 통과했습니다. `fused/runtime-budget/`은 8개 실물 문서의 전체 모델·text·Markdown과 편집·undo·redo·수명 검사를 비교한 97개 assertion이 통과한 근거입니다. 문단 분할 직후 모델 생성의 기존 `DuplicateParagraphSourceIdentity`는 이전 후보와 같이 재현되며, 이 상태의 정상 모델 생성까지 통과했다는 뜻은 아닙니다. 두 독립 정적 리뷰와 실제 실행 결과도 구분해 보존합니다.

이 변경은 로컬 후보이며 브라우저 화면·공개 npm·원격 배포의 검증은 아닙니다. 배포와 자동 배포를 유발하는 푸시는 사용자 확인 후 수행합니다.

# 생성 셀의 정규 문단과 입력 서식

H5와 HX의 생성 셀은 같은 정규 문단 모델을 사용합니다. 정상 공개 Core에서 DOM 없이 셀을 발급·편집하고, 혼합 글자 입력과 서식을 저장·재열기·undo/redo로 확인했습니다. 실제로 확인한 범위와 남은 기능은 아래에 구분합니다. 원본 셀·화면 입력·CLI/MCP의 다른 검증을 이 경로의 실행 증거로 대신하지 않습니다.

## 단일 소유 모델

`created_table.Cell`의 소유자는 `authored_paragraph.Paragraph`입니다. 텍스트는 하나이며 서식은 부모 기본 리소스를 상속하는 `inherit` 또는 완전한 UTF-16 `CharacterRun` 배열입니다. 각 셀에는 안정적인 `paragraph_id`가 있습니다. 첫 run은 0에서 시작하고 경계는 엄격히 증가하며 서로게이트 쌍을 나누지 않습니다. 명시적인 EOF 경계와 리소스 ID 0도 유효합니다.

복제·행/열 편집·스냅샷·이력·메모리 예산은 이 모델을 사용합니다. 읽기 DTO의 `character_runs`와 화면의 `characterRanges`는 투영이며 별도 쓰기 정본이 아닙니다. 입력 중 draft도 현재 Native ACK에서 파생합니다. 셀 전체 문자열 교체로 혼합 서식을 평탄화하거나 셀마다 글자 모양 하나를 따로 배정하지 않습니다.

공통 `character_run_edit`가 run 조회·합치기·splice를 소유하며 전역 리소스는 기존 형식별 리소스 소유자가 관리합니다. 텍스트/run 검증과 직렬화는 해당 텍스트와 run을 순회합니다. 격자 복제와 자원 조회의 비용은 별도 경로이며 이 계약을 전체 조판 성능 측정으로 읽지 않습니다.

## 상속 경계

생성 셀의 논리 텍스트에는 물리적인 문단 종료 CR이 없습니다. 검증한 비어 있지 않은 EOF의 순수 삽입만 직전 보이는 글자의 리소스를 상속합니다. HWP5 내부 경계는 기존 오른쪽 의미, HWPX 내부 경계는 기존 왼쪽 의미를 유지합니다. 선택 교체는 첫 교체 글자의 리소스를 기준으로 하며, 명시한 입력 속성은 그 리소스에 적용합니다. 빈 셀은 명시적인 기본 run을 사용합니다.

원본 HWP5 문단의 EOF helper는 실제 토큰이 문단 구분 CR인지 확인합니다. 원본 제어 payload·암시적 빈 문단·명시 style ID의 의미를 생성 셀의 논리 EOF로 추정하지 않습니다. Undo/redo 뒤에는 대기 서식 의도를 보존하지 않고 복원된 Native 관측에서 다음 입력 서식을 다시 읽습니다.

## 저장·물리 승격·영수증

HWP5 writer는 기존 PARA_HEADER/PARA_CHAR_SHAPE 프레이밍으로 전체 run을 기록하고 실제 CR을 추가합니다. HWPX writer는 각 run을 기존 XML escape·개행 writer에 전달합니다. 양쪽 모두 현재 전역 리소스의 유효성을 검사하며 저장을 위해 JS가 임시 재열기로 소유자를 바꾸지 않습니다.

HWPX의 Native `saveWithTablePlacements`가 발행하는 배치 영수증은 `inline_object_table_transfer.verify`에서 정규 run writer의 실제 바이트와 대조됩니다. 정규 저장과 영수증 저장은 별도 텍스트/run 모델을 만들지 않습니다. 논리 셀에 개체를 삽입할 때는 현재 Native owner와 물리 배치 증거를 사용해 승격합니다.

실제 공개 Core에서는 HX 생성 셀의 Native owner를 조회해 수식을 삽입했고, 물리 셀로 승격된 뒤에도 일반 D의 rich run과 전체 저장·undo/redo 바이트가 유지됐습니다. 이 확인은 모든 차트·수식 배치 조합이나 CLI/MCP 전체 행렬의 완료를 의미하지 않습니다.

## Native 거래와 가용성

`splice_created_cell`은 section·십진 u64 identity·row/column·UTF-16 start/end·text·character insertion을 받습니다. 가짜 source paragraph나 SelectionTarget을 만들지 않습니다. 일곱 언어 글꼴·굵게·기울임·크기·글자색·밑줄·취소선은 기존 character patch와 형식별 검증을 사용하며, 형식별 미지원 enum의 거부를 완화하지 않습니다.

Native는 기존 History와 formatting batch 안에서 분리된 후보를 준비합니다. 텍스트·run·리소스·예산·저장 검증을 통과해야 교환합니다. 일반 입력도 같은 좌표 splice를 사용합니다. 구형 ABI에는 명시적인 `CreatedCellTypingUnavailable`을 반환하며 셀 전체 교체로 재시도하지 않습니다. 불확실한 반영·cleanup 실패·poison 결과에도 같은 편집을 자동 재전송하지 않습니다.

## 공개 headless 입력

`createEditor`의 `getCreatedCellTextTarget(selector, range)`가 DOM·Surface 없이 현재 Native 논리 셀을 조회합니다. selector는 section·실제 표 생성 결과의 십진 u64 identity·row·column이고 range는 UTF-16 start/end입니다. 편집 가능한 Core 상태, trusted runtime admission, history protocol 2, 현재 Native 셀 ABI·canonical text/run·session/revision을 확인합니다.

반환 target은 Core 소유 branded 타입과 editor 내부 WeakMap에 연결됩니다. 텍스트·range·상태 token은 관측할 수 있으나 Native reference는 공개 target에 노출하지 않습니다. 복사·역직렬화·다른 editor의 target은 쓰기 권한이 아닙니다. `SPLICE_TEXT_COMMAND`는 기존 FIFO·update collector·mutate·History 결과 경로를 사용하고 Worker의 기존 셀 splice와 Native 거래를 재사용합니다. 실행 직전에 session/revision/scope/현재 text를 다시 대조합니다.

이력 이동·reload·dispose·상태 변경 뒤에는 이전 target을 재사용하지 않고 새 Native 조회로 발급받습니다. 원본 SelectionTarget의 생성 셀 거부와 HWPX `getInlineObjectInsertTarget`의 Native owner/FIFO 발급은 보존합니다. `openReadOnlyDocument.sdk`는 ObservationSdk 읽기 수명이며 내부 facade cast나 숨은 쓰기 메서드로 우회하지 않습니다. 공개 예제는 [HeadlessEditor](../apps/docs/docs/api/editor.md)의 생성 셀 입력 절에 있습니다.

## 현재 조회 비용과 성능 후속

현재 H5 target 발급은 Native currentReferences를 페이지 조회해 실제 scope/epoch/reference를 currentText와 대조합니다. 누락·중복 참조는 거부합니다. JS의 표·셀·페이지 응답 순회는 각각 선형이지만, 기존 Native currentReferences는 페이지마다 전체 참조 snapshot을 다시 구성합니다. 따라서 전체 target 발급 비용을 O(n)으로 주장하지 않습니다. reference 조회 한도는 1,048,576개이며 유사한 좌표나 임의 참조로 대체하지 않습니다.

이 반복 구성을 없애는 직접 Native 논리 셀 참조 조회를 별도 구현합니다. Native canonical logical-cell index와 현재 session/revision·epoch를 사용하고, JS에서 paragraph/ref를 합성하거나 기존 가드를 삭제하지 않습니다. 현재 실제 검증된 공개 SDK와 이 성능 후속 소스는 서로 다른 검증 대상입니다.

## 실제 확인과 남은 범위

정상 공개 Core에서 H5/HX의 한글·서로게이트 쌍 혼합 입력, 일곱 언어 글꼴, 밑줄·취소선·검정 글자색과 이어 입력한 일반 D의 상속을 저장 바이트로 확인했습니다. 별도 CFB 레코드/XML 조회 및 새 editor의 cold reopen으로 대조했고, undo/redo 전후 전체 저장 바이트도 일치했습니다. HX Native-owner 수식 삽입과 rich D 보존도 같은 공개 경로에서 확인했습니다.

이 결과는 과거 Noori 회귀·source mock·Native 집중 검사와 별도로 유지합니다. 이전 소스 준비와 통합 과정은 검증 이력이며 현재 지원 여부를 대신하지 않습니다. 전체 기능 완료·배포·npm 출시를 의미하지 않습니다.

별도로 기존 HWPX 셀(`sourceCell`)에서 16가지 차트와 수식을 두 구역에 삽입하는 34가지 요청을 실제 CLI와 공식 MCP에서 각각 확인했습니다. 두 구역이 같은 표·리스트 숫자 소유자를 사용해도 발급된 대상 구역과 셀에만 반영됐고, 서로게이트 쌍의 UTF-16 위치와 실제 LF를 보존했습니다. 각 요청의 CLI·MCP 저장 결과는 전체 바이트가 일치했습니다.

독립 raw 비교는 두 인터페이스의 출력 68개를 일반 실행과 Python 최적화 실행에서 각각 확인했습니다. 비대상 구역·셀과 선택 셀 바깥의 원문 보존, flat·중첩 OLE의 차트 XML 일치 및 기존 배포 산출물 289개 불변을 대조했습니다. 잘못된 텍스트·위치 기대값은 첫 출력에서 두 실행 모드 모두 거부됐으며, 68개 전부의 음성 검사를 했다는 뜻은 아닙니다.

후속 정상 패키지에서는 기존 셀 34가지와 생성 대기 셀 34가지를 같은 빌드의 선언된 CLI·MCP 진입점에서 각각 실행했습니다. 별도 `--wasm` 없이 번들 엔진을 사용한 CLI 68개·MCP 68개가 통과했고, 두 인터페이스의 저장 바이트가 일치했습니다. 출력 136개는 독립 raw 비교의 일반·최적화 실행에서 각각 확인했습니다. 음성 검사는 각 그룹 첫 출력의 잘못된 전체 텍스트·UTF-16 기대값에 한정합니다.

생성 대기 셀 34가지의 열린 세션 이력은 별도 실제 Native 어댑터 검사에서 확인했습니다. 세 번의 거래를 모두 취소하면 초기 저장 바이트로 돌아가고, 다시 실행하면 CLI 출력과 일치했습니다. 새 세션의 anchored text는 개체 마커와 LF를 보존했습니다. 이 쓰기·저장 결과와 별개로 CLI 읽기 투영에서 LF·제어 문자가 빠지는 문제는 남아 있습니다.

같은 정상 SDK의 실제 Canvas에서는 H5/HX 생성 셀에 한글·이모지와 일반 문자를 입력하고 취소·다시 실행·저장·독립 raw 비교·새 화면 재열기를 확인했습니다. HX의 앞선 화면 컨텍스트 소실은 실패 증거로 보존했으며 원인 해결을 주장하지 않습니다. 후속 HX 관측은 textarea 입력 이벤트 경로이고 키 단축키·실제 OS IME·긴 연속 입력의 증거가 아닙니다. 선택 범위 서식 버튼도 이 GUI 검사에서는 비활성 상태였습니다.

별도 연속 입력 검사에서는 H5/HX 각각 156개의 신뢰 문자 입력 이벤트를 보냈습니다. 즉시 Ctrl/Meta 취소·다시 실행·반복 취소 뒤 재입력과 다른 셀 입력을 확인했고, 저장 셀 내용이 독립 CFB/ZIP 비교와 일치했습니다. Ctrl 반복 이벤트는 관측했으나 Meta 반복은 전송 기록과 세 번 취소된 결과만 확인했습니다. Meta DOM 이벤트 및 복사 이벤트·결과는 미확인으로 남기며, 이 검사는 실제 OS IME나 이력 한도 초과 검사가 아닙니다.

남은 작업은 실제 OS IME·개행, Meta 반복·복사의 이벤트 관측, 위 직접 참조 성능 후속, 보존된 범위의 Native styled-range 연산 및 CLI 읽기 투영 수정입니다. `insertion.character`는 새 텍스트에만 적용합니다. 기존 범위서식을 같은 문자열의 삭제·재삽입으로 위장하지 않습니다. 모든 SDK 플랫폼은 같은 Core·Native 모델을 사용해야 하며 플랫폼별 실제 검증은 각각 구분합니다. 공개 데모는 기존 e461 기준이며 이 후보의 배포나 npm 게시를 뜻하지 않습니다.

소스 회귀는 다음 명령으로 확인합니다. 이는 통제 응답·타입 증거이며 실제 엔진·공개 패키지·GUI 실행과 합산하지 않습니다.

```sh
bun test --no-install packages/core/tests/commands/created-cell-headless-text.test.ts packages/core/tests/commands/inline-object-owner-query.test.ts
node --test --test-concurrency=1 tools/tests/created-cell-headless-admission.test.mjs
bunx --no-install tsc -p tools/tests/tsconfig.created-cell-headless.json
```

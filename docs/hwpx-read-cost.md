# HWPX XML·표 조회의 반복 비용

이 계약은 `50455a8b4` 이후 로컬 읽기 후보를 다룬다. [웹 헤더 공유](web-hwpx-open-performance.md)와 [본문 관측 Scope](hwpx-read-observation-scope.md)를 유지하며, XML 검증을 줄이거나 표시 필드를 생략하는 빠른 모드를 추가하지 않는다.

## 확인한 비용과 변경

Noori HWPX의 이전 Node/WASM 읽기는 열기 약 16ms와 모델 수집 약 11ms였다. 별도의 진단용 작은 WASM으로 Session.open을 나누면 structure 검증 약 7.07ms, tree/content 파싱 2.50ms, location scanner 2.76ms였다. 작은 진단 모듈·JS phase import를 사용한 값으로 제품 전체 시간을 재구성하지 않는다. 모델의 실제 getter 계측에서는 tableBorderSources가 Native 약 5.91ms였고, 별도 phase probe에서는 header tree 4.55ms와 readTrees 1.07ms가 주 비용이었다.

- `xml/attribute_ascii.zig`: UTF-8 속성값의 일반 ASCII 연속 구간을 한 번에 소비한다. 매번 같은 문자를 peek/nextPart/next로 재확인하던 비용을 줄인다. 기존 parser의 선행 peek·닫는 따옴표·참조 예산·최종 cursor commit은 유지한다. ASCII 1바이트=1문자 구간만 처리하고 input 문자 예산과 token 바이트 예산을 함께 지킨다. CR·참조·따옴표·`<`·비ASCII·잘못된 XML 제어문자는 기존 경로가 처리한다. UTF-16과 정규화 규칙은 바꾸지 않는다.
- `xml/namespaces.zig`: 일반 속성 첫 8개는 같은 expanded-name 동등성으로 비교하고, 9번째부터 앞선 8개를 기존 hash map에 넣어 이어간다. 선언/QName/element binding 순서와 실패 rollback은 그대로다. 작은 배열 비교는 최대 8개로 제한되므로 무제한 이중 순회를 추가하지 않는다. 큰 태그는 기존 map 경로를 사용한다.
- 표 조회는 [기존 조회 모듈](../src/hwpx/table_border_sources.zig)을 따른다. 같은 요청의 원본 header tree를 재사용하고 선택한 style/edge의 시작 태그를 한 번만 해석한다. 현재 셀 배경 intent는 기존 writer 경로가 계속 소유한다. DTO 문자열은 호출자 소유이며 영구 편집 캐시를 추가하지 않는다.

엔진 전체를 최악 조건까지 O(n)으로 바꿨다는 주장은 아니다. 새 ASCII 순회는 선형이며 작은 집합의 비교 상수는 고정돼 있다. 기존 map의 일반적인 조회 비용과 전체 XML/모델 알고리즘의 비용은 구분한다.

## 실제 WASM에서 발견하고 고친 할당자 식별 문제

초기 65100f 후보는 주요 본문 19항목 검사를 통과했지만 단건 tableBorderSources가 빈 inventory를 반환하거나 scope에서 memory access out of bounds로 실패했다. CLI가 관측 실패를 경고로 보존해 `[알 수 없는 내용]`을 추가했으므로 정상 출력 동치가 아니었다. 해당 후보의 약 18ms 읽기 결과는 채택하지 않는다. 초기 `baseline-*`/`candidate-*` 및 `read-comparison.json`은 실패 자료로 보존한다.

새 재사용 분기가 비교하던 WASM 할당자의 `.ptr`는 `undefined`였다. 상태 없는 allocator의 callback이 context를 무시하는 것과 그 값을 identity로 읽어 비교하는 것은 다르다. `wasm/allocator.zig`는 비교 가능한 정적 byte 주소를 사용하도록 바꿨으며, allocator 동작·크기 class·vtable의 할당/해제 구현은 그대로다. 나머지 후보 코드가 같은 65100f/08e55b 빌드에서 동일 회귀가 2실패→2성공으로 바뀌었다.

표 조회는 컨텍스트가 있을 때만 allocator identity를 검사하고 vtable을 먼저 확인한다. 기존 비-Scope Zig 조회에서는 context를 사용하지 않는 stateless allocator의 undefined ptr를 새로 읽지 않는다. 별도 합성 회귀로 보존한다. 내부 opt-in Scope에서 임의 custom allocator의 undefined context까지 안전하게 identity 비교한다고 보장하지 않는다. 현재 WASM 제품은 정의된 identity wrapper를 사용한다.

전용 실제 WASM 회귀는 scope 중 변경 명령이 거부되는 것까지 확인하므로 준비 실패 후 fallback만 통과한 것으로 scope 재사용을 증명하지 않는다. 단건 표 inventory와 전체 AI 모델·text·Markdown·warnings, 6파일의 원본/편집 저장 ZIP 바이트를 기존 엔진과 비교한다. 경고와 coverage까지 비교하여 관측 누락으로 빨라진 후보를 배제한다.

## XML·표 최적화 단계의 실측

최종 표준 `zig build -Doptimize=ReleaseSafe` 산출물은 6,988,059바이트, SHA256 `965d67b73e78db2ef1378bcd30761e0c513af291e15920a7cd56df1c3b445bdb`다. 외부 진단 import가 없고 공개 export 목록은 기준 38c4와 같다. 사용자 WIP를 제외한 격리 소스에서 빌드했다.

같은 Node 24.20.0 프로세스 방식의 Noori 읽기를 기준/후보 순서로 두 집단씩 실행했다. 집단별 first를 제외한 6회, 구현별 총 12회 중앙값이다. 컴파일된 Module 재사용·새 Instance·입력/WASM 복사·입력 SHA·문서 열기·전체 모델 수집·text 렌더를 포함하고, 초기 import·디스크 읽기·사후 검증은 제외한다.

| HWPX 구간 | 이전 38c4 | 최종 후보 |
| --- | ---: | ---: |
| open + 전체 본문 반환 | 27.13ms | 22.68ms |
| open | 16.02ms | 13.88ms |
| 모델 수집 | 10.90ms | 8.75ms |

전체 읽기는 약 16.4% 감소했다. 개별 중앙값의 합으로 전체 시간을 재구성하지 않는다. 모든 hwpjs text 출력 56개가 형식별 바이트 해시까지 같았고, 양쪽 구현 총 112개 출력에서 본문 19항목과 cleanup을 확인했다. 최종 HWPX 집단은 warnings가 없어야 측정 성공으로 계산한다. 같은 집단의 rhwp 0.9.0 HWPX warm 중앙값은 약 4.95ms여서 여전히 약 4.6배의 차이가 있다. 네이티브 CLI 전체 실행 시간이나 웹 렌더링 비교는 아니며 내부 작업량·Instance 수명이 다르다.

실제 Vanilla UI에서는 같은 SDK/Worker와 각각의 WASM을 private localhost 서버에 연결해 Noori HWPX를 3회씩 교대 업로드했다. Native 빌드·설치·Node 측정과 분리했다.

| 브라우저 3회 중앙값 | 이전 38c4 | 최종 후보 |
| --- | ---: | ---: |
| Worker load 왕복 | 121.7ms | 102.0ms |
| enable 왕복 | 43.4ms | 39.2ms |
| file input부터 연결된 Canvas 첫 텍스트 | 204.8ms | 184.1ms |

첫 텍스트 기준 약 10% 감소다. 엔진/fixture 네트워크 다운로드·전체 페이지와 이미지 최종 표시·rhwp 웹과의 비교를 뜻하지 않는다. 6회 모두 native Worker 메시지·입력/서식 활성화·page/console error 부재를 확인했다. 선택 전 같은 뷰포트 스크린샷 6개는 PNG 바이트까지 같았다. private runtime에서는 정확한 Worker SHA만 연결했고 digest 검사를 제거하지 않았다. 기존 공개 UI 세대에서 Native 차이를 대조한 것이며 모든 최신 UI 기능의 성능 검사는 아니다.

## 검증 범위와 기록

- `test-hwpx-read-cost`: 합성 차등·예산·인코딩·오류 순서·반환 소유권·allocation failure·allocator fallback 22개 통과.
- ASCII 차등 검사: Debug/ReleaseSafe 각각 10개 통과, 각 모드의 ASCII 행렬 10,240건 대조. 기존 XML/namespace 검사는 Debug 42개(신규 namespace 2사례 추가 전), 최종 ReleaseSafe 44개 통과했다.
- 실제 최종 WASM 회귀 3개 통과: active Scope의 cold/warm/repeated 단건 표 조회, 전체 모델·text·Markdown·진단 동치, 6문서 원본/편집 저장 바이트 동치.
- 9개 실파일의 전체 화면 응답 동치와 6파일의 편집·undo/redo·저장·재열기 검사가 통과했다. HWP의 세션별 숫자 scope 토큰만 정규화하고 HWPX는 값 전체를 비교했다.
- 최종 SDK strict declaration 빌드와 설치 파일 126개 바이트 검증, 설치된 CLI·stdio MCP 16개 도구 E2E 두 진입점이 통과했다.

전체 저장소 테스트·전체 fixture 코퍼스·모든 조판의 완료 검사는 아니다. Source/ABI 변경과 검증 결과를 로컬 후보로 구분하며 npm 게시·main 푸시·데모 배포는 하지 않았다.

원자료는 `zig-out/verification/hwpx-read-r3/`다. 최종 근거는 `read-cost-final-tests.log`, `standard-build.log`, `standard-full-native-regression.log`, `standard-read-comparison.json`, `accepted-summary.json`, `runtime-standard.json`, `edit-standard.json`, `consumer-standard.json`, `installed-e2e.log`, `browser/e2e-final/`이다. `runtime-final` 측정은 SDK 빌드와 겹쳤으므로 기능 동치 근거만 사용하고 속도 집계에서 제외했다. 잘못된 작업 디렉터리에서 시작한 진단/allocator 빌드와 Source 미반영 중단 실행도 최종 후보에서 제외한다.


## 원본 헤더 인덱스의 세션 소유

후속 후보는 최초 구조 검사에서 헤더 XML을 검증하면서 동일 visitor 순회로 원본 Tree도 만든다. 기존에는 이 검증 후 첫 표·서식 조회에서 같은 헤더를 다시 decode/parse했다. `document_xml.Inspector`가 metadata 판독을 소유하고 `xml_part_tree.parseInspectedHeader`가 Inspector와 기존 Builder를 합성한다. 별도 XML 파서나 영구 current-value cache를 추가하지 않는다. `document_structure.inspect`는 기존 report-only 경로를 유지한다.

- Inspector가 먼저 실행된다. 일반적인 잘못된 루트는 Builder를 건너뛰고 XML 전체 검증 후 분류하므로, 후반 XML 오류와 `InvalidHeaderRoot`의 기존 우선순위가 유지된다. 잘못된 `secCnt`와 미지원 namespace profile 오류도 기존 시점에 반환한다.
- Tree는 자신의 owned source에서 생성한다. source span과 local-name은 해당 버퍼를, URI는 intern 복사를 참조한다. Tree와 metadata version 문자열은 독립 소유이며, 후속 spine/section 실패와 allocation failure에서 각각 해제한다. node 예산은 구조 XML의 `max_elements`에 맞춘다.
- Session이 `original_header`를 소유하고 종료 시 해제한다. `header_read_context`는 Native-owned trust와 원본 source ptr/len 일치가 모두 있을 때만 빌린다. borrowed Tree를 Context의 owned 슬롯에 넣지 않는다. raw/untrusted Session과 source 교체는 기존 재파싱 경로다. 기존 serial/source/options stale 검사는 유지한다.
- 원본 인덱스는 원본 자원만 설명한다. 편집 intent와 formatting batch의 현재 헤더는 기존 `currentHeader` 경로가 계산한다. checkpoint는 편집값만 소유하며 원본 Tree를 복제하거나 해제하지 않는다.

헤더 크기와 노드 수에 비례하는 인덱스를 Session 수명 동안 유지하는 메모리 비용이 있다. 값 변경 후 같은 캐시를 갱신하는 설계는 아니다. 이번 변경은 반복 전체 파싱을 없앤 것이며 엔진 전체의 최악 시간 복잡도를 O(n)으로 입증한 결과는 아니다. 리뷰에서 기존 Builder의 `internUri`가 요소마다 URI 전체를 다시 해싱하여, 길이 L인 URI를 N개 요소가 공유할 때 O(N×L) 비용이 생기는 것을 찾았다. Noori에 확장 요소 1만 개를 추가한 실제 WASM 입력에서 최초 capture 후보는 URI 64→4,000바이트 변경 시 open 중앙값이 17.34→31.33ms로 늘었다. 직전 엔진은 15.23→15.39ms였다. 이 비용을 헤더 open에 새로 연결한 채 두지 않도록 namespace binding의 파싱 수명 식별자를 도입했다. Builder는 같은 binding의 URI를 숫자-key map으로 재사용하고, 새 binding에만 기존 URI 문자열 interning을 적용한다. 주소만 비교하지 않으므로 scope 종료 후 allocator 주소 재사용·재선언을 동일 namespace로 오인하지 않는다. 빈 URI와 예약 xml identity는 별도로 유지하며, 기존 ExpandedName·attribute 중복 판정은 바꾸지 않는다.


최종 WASM에서 같은 확장 요소 1만 개의 URI 64/4,000바이트 open은 17.50/17.28ms였다. 동일 집단에서 capture-only 후보는 17.81/32.13ms, 직전 엔진은 15.72/15.81ms였다. 반복 URI 길이에 따른 추가 비용은 제거됐지만 인덱스를 보관하지 않는 직전 raw open보다 약 1.5~1.8ms의 생성 비용은 남는다. 세 엔진 모두 저장 결과가 각 입력 ZIP과 같았다.

### 후속 후보 실측과 검증

최종 ReleaseSafe 표준 빌드는 6,993,172바이트이며 WASM SHA256은 `2fb2942b972249d543f798d2f8e3b5ec343ea25c99c951a5ede81a36b534ab30`다. 기준은 직전 965d67 후보이며 import가 없고 공개 export 목록은 동일하다. Node 24.20.0에서 기준/후보/후보/기준 순으로 같은 방식의 집단을 실행하고, 집단별 첫 회를 제외해 구현별 12회의 중앙값을 비교했다. 원본/WASM/JS pins와 전체 text 해시, warnings 부재도 확인했다.

| Noori HWPX | 직전 후보 | 후속 후보 |
| --- | ---: | ---: |
| open + 전체 모델 + text | 23.80ms | 19.92ms |
| open | 14.49ms | 14.36ms |
| 모델 수집 | 9.17ms | 5.55ms |

전체 약 16.3%, 모델 수집 약 39.5% 감소다. 개별 중앙값을 더해 전체를 재구성하지 않는다. 같은 후보 집단의 rhwp 0.9.0 HWPX text 읽기는 약 4.95ms로, 차이는 여전히 약 4.0배다. CLI 전체 프로세스 시작 시간이나 rhwp 웹 UI의 비교는 아니다.

실제 Vanilla UI에서 동일 Worker/UI와 각각의 WASM을 사용해 Noori를 3회씩 교대 업로드했다. Worker load 중앙값은 103.1→101.4ms, enable은 40.8→37.5ms, 연결된 Canvas 첫 텍스트는 179.1→179.9ms였다. 첫 회 편차가 크며 이번 결과에서 브라우저 체감 개선은 확정하지 않는다. 6회 모두 실제 메시지·본문 열기·caret의 입력/서식 활성화를 확인했고, 선택 전 스크린샷 6개는 PNG 바이트까지 같았다. 전용 브라우저와 서버는 종료했다.

합성 capture 검사는 최종 소스의 Debug/ReleaseSafe 각 16개가 통과했다. namespace identity 검사는 두 모드 각 10개, 최종 기존 header-context 12개·XML namespace/document 29개·read-cost 22개도 통과했다. UTF-16/namespace/metadata와 tree의 독립 수명, 오류 우선순위, byte/attribute/node/XML 예산, raw source의 제자리 변경과 교체 fallback, stale fences, parse/structure/Session open의 전체 allocation-failure sweep을 포함한다. 실제 WASM 회귀 3개는 cold/warm/repeated 표 inventory, 전체 AI 모델·text·Markdown·진단 동치와 6파일 원본/편집 저장 바이트 동치를 확인한다. 9개 문서 전체 runtime 응답과 6문서 서식 편집/undo/redo/재열기 검사도 통과했다.

격리 SDK의 strict declaration 빌드, 설치된 파일 126개 바이트 비교, CLI 생성/조회/편집/변환과 stdio MCP 16개 도구 E2E도 통과했다. 전체 저장소·모든 fixture·조판 완성 검사는 아니다. 공개 npm/데모/문서는 배포하지 않았다. 재현 진입점은 [개발·검증 명령](development-commands.md#hwpx-original-header-capture)이 소유한다.

최종 근거는 `zig-out/verification/hwpx-read-r4/`의 `indexed-build.log`, `indexed-capture-debug.log`, `indexed-capture-safe.log`, `namespace-debug.log`, `namespace-safe.log`, `indexed-native-regression.log`, `runtime-indexed.json`, `edit-indexed.json`, `accepted-indexed-summary.json`, `namespace-indexed.json`, `consumer-indexed.json`, `installed-e2e-indexed.log`, `source-pins-final.json`, `browser/e2e-indexed/`이다. 초기 capture-only b7 후보와 19.05ms 측정은 중간 단계로 보존하며 최종 후보 수치로 사용하지 않는다. URI 65,536바이트 예제는 기준 엔진부터 LimitExceeded여서 비교에서 제외했고, 잘못 생성된 최초 ZIP과 격리 소스에서 probe 누락으로 실패한 명령도 제품 결과에 합산하지 않는다.

## 편집하지 않은 현재 헤더의 복제 제거

글꼴 조회는 원본에 서식 편집이 없어도 `replacementWithFonts`의 검증·canonical 검사·복사·다중 트리 파싱을 수행했다. 빈 intent writer는 원본 바이트를 그대로 돌려주므로, Native-owned 원본이 있는 경우 같은 결과의 비소유 view를 반환하도록 했다. API·파일 포맷이나 writer의 편집 처리를 변경하지 않는다.

`header_read_context`의 `trustedOriginal`이 원본 존재·Native trust·source ptr/len 결합을 한 곳에서 판정한다. `currentHeader`는 여기에 세 resource intent 목록의 길이 0, `formatting_batch == null`, 기존 owned slot 부재를 함께 요구한다. inventory 조회를 먼저 수행해 duplicate/missing/invalid ID 오류가 byte limit보다 먼저 발생하는 기존 순서를 지킨다. 이어 원본 header 길이에 현재 byte limit을 적용한다. 비소유 view는 기존 generated-header parser와 같이 item_index를 0으로 반환하지만 Session 원본의 실제 manifest index는 바꾸지 않는다. source/elements/URI 소유권은 Session에 있고 Context는 이 view를 해제하지 않는다.

raw/untrusted·원본 부재·source 결합 불일치·사실상 no-op을 포함한 intent 하나라도 존재·활성 formatting batch는 기존 writer 경로를 유지한다. 기존 stale 검사는 모든 분기에 선행한다. XML을 생략해서 malformed inventory를 성공으로 바꾸거나 현재 편집값을 원본으로 되돌리는 빠른 모드는 아니다.

### 실측

최종 표준 ReleaseSafe WASM은 6,993,456바이트, SHA256 `5dbdcb394ea7bc2a95992a2c6a8135671952910d71772811073bf512539cb0af`이며 공개 export가 유지되고 진단 import가 없다. 직전 2fb 후보와 같은 Node 24.20.0 집단 방식의 전체 Noori HWPX text 읽기는 19.36→19.45ms로 이번 변경에서 개선됐다고 계산하지 않는다.

별도 fresh document의 같은 observation scope에서 fontFaces와 fontFaceMetadata를 함께 조회하면 첫 회를 제외한 구현별 6회 중앙값이 22.76→7.39ms로 약 67.5% 감소했다. open/compile을 제외하고 scope의 문단 준비와 두 DTO 반환을 포함한다. 빈 결과로 빨라지는 것을 배제하도록 전체 DTO와 비어 있지 않은 inventory를 기준 엔진과 대조했다.

실제 Vanilla UI의 동일 SDK/Worker와 두 WASM을 private localhost에 연결해 Noori를 3회씩 교대 업로드했다. Native 빌드·테스트·설치·Node 측정과 분리한 최종 집단이다.

| 브라우저 3회 중앙값 | 직전 후보 | 새 후보 |
| --- | ---: | ---: |
| Worker load 왕복 | 99.2ms | 82.0ms |
| enable 왕복 | 38.8ms | 36.1ms |
| file input부터 연결된 Canvas 첫 텍스트 | 176.1ms | 151.8ms |

첫 텍스트 기준 약 13.8% 감소다. 3회 소표본으로 전체 문서/그림 렌더링이나 네트워크 다운로드, 모든 문서·프레임워크의 개선을 증명하지 않는다. Native Worker 메시지, caret의 입력/서식 활성화, page/console error 부재를 확인했고 선택 전 스크린샷 6개가 PNG 바이트까지 같다. 고정한 기존 공개 UI 세대에서 Native 차이를 측정한 것이며 최신 UI 전체의 속도 보장은 아니다. 전용 브라우저와 서버는 종료했다.

### 검증과 제한

새 집중 검사는 Debug/ReleaseSafe 각 9개(대표 계약 7개와 import harness)를 통과했다. canonical writer를 비교기로 삼아 source/elements/URI alias와 비소유 수명, 원본 manifest index와 반환 index, 비정규·참조·부재·불일치 count, UTF-8 BOM/UTF-16LE/BE, 오류 우선순위와 정확한 byte 경계, fallback·stale·allocation failure·warm allocation-free 경로를 검사한다. 기존 header-context 12개·header-capture 16개도 새 소스에서 통과했다.

실제 WASM 회귀 3개, 9개 문서 전체 runtime 응답 동치, 6문서 서식 편집/undo/redo/저장/재열기 검사를 통과했다. SDK strict declaration 빌드와 설치 파일 126개 바이트 비교, 설치 CLI·stdio MCP 16개 도구의 E2E 두 진입점도 통과했다. 전체 저장소 테스트나 모든 조판의 완료 검사는 아니다. npm 게시·main 푸시·데모 배포는 하지 않았다.

원자료는 `zig-out/verification/hwpx-read-r5/`의 `build.log`, `source-pins.json`, `unedited-debug.log`, `unedited-safe.log`, `header-read-tests.log`, `header-capture-tests.log`, `native-regression.log`, `runtime-standard.json`, `edit-standard.json`, `performance-summary.json`, `font-read-benchmark.json`, `consumer-standard.json`, `installed-e2e.log`, `browser/e2e-clean/`이다. 처음 `browser/e2e-final/`은 Native 기능 검사와 시간이 겹쳐 기능 근거만 사용하며 속도 집계에서 제외한다. 실행 명령은 [개발·검증 명령](development-commands.md#hwpx-unedited-current-header)이 소유한다.

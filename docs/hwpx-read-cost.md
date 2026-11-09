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

## 최종 실측

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

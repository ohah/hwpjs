# CLI·MCP의 WASM 준비 재사용

## 확인한 원인

기존 CLI 공통 엔진은 요청마다 WASM 바이트를 소유한 뒤 형식별 SDK에 전달했습니다. SDK는 `WebAssembly.compile(bytes)`와 `instantiate(module, {})`를 호출했습니다. MCP 서버가 상주하고 있어도 `read_document → runCLI → engine.read → openDocument`가 매번 이 경로를 거쳤습니다. 같은 프로세스라는 사실만으로 애플리케이션의 컴파일 결과가 재사용되는 구조는 아니었습니다.

Node 24.20.0과 같은 Noori 원본·WASM에서 후속 8회의 계측 중앙값은 아래와 같습니다. 래퍼를 붙인 진단 경계이며 CLI/MCP 전체 시간과 합산하지 않습니다.

| 경계 | HWPX | HWP5 |
| --- | ---: | ---: |
| compile API | 4.920ms | 4.279ms |
| instantiate API | 0.227ms | 0.223ms |
| WASM 바이트의 JS 스냅샷 | 0.122ms | 0.116ms |
| 문서 바이트의 JS 스냅샷 | 0.012ms | 0.011ms |
| JS→WASM set | 0.005ms | 0.004ms |
| Native open 전체 | 12.157ms | 0.520ms |

이는 반복 compile **호출**의 비용입니다. V8 내부에서 매번 완전한 cold compile을 했다는 증거는 아닙니다. Native open의 내부 복사·압축 해제·파싱은 위 진단에서 분해하지 않았습니다. 확인한 JS 복사를 제거해야 큰 지연이 해결된다는 근거는 없으며, [열기 중 XML 재사용](hwpx-open-content-reuse.md)과 [관측 재사용](hwpx-read-observation-scope.md)은 별도 비용을 다룹니다.

## 책임과 수명

`packages/cli/src/engine.ts`는 기존과 같이 문서·WASM을 **첫 await 전에** 각각 복사하고 원문 SHA·형식을 검사합니다. 호출자의 가변 배열을 캐시 정체성이나 저장 원문으로 사용하지 않습니다.

`wasm-module.ts`는 이 private WASM 스냅샷과 컴파일된 Module 한 entry를 관리합니다. 첫 사용은 추가 해시 없이 바로 컴파일합니다. 같은 길이의 다음 입력부터 보관한 원본과 새 스냅샷의 SHA-256을 비교합니다. 보관한 쪽의 digest promise는 공유하고 새 입력은 매번 확인합니다. 파일명·URI·버퍼 객체 동일성을 키로 쓰지 않습니다. SHA-256 일치를 신뢰하며 별도 전체 바이트 재비교는 하지 않습니다.

같은 바이트의 요청은 아직 pending인 Module promise도 공유합니다. 새 SDK·WASM Instance·선형 메모리·문서·이력·해제 상태는 매번 생성하므로 문서 편집값의 SSOT를 공유하지 않습니다. ABI·문서 파싱 검사는 그대로 수행합니다. 임의의 다른 동시 miss까지 전역 병합하거나 엄격한 요청 순서의 LRU를 보장하지 않습니다.

보관할 WASM 원본은 최대 16MiB, entry는 하나입니다. 더 큰 입력은 기존 컴파일 경로로 처리하고 캐시는 비웁니다. 새 입력 거부 한도가 아닙니다. 진행 중 요청·활성 문서·컴파일된 기계어·GC 시점까지 포함한 프로세스 메모리 상한은 아닙니다.

컴파일 실패는 같은 오류를 전달하고 해당 entry만 비웁니다. 오래된 요청의 늦은 실패는 나중 entry를 지우지 않습니다. digest가 throw/reject하면 재사용만 포기하고 기존 컴파일로 돌아갑니다. helper의 `compileOwned`는 내부 소유권 이전 계약이며, 호출자가 계속 변경할 버퍼를 직접 전달하는 API가 아닙니다.

## 실제 성능과 남은 범위

근거는 `zig-out/verification/read-preparation-r1/`에 있습니다. 두 로컬 패키지는 같은 Native SHA256 `677b17cb24e98b47c08e2f15b6b652115d2459121f349d8f9d507b3af9d766b3`를 사용하며, 후보의 설치 전후 126개 파일을 바이트 단위로 확인했습니다. 공개 npm 게시본은 아닙니다.

실제 설치형 MCP를 형식·집단별 새 서버로 시작한 뒤, 준비/첫 읽기를 제외한 후속 16쌍을 교대 호출했습니다. 두 번째 집단은 서버 시작·문서·호출 순서도 반대로 했습니다. 프로토콜·파일 IO·해시·Native·모델·응답을 포함하며 계측 래퍼가 없습니다.

| 형식 | 첫 집단 이전→후보 | 두 번째 집단 이전→후보 |
| --- | ---: | ---: |
| Noori HWPX | 41.16→30.20ms | 33.60→29.95ms |
| Noori HWP5 | 15.51→8.32ms | 11.97→8.40ms |

전체 136회 응답 본문 SHA가 기존 CLI의 text와 일치했습니다. 집단 간 이전 값의 변동이 있어 첫 집단의 큰 차이를 고정 절감량이나 다른 문서의 보장으로 해석하지 않습니다. 원자료는 `mcp-paired/report.json`입니다. 서버 시작과 최초 읽기는 제거한 비용이 아니며 따로 보존했습니다.

단발 CLI는 새 프로세스마다 캐시가 비어 있어 이득을 주장하지 않습니다. 후속 8쌍에서 HWPX 중앙값은 text 90.87→90.61ms, Markdown 90.25→90.76ms였고, HWP5는 각각 73.14→74.30ms, 73.54→73.80ms였습니다. HWP5 paired 중앙값 약 0.78~0.95ms 증가는 원인을 확정하지 않았습니다. 원자료는 `cli-cold-comparison.json`입니다. 첫 벤치의 집계 범위 오류는 로그로 남겼고 성능 집계에서 제외했습니다.

새 프로세스의 Node 시작 비용, HWPX 파싱/모델 비용, WASM 파일 읽기·해시, Native 내부 복사와 JS↔WASM 경계 비용은 남습니다. 완전한 제로카피, 전체 플랫폼 SDK의 준비 비용 제거, 모든 CLI·문서의 속도 향상을 주장하지 않습니다.

## 검증 근거

- 작은 실제 WASM의 export 값·Module 정체성과 실패/지연 주입을 분리한 회귀는 `packages/cli/tests/wasm-module-cache.test.mjs`입니다. 동일/상이 바이트, 한 entry 퇴출, 16MiB 경계, 동시 pending, 늦은 실패, digest/compile 실패 후 복구를 확인합니다.
- `actual-adversarial/report.json`은 실제 Noori 두 형식의 동시 열기·편집/undo/close 격리, 호출 직후 입력 변경·detach, 같은 호출자 버퍼의 후속 변조, 실패 재시도와 SHA 거부 순서를 검사합니다. 컴파일 호출 3회와 서로 다른 선형 메모리의 Instance 14개를 관측했습니다. 3회에는 의도한 잘못된 WASM의 실패와 복구가 포함됩니다.
- 독립 정적 리뷰는 `cache-tests/independent-readonly-review-*.json`에 있으며 현재 내부 수명 계약에서 확인된 P1/P2는 없습니다. 정적 리뷰를 실제 실행이나 모든 엣지 케이스의 부재 증명으로 대체하지 않습니다.

같은 변경 소스의 CLI 전체 검사는 Node 24.20.0·기존 Native820·고정 Noori 입력에서 33파일/556 pass/0 fail/0 skip이었습니다. 새 회귀의 부모/하위 사례가 이 수치에 포함됩니다. strict 타입 검사와 선택 파일의 plain lint/format도 통과했습니다. typed lint는 실행 파일이 없는 환경 오류로 수행하지 못했으며 strict 타입 검사의 성공과 구분합니다. 로컬 설치 패키지의 CLI 생성·조회·편집·변환 및 stdio MCP 16개 도구 연결 검사도 두 진입점 모두 통과했습니다. 각각 `source-tests/RESULT.json`, `installed-e2e.log`가 근거입니다.

배포·npm 게시·자동 배포를 유발하는 main 푸시는 사용자 확인 후 수행합니다.

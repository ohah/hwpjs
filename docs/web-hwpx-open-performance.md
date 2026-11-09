# 웹 HWPX 열기의 서식 조회 병목

CLI/MCP의 [컴파일 준비 재사용](wasm-preparation.md)을 웹 편집기 전체 열기 성능으로 해석하지 않습니다. 웹의 Worker factory와 preview loader는 이미 페이지 안에서 컴파일된 Module을 공유합니다. 문서별 Worker·Instance·편집 상태는 새로 만듭니다.

## 현재 배포의 실제 브라우저

2026-11-09 현재 배포된 Vanilla 데모에서 Noori 두 형식을 같은 Chrome 세션으로 번갈아 3회씩 열었습니다. 파일 업로드 change 이벤트부터 측정하며 예제 파일 다운로드는 포함하지 않습니다. 페이지/엔진 자원은 이미 로드된 경로입니다. 문서명 일치와 enable 응답을 확인한 뒤 실제 연결된 Canvas의 첫 텍스트 그리기를 기록했습니다.

| 구간 중앙값 | noori.hwpx | noori.hwp |
| --- | ---: | ---: |
| Worker load 왕복 | 309.2ms | 23.8ms |
| Worker enable 왕복 | 45.7ms | 38.0ms |
| 입력부터 첫 텍스트 그리기 | 411.0ms | 115.9ms |

각 왕복은 Worker 내부 처리·응답 복사·전송·이벤트 전달을 포함합니다. 개별 중앙값을 더해 전체 시간을 재구성하지 않습니다. 첫 텍스트는 모든 페이지·이미지·글꼴이 최종 상태로 그려졌다는 완료 지표가 아닙니다. 현재 rhwp 웹을 같은 조건으로 다시 측정한 결과도 아닙니다.

문서 열기 구간의 main-thread compile 호출은 6회 모두 0이었습니다. 엔진 다운로드 ResourceTiming은 페이지 준비 때 이미 존재했습니다. 배포된 WASM을 별도로 받아 6,758,420바이트와 SHA256 `82031994b4b7f066c28c725495954eebc67bb25570869c06528ea328e0155ccc`를 확인했습니다. 최근 로컬 Native/CLI 수정이 이 배포에 반영됐다고 가정하지 않습니다.

근거는 `zig-out/verification/web-hwpx-open-r1/browser-summary.json`, `live-final-*.json`, `live.wasm`, live HTML/JS 사본입니다. 소유 Chrome은 종료했고 session 목록이 비었음을 확인했습니다. 사용자 브라우저나 서버는 종료하지 않았습니다.

## 웹 데이터 생성 경로의 비용

현재 root JS 소스에는 별도 사용자 WIP가 있습니다. 이 소스의 DOM-free `createReaderRuntime`을 Node 24.20.0에서 기존 WASM으로 실행해 Native export별 비용을 분해했습니다. 실제 브라우저/Canvas 계측과 별도 증거이며 clean 제품 빌드나 배포 완료를 뜻하지 않습니다.

기존 배포와 같은 820 WASM의 후속 3회 load 중앙값은 **312.9ms**, 그중 **헤더·폰트·문자서식 getter 17개 합이 228.4ms(약 73%)**였습니다. 최근 로컬 677 후보로 바꿔도 같은 경로는 315.0ms, 해당 그룹은 231.8ms였습니다. 최근 CLI/MCP 개선이 이 화면 경로의 주 비용을 없애지 않았다는 근거입니다.

| Native getter, load당 각 1회 | 820의 후속 중앙값 |
| --- | ---: |
| character_font_metrics | 32.6ms |
| character_strike_styles | 29.8ms |
| font_face_metadata | 24.1ms |
| font_faces | 23.9ms |

나머지 문자 모양·색·음영·효과·외곽선·글꼴 참조·문단 모양 등도 각 조회 안에서 비용을 냅니다. **같은 API를 실수로 수십 번 호출하는 것보다 서로 다른 API가 공통 준비를 반복하는 구조**가 이번 문서의 우선 병목입니다. JS `display-resource-cache`는 일부 API 결과를 보관하지만 첫 수집에서 API 사이의 원본 헤더 준비까지 공유하지 않습니다.

현재 소스의 대응 경로는 다음과 같습니다.

- `character_style_resources.displayShapesProjected`: package 검사·header resource 검사·header tree 생성·현재 intent 합성.
- `font_creation.list/metadata`: `replacementWithFonts` 또는 편집 배치의 replacement 준비 후 header tree 파싱과 글꼴 수집.
- `character_font_metrics.list`, `character_strike_styles.read`: ID 조회와 현재 폰트를 반영한 header replacement/tree 준비. 읽기 조회가 저장형 헤더 투영 작업을 거칩니다.

계측으로 확정한 것은 각 Native getter 안의 비용입니다. 그 안의 ZIP 해제·XML 파싱·속성 검색·현재값 합성·직렬화 각각의 시간을 분리하지 않았고 기존 바이너리와 현재 소스의 모든 명령어 대응도 증명하지 않았습니다. 228ms 전체를 순수 XML 파싱 시간이라고 부르지 않습니다.

문단별 canEdit·anchorText·characterRanges도 각각 65회 호출되지만 이번 사례의 합은 약 0.6ms였습니다. 미리보기 리더와 편집 세션의 이중 해석은 약 22~24ms였습니다. 이들 역시 중복 작업이지만 헤더 그룹보다 먼저 최적화해야 한다는 근거는 없습니다.

## 보존 확인과 측정 한계

Native facade 계측과 bare/forward controls의 전체 응답은 undefined·특수 숫자·typed bytes·객체·배열을 보존한 codec으로 비교했습니다. 두 WASM의 12개 응답은 같은 바이트 해시였고 본문·표·폰트 필드를 생략하지 않았습니다. 소스 411개·입력·WASM의 전후 해시도 같았습니다. 세부 함수 목록·호출 순서·인자·반환·시간은 `worker-profile/cohort-go/`에 있습니다.

초기 filename 접두사 판정, 이전 문서의 Canvas 그리기 포함, DOM 관측 시점 경합이 있던 probe와 별도 Node 실행이 겹친 자료는 보존하되 최종 집계에서 제외했습니다. Node의 유효 GO 구간과 브라우저의 최종 실측 구간은 분리했습니다. 검사용 래퍼의 비용이나 시스템 전체 무부하를 완전히 통제한 결과는 아닙니다.

## 동기 화면 투영의 임시 헤더 컨텍스트 — 로컬 구현

`header_read_context.Context`가 원본 package 검사, 원본 header resource inventory·Tree, 현재 서식 intent를 반영한 header Tree, 색상 프로필과 scalar 문자 모양을 lazy하게 공유합니다. `paragraph_read_scope.Scope`가 같은 수명 안에서 소유하며 `reader-runtime.hwpxDisplay`는 기존 `withReadObservations`를 통해 동기 화면 수집을 감쌉니다. 같은 요청의 서로 다른 getter가 공통 준비 결과를 재사용하며 별도의 집계 wire·문서 파서를 추가하지 않습니다.

편집 모델과 원본 XML은 계속 SSOT입니다. 원본 Tree와 현재 헤더 Tree를 구분하고, 글꼴 조회의 formatting batch 경로와 메트릭 조회의 canonical 경로도 구분합니다. batch 진행 중에는 공유 슬롯을 빌리지 않습니다. 현재 getter의 검증 순서를 유지하며 실패 결과는 캐시하지 않습니다. 반환 배열과 중첩 문자열은 기존처럼 호출자 소유입니다. scalar Shape 배열도 복사해 반환하므로 호출자가 수정하거나 Scope 종료 후 보관해도 임시 캐시를 소유하지 않습니다.

정확한 Session 주소·할당자·원본 버퍼의 주소와 길이·mutation serial·XML 예산이 맞아야 공유합니다. Session 복사 투영이나 다른 할당자는 자체 준비를 수행합니다. Native ABI는 Scope 중 편집·이력 변경을 거부하고 종료/문서 교체 전에 임시 값을 해제합니다. raw Zig 호출자의 추적되지 않는 필드 변경은 기존 읽기 수명 계약 밖입니다. Scope가 끝나면 Tree와 inventory를 모두 해제합니다. 영구 편집 캐시나 이전 문서의 값은 남기지 않습니다.

조회마다 헤더를 다시 준비하는 횟수를 줄인 변경입니다. 기존 모든 파서·서식 합성의 점근 복잡도를 선형으로 바꿨다는 주장은 아닙니다. 대신 한 요청 안에서 준비된 Tree를 잠시 보유하므로 재파싱 감소와 임시 메모리 수명의 교환이 있습니다.

## 후보 검증

2026-11-09 격리된 소스와 새 ReleaseSafe WASM(SHA256 `38c4dd02eafacefb89318b46c001f787716c997cf15f660e66d44a92b08aecc0`)으로 검사했습니다. 사용자 작업 중인 세로 정렬 변경을 이 후보에 포함하지 않았습니다.

- `test-read-performance`: 문단 읽기·헤더 컨텍스트 집중 검사 23개 통과. 필드 부재·알 수 없는 값·희소 ID·조회 순서·오류 지연·반환값 독립성·소유자/할당자·stale 검사·부분 할당 해제·편집 후 새 Scope를 포함합니다.
- JS 선택 Scope 검사 11개 통과. 구형 ABI fallback·예외 종료·비동기 callback 거부를 포함합니다.
- Noori HWP/HWPX, charshape, facename, parashape, shapepict-scaled, hyperlink, table, aligns 9개 실파일에서 기존 677/새 Native 및 scoped/unscoped의 전체 load 응답이 같았습니다. HWP의 세션별 `scope` 문자열 토큰만 일관된 순번으로 정규화했고 그 외 값과 typed bytes는 deep 비교했습니다. enable 응답의 정상 여부도 확인했습니다.
- HWPX 6개 실파일에서 서식 getter 12종의 scoped/unscoped 동치, 텍스트·글자 서식 편집, undo/redo, 저장 바이트의 복원과 재열기를 확인했습니다. Scope 중 편집·undo/redo·이력 설정 거부와 예외 후 후속 조회도 검사했습니다.

같은 새 바이너리·같은 격리 소스에서 Scope만 달리해 Noori HWPX를 번갈아 읽었습니다. 컴파일과 디스크 읽기를 제외한 DOM-free load의 후속 5회 중앙값은 **345.07ms → 125.10ms(약 64% 감소)**였습니다. 실제 브라우저 첫 화면 시간·rhwp와의 동일 조건 비교 결과가 아닙니다.

초기 할당 실패 검사는 선택적 in-place resize/remap 성공 여부에 따라 할당 횟수가 달라져 실패했습니다. 해당 선택 연산을 비활성화해 할당 인덱스를 고정한 뒤 실패 주입·누수 검사가 통과했습니다. 넓은 `header ` 필터 실행에서 격리 소스에 없는 실파일 때문에 실패한 검사는 집중 23개 통과에 포함하지 않습니다. 재현 중 잘못 지정한 HWP 형식 이름과 동적 scope 토큰 차이도 최종 비교에서 바로잡았습니다.

독립 리뷰에서 직접 Zig `font_creation.ensure`가 active Scope 중 새 글꼴 intent를 추가할 수 있는 경로를 찾았습니다. 수정 전 회귀 검사는 거부 대신 새 ID 10이 반환되어 실패했습니다. 현재는 정확한 Session의 읽기 수명 중 새 글꼴 추가를 거부하며, 기존 글꼴 ID 조회와 Scope 종료 후 추가·새 Scope 관측은 허용합니다. 웹 ABI의 기존 변경 가드와 별개인 직접 호출 경로의 보완입니다.

전체 저장소 검사·전체 fixture 코퍼스 통과를 주장하지 않습니다. 별도 사용자 WIP와 보호된 검사 파일을 제외한 격리 후보에서 이 변경의 집중 검사와 실제 WASM 빌드를 수행했습니다.

원자료는 `zig-out/verification/web-header-reuse-r1/`의 `final-guard-native-tests.log`, `js-scope-tests.log`, `comparison-guard-final.json`, `edit-isolation-guard-final.json`에 있습니다. npm 게시·main 푸시·배포 산출물 교체는 수행하지 않았습니다.

## 최종 후보의 실제 Vanilla Canvas 대조

같은 기존 UI·SDK 세대와 최종 새 WASM을 격리된 localhost 서버 두 곳에 연결했습니다. Worker의 `hwpxDisplay` Scope 사용 여부만 다르며, SDK의 Worker digest 검사를 제거하지 않고 각 후보 Worker의 정확한 SHA를 private runtime에 연결했습니다. 실제 native Worker 메시지와 검증 경로를 유지했습니다. 배포된 Tailscale 서버나 공개 파일을 바꾸지 않았습니다.

같은 소유 Chrome에서 매번 새 페이지를 열어 Noori HWPX 파일을 실제 file input으로 업로드했습니다. OFF/ON을 3회 교대했고 메인 프로세스의 Native 빌드·Node 성능 측정과 겹치지 않게 실행했습니다. 각 경로는 같은 최종 WASM SHA를 사용했습니다.

| 3회 중앙값 | Scope OFF | Scope ON |
| --- | ---: | ---: |
| Worker load 왕복 | 318.1ms | 122.5ms |
| Worker enable 왕복 | 44.2ms | 43.8ms |
| file input 변경부터 연결된 Canvas 첫 텍스트 | 402.9ms | 202.5ms |

첫 텍스트 기준 약 50%, Worker load 기준 약 61% 감소입니다. 네트워크를 통한 엔진/fixture 다운로드·완전한 cold start·모든 페이지와 이미지의 최종 렌더링 시간을 뜻하지 않습니다. 문서 열림과 첫 텍스트 표시 이후 실제 마우스로 Canvas 텍스트를 눌러 caret 입력란과 굵게 도구가 활성화되는 것까지 6회 모두 확인했습니다. 브라우저 텍스트 삽입·편집·저장·재열기를 전부 수행한 증거는 아니며, 그 작업은 위 Native SDK 실물 검사와 구분합니다. 6회 모두 page error와 console 메시지가 없었고, 선택 전 동일 뷰포트의 스크린샷 6개는 PNG 바이트가 정확히 같았습니다. 모든 페이지 조판 동치를 검사했다는 의미는 아닙니다.

초기 하네스는 숨겨진 file input의 visible 대기에서 멈췄습니다. 다음 시도는 문서를 열었지만 아직 선택하지 않은 상태에서 입력란 활성화를 요구해 실패했습니다. 두 시도는 제품 회귀나 유효한 성능 코호트로 계산하지 않았습니다. DOM 존재 대기와 실제 Canvas 클릭으로 조건을 바로잡은 최종 코호트만 집계했습니다.

근거는 `browser/e2e-final-r2/summary.json`, 각 run의 state·snapshot·console·errors·스크린샷과 해당 서버/Worker/WASM 해시 기록입니다. 검사 전용 브라우저와 private 서버는 종료하고 사용자 서버는 보존합니다.

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

## 다음 수정의 경계 — 아직 미구현

먼저 한 번의 동기 화면 투영 안에서 원본 package/header 해석과 현재 헤더 준비를 lazy하게 공유하는 Native 읽기 컨텍스트를 검토합니다. getter 호출 순서·각 자원 검증·현재 편집 intent·optional 오류·원본 저장 SSOT는 유지해야 합니다. 문서/원본 소유자와 mutation serial이 바뀌면 공유를 끝내고 요청 종료 시 임시 자원을 해제합니다. Native scratch 출력 뷰나 편집 결과의 영구 캐시로 바꾸지 않습니다.

적용 전후에는 Noori 전체 응답뿐 아니라 잘못된 헤더, 필드 부재·미지원 값, 중간 편집·undo/redo·다른 문서·실패/할당 오류에서 기존 동작이 유지되는지 확인해야 합니다. 현재 시점에는 이 컨텍스트의 구현·성능 개선·웹 배포를 완료했다고 주장하지 않습니다.

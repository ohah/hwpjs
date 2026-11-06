# 원본 단일 셀의 단색 배경

이 문서는 셀 전체 배경의 현재 Native 값·복제 자원·저장·이력과 앱 연결을 소유한다. 문자/문단 배경과 다르다. 기존 셀 선택·크기 계약은 [원본 표 셀 서식](headless-original-cell-formatting.md), 공식 화면과의 전체 차이는 [감사 기록](webhwp-gap-audit.md)을 따른다.

## 요청과 소유권

범위는 HWP5/HWPX의 원본 단일 셀에 명시 단색을 설정하는 것이다. 공통 scalar 요청은 `section`, `tableNode`, `listNode`, `color`이며 앞의 세 값은 uint32, 색은 `0xRRGGBB`의 RGB24 정수다. 명시 검정0과 부재를 구분한다. 공통 검증기 `js/cell-background-command.mjs`는 SDK의 네 필드와 Worker의 `kind: 'cell-background'` 봉투를 각각 엄격히 검사한다. 알 수 없는 키·alpha·별칭·상속 필드로 요청을 보완하지 않는다.

두 저수준 편집기의 `setCellBackground`는 optional Native 함수 `hwp5_edit_set_cell_background` / `hwpx_edit_set_cell_background`로 한 번 전달한다. Native는 section/table/list의 실제 원본 membership을 확인한다. 문단 번호를 셀 번호로 쓰거나 클라이언트가 새 원본 참조를 발급하지 않는다. 배경 명령이 없는 구 엔진은 명시 ABI 오류를 내며 원문을 변경하지 않는다.

헤드리스 연결은 기존 `requestExperimental`의 `cell-background` mutation/token 경계다. 안정된 새 typed 셀 API를 공개했다는 의미는 아니다. `cellBackgroundAvailable`은 실제 WASM export 유무에서 만들며 셀 크기 capability로 대신하지 않는다. 원본 선택·상태/version/token fence·queue barrier·접수/소비·선택 복원은 기존 `table-cell-properties-port.ts`의 공통 경로가 소유한다.

## 자원과 현재 값

원본 BorderFill은 변경하지 않는다. 원본 자원과 요청색을 키로 복제 자원을 만들고 대상 셀의 참조만 바꾼다. 같은 원본/색의 복제는 같은 합성 안에서 재사용한다. Native가 소유하는 변경 값은 셀 식별자·원본 자원 ID·요청 RGB이며 직렬화된 DocInfo/header를 별도 편집 SSOT로 저장하지 않는다.

HWP5는 기존 문자/문단 자원 뒤에 셀 자원을 합성하고 대상 LIST_HEADER의 참조만 교체한다. HWPX는 기존 현재 header 자원에 복제 항목을 추가하고 대상 `tc.borderFillIDRef`만 교체한다. 현재 조회와 저장은 같은 합성 계획을 사용한다. HWPX의 단일 조회뿐 아니라 실제 화면이 우선 사용하는 일괄 테두리 조회도 이 계획을 공유한다. 파생 자원 ID는 현재 관측의 값이며 서로 다른 편집 세대에서 고정 ID라고 보장하지 않는다.

기존 foreground가 있으면 원값을 보존한다. HWP5의 확인된 기존 채우기 없음에서 새 단색을 만들 때에는 필수 무늬색 필드도 요청 RGB에서 명시 생성하고 무늬 종류는 기존 단색 인코딩을 사용한다. 이는 새 자원의 쓰기 정책이며 원본의 없던 값을 읽기 기본값으로 관측한 것이 아니다. 공통 BorderFill sparse writer의 부재 거부 규칙을 완화하지 않는다. 불명·이미지·지원하지 않는 alpha/확장 조합은 기존 writer의 거부 경계를 유지한다.

## 합성과 이력

배경 설정 하나는 기존 Native history의 명령 하나다. 같은 색의 no-op은 이력을 추가하지 않는다. undo/redo는 값과 파생 자원·참조를 함께 복원하며 실패한 요청으로 일부 자원만 남겨두지 않는다. 기존 문자/문단 자원 변경·셀 크기와의 합성도 각 원래 값의 소유자를 유지한다.

구역·자원·셀은 요청 소유 Map/Set과 구역별 색인으로 묶는다. 전체 header/DocInfo를 셀별로 다시 파싱·직렬화하거나 셀마다 전체 레코드를 다시 찾지 않는다. 신규 합성의 기대 작업량은 읽는 원본 바이트/노드 `N`, 구역 `S`, 편집 셀 `M`, 출력 바이트 `Q`에 대해 `O(N+S+M+Q)`다. 기존 다른 편집 기능 전체의 비용이나 실제 지연 측정을 이 식으로 대신하지 않는다.

## 앱의 최소 UI

`셀 배경` 도구는 선택한 원본 셀에 한 번 단색을 적용한다. 현재색을 이 포트에서 관측하지 않으므로 초기 표시는 미관측이며, color picker의 중립 검정을 실제 원본색으로 해석하지 않는다. 비어 있는 hex 입력에서 `#000000`도 직접 지정할 수 있다. 명시 선택 전·IME 조합 중·busy·stale·읽기 전용·이력 복구 필요 상태에서는 적용하지 않는다. 닫힌 도구의 presentation은 표나 문단을 순회하지 않는다.

접수된 요청을 닫기·후속 오류 때문에 다시 보내지 않는다. authoritative known-no-op은 소비 표시를 해제하되 현재 상태 fence를 유지한다. 변경 없는 적용 후에도 현재 선택이 같을 때에만 Canvas 포커스를 돌려주며, 바뀐 문서나 선택으로 포커스를 빼앗지 않는다.

이 UI는 테두리/그라데이션/그림/투명도·채우기 없음 설정·여러 셀 또는 표 전체 편집을 제공하지 않는다. 문단/셀 생성이나 표 구조 편집으로 범위를 확대하지 않는다.

## 검증 기록

구현 사전 시험과 통합 후 적대적 검증3회는 구분한다. 원자료는 `zig-out/verification/cell-border-background-r1/`에 보존하며, 각 회차는 동결 소스·WASM·테스트 및 입력 SHA와 실행 범위로 판정한다. 소스/mock 검사, 실제 Native, 독립 CFB/XML 저장 검사, 실제 Canvas와 배포는 서로 다른 증거다.

사전 시험에서는 기존 엔진의 양 형식 요청 거부/원문 바이트 유지, UI 신규35개와 기존 셀 크기52개, 공통 scalar/protocol6개, HWP5 CtorR3 및 HWPX batch R4의 집중 시험을 확인했다. 첫 HWP5 Noori 시험은 대상에 공유 자원을 요구했지만 해당 단계의 지원 자원4개가 모두 단독 사용이라 실패했고, 대상 선정 오류로 정정했다. 이후 원본 공유 no-fill 생성과 별도 파생 공유 fixture를 분리해 검사했다. HWPX 초기 문법 오류와 단일/일괄 조회 연결 누락, UI의 known-no-op 포커스 누락도 원래 실패와 수정 후 결과를 별도로 보존한다.

통합 WASM은 격리된 기준 소스와 명시 Native overlay로 ReleaseSafe 컴파일했다. SDK 독립 검사의 최초 preflight는 이력 메모리 설정과 oracle의 version.xml 속성명 가정에서 편집 전에 중단됐으며, 제품 배경 편집 실패로 판정하지 않는다. 통합 후 적대적 검증3회는 모두 통과했다. 운영 반영은 아래 검증과 별개로 산출물 해시·서버 상태를 확인한다.

1. 입력·소유권·IME·stale·읽기 전용·known-no-op 포커스의 소스 검사94개와 실제 Core API9개를 각각 통과했다. 실제 Native/Worker 소유권 회귀64개는 별도 코호트다.
2. 동일 원본 Noori 양 형식의 셀 네 대상에 대해 독립 CFB/XML 저장 검사5개를 통과했다. HWP5 공유 no-fill과 HWPX no-fill→단색, 비대상 자원·스트림/ZIP 항목 보존, 조회·저장·재열기·이력 및 틀린 기대값 거부를 확인했다. HWPX의 없던 `hatchColor`는 만들지 않았다. 네 개의 서로 다른 문서를 검사했다는 뜻은 아니다.
3. Vanilla/React/Svelte × HWP5/HWPX의 실제 화면6개를 통과했다. 한글 메뉴, 초기 빈 hex/적용 비활성, 명시 RGB 적용과 본문 보존, 포커스, paint 완료 후 undo/redo의 고정 내부 영역256픽셀, 미선택·명시 선택 취소, 동일색 재적용 후 한 번 undo의 원색 복원을 확인했다. 브라우저 내부 Native ACK 횟수는 측정하지 않았다.

브라우저의 이전 실패는 잘못된 메뉴 위치, paint 완료 전 판정, 커서에 민감한 전체 색상 픽셀 수의 동일성 조건, 대화상자 밖 `실행 취소`와 닫기 버튼의 부분 이름 충돌을 구분해 원자료를 보존했다. 실제 제품에서 누락된 메뉴의 한글 이름은 명령 레지스트리에서 가져오도록 수정하고 실제 Shell 생성 회귀로 확인했다. 최종 소유 브라우저는 `active:false`, `pid:null`, 잔류 프로세스0으로 종료했다. 전 문서 코퍼스·모든 개체·테두리·여러 셀 지원이나 공식 한글과의 전체 조판 동치를 이 결과로 주장하지 않는다.

선택한 원본 셀의 바깥 선은 별도 [셀 테두리 편집](cell-border-editing.md) 도구가 제공한다. 배경과 테두리는 같은 셀 자원 intent·저장 계획을 공유하며 대화상자의 pending·닫기·포커스 수명은 `table-cell-tool-controller.ts`가 소유한다.

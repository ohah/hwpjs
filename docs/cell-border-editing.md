# 원본 단일 셀의 테두리 편집

이 문서는 선택한 원본 셀의 바깥 네 변에 대한 쓰기 계약을 소유한다. 배경 편집은 [셀 배경](cell-background-editing.md), 대상 선택·이력 fence는 [원본 셀 서식](headless-original-cell-formatting.md), 전체 미지원 차이는 [공식 화면 감사](webhwp-gap-audit.md)를 따른다.

## 범위와 요청

HWP5/HWPX 원본 단일 셀의 왼쪽·오른쪽·위·아래 변만 지원한다. `cell-border` mutation의 scalar 필드는 `section`, `tableNode`, `listNode`, `edges`, `style`, `width`, `color`다. `edges`는 왼쪽1·오른쪽2·위4·아래8의 비어 있지 않은 마스크이며, `style`은 `NONE`, `SOLID`, `DOUBLE_SLIM`이다. 폭은 1/100mm 정수이며 공통 BorderFill 폭 표의 값만 허용한다. RGB24 검정0과 값 부재를 구분한다. 대각선·안쪽 격자·여러 셀·생성 셀은 이 계약 밖이다.

`NONE`도 명시 폭·색과 함께 선택한 변의 자원 값을 설정한다. 기존 폭·색을 삭제하거나 보이지 않는 값을 임의 기본값으로 읽지 않는다. 원본 관측·공식 한글의 선택 상태별 기본값을 이번 UI의 쓰기 의도로 대신하지 않는다.

JavaScript 도메인 값은 `js/border-fill-values.mjs`, 명령의 공통 부분집합·정규화는 `js/cell-border-command.mjs`가 소유한다. SDK는 일곱 own 필드, Worker는 여기에 `kind` 하나를 더한 봉투를 검사한다. 추가·상속·별칭 필드와 임의 alpha를 허용하지 않고, getter는 한 번 읽어 불변 값으로 만든다. Native `src/wasm/cell_border.zig`가 독립적으로 마스크·선 종류 코드·폭·RGB 범위를 검사한다. ABI의 이중선 코드2와 HWP5 원본 선 종류8은 서로 다른 도메인이다.

HWPX 색상 해석은 필드별 계약을 따른다. 테두리의 `color`는 직접 RGB24이며, Noori `winBrush.faceColor` 등 확인된 생산자 필드의 packed COLORREF 처리와 구분한다. 배경의 변환을 테두리에 일괄 적용하지 않는다. 독립 오라클의 최초 기대값 오류도 실제 저장 XML의 선 색 `#123456`과 원본 fill 필드 보존을 각각 확인해 정정했다.

## 단일 자원 상태와 합성

테두리와 배경은 같은 원본 셀 intent·복제 자원·체크포인트를 공유한다. 배경 설정 뒤 테두리 또는 반대 순서에서도 다른 속성을 덮어쓰지 않는다. 원본과 같아진 scalar만 intent에서 제거하고, 다른 변과 배경은 유지한다. 원본 BorderFill을 제자리에서 바꾸지 않고 선택한 셀의 참조만 복제 자원으로 연결한다. 현재 단일/일괄 조회와 저장도 같은 합성 계획을 사용한다.

일괄 자원 합성은 원본 자원과 전체 sparse patch를 키로 구분한다. 배경색만 같은 서로 다른 테두리를 하나의 복제로 합치지 않는다. 요청별 Map/Set 색인과 출력 순회로 원본 바이트/노드 N·변경 셀 M·출력 Q에 대해 기대 O(N+M+Q)를 유지하며, 매 셀마다 전체 header/DocInfo를 재직렬화하지 않는다. 같은 색·같은 선의 no-op은 이력을 추가하지 않고, undo/redo와 실패 복구는 배경·테두리와 참조를 함께 복원한다.

## 앱과 검증 상태

`표 → 셀 테두리`와 셀 컨텍스트 메뉴는 같은 명령 레지스트리의 이름·실행을 사용한다. 원본 셀 capture·토큰·queue barrier·소비·선택 복원은 기존 공통 포트가 소유하고, 배경/테두리 창의 pending·stale·닫기·known-no-op 포커스 수명은 공통 컨트롤러를 사용한다. 초기 선 종류·폭·색은 미관측이며 명시 선택 전 적용하지 않는다. 닫힌 도구에서 문서 전체를 순회하지 않는다.

검증 원자료는 `zig-out/verification/cell-border-edit-r1/`에 보존한다. 구현 사전 검사, 통합 후 적대적 검증3회와 실제 배포는 구분해 기록한다. 다음3회차는 모두 통과했고, 배포는 별도로 산출물·CI·HTTP·공개 화면을 확인한다.

1. 입력·캡처·토큰·stale·읽기 전용·IME·공용 수명주기의 소스151개와 실제 Core API8개를 각각 통과했다. Native ABI scalar 집중 검사1개와 기존 Native/Worker 소유권 회귀64개도 별도 확인했다.
2. 독립 CFB/XML 저장 검사16개를 통과했다. 동일 Noori 양 형식의 원본 셀 네 대상에서 테두리/배경의 양 적용 순서, 단일/복수 변, NONE·검정·두께, 원본과 비대상 자원 보존, 현재 조회·저장·재열기·이력·no-op을 확인했다. 네 개의 서로 다른 문서를 검사한 것은 아니다.
3. Vanilla/React/Svelte × HWP5/HWPX의 실제 Canvas6개를 통과했다. 정상 메뉴 진입·초기 미관측/적용 비활성, HWP5 아래 변/HWPX 네 변의 SOLID·1.50mm·RGB123456 적용, 조밀한 선 픽셀·기존 배경 내부 영역·본문 보존, paint 완료 후 undo/redo, 취소·동일값 재적용 후 한 번 undo와 포커스를 확인했다. 공용 컨트롤러의 기존 배경 편집도 Vanilla HWP5에서 실제 적용·undo로 검사했다. 브라우저 Native ACK 횟수는 측정하지 않았다.

HWP5 사전 Native14개와 HWPX19개에는 기존 배경 회귀가 포함된다. 최초 넓은 Native 필터의 추가 fixture 누락, HWPX 할당 검사의 resize/remap 가정, 독립 오라클의 배경/선 색상 영역 혼동, 브라우저 raw SDK와 URL 재작성 후 제공 본문의 SHA 혼동은 원로그를 보존하고 각각 바로잡았다. 통과한 부분을 전 코퍼스·모든 선 종류·공식 한글과의 완전 동치로 확대하지 않는다. 최종 검증 브라우저는 active=false·pid=null·소유 잔류0으로 종료했다.

후속 [원본 셀 범위 서식](table-range-formatting.md)은 여러 셀·표 전체의 별도 범위와 검증을 소유한다. 위 단일 셀 기록을 전체 표 편집의 증거로 소급하지 않는다.

# HWPX 표 삽입 UI 연결

후속 메뉴 회귀: 실제 app의 표 설정 위임이 추가됐지만 `document-menu-wiring`의 기대 목록에 빠져 최초 픽스처/파일/메뉴/생성 Worker 묶음은25통과·1실패·exit1(21연결/20기대)이었습니다. 새 메뉴를 기존 `table-creation-focus` 권한에 정확히 연결하는 기대값과 잘못된 submit 직접 연결/누락 반례를 추가했습니다. 집중8/8·exit0 후 같은 후보3d77c874의 전체 묶음26/26·exit0·skip0(10906.209959ms)을 확인했습니다. 픽스처404/크기/경로 거부·파일 입력·메뉴 권한/IME/late 변경·생성 셀 입력과 native identity/독립 XML/history 경로를 포함합니다. product 메뉴 코드는 변경하지 않았고 정규 표현식/기대 개수 검사를 완화하지 않았습니다. Worker/Canvas DOM 대역 검사이며 새로운 실제 브라우저 표 삽입이나 전체 native gate로 계수하지 않습니다.

후속 깨끗한 게시 source/artifact와 실제 Chromium 검증은 [브라우저 검증](hwpx-table-creation-browser.md)을 따릅니다. 아래 브라우저 미검증 기록은 UI 연결 당시의 경계입니다.

Worker의 현재 표시 응답은 조회 ABI가 있으면 실제 tableCreationResources 목록을 포함합니다. renderer는 이 조회 결과와 생성 capability를 전달하고 Canvas의 tableCreationSelection이 source 커서의 현재 UTF-16 위치를 반환합니다. 생성 셀·범위 선택·clipped/처리 중/조합 중 선택은 생성 host로 반환하지 않습니다.

표 삽입 메뉴는 기존 문서 메뉴 위임기로 설정 폼을 포커스합니다. form은 행/열/폭/행 높이와 네 실제 서식 ID 선택을 소유합니다. 단위는 HWPUNIT입니다. 조회 목록의 첫 유효 ID가 초기 선택이며 host의 서식을 자동 상속한다고 주장하지 않습니다. 선택 목록이 없거나 셀 선택/세션 비활성/처리 중이면 비활성화합니다. submit은 Canvas의 기존 선택을 통해 생성 거래를 요청합니다. native가 host/서식/치수/예산을 다시 검증합니다.

Canvas insertTable은 pending history 명령을 만들고 성공하면 응답의 identity를 이용해 생성 표 첫 셀의 커서와 textarea 포커스를 복원합니다. 표시 한도나 미지원 host 때문에 첫 셀을 찾지 못하면 생성 성공과 입력 위치 실패를 구분해 안내합니다. 원본 source node/paragraph 번호로 생성 셀을 대신 지정하지 않습니다.

2026-10-11 실제 Worker/renderer4/4·exit0(2436.378625ms)은 현재 source caret→생성 요청→첫 셀 포커스→입력과 기존 입력/저장/history 회귀를 확인했습니다. 순수 form 검사는 실제 ID 선택·숫자 요청·invalid form/선택 부재/close 비활성화를 확인했습니다. 기존 Canvas/form 회귀199/199·exit0(2308.082166ms), 현재 기본 WASM의 checkbox/header-footer Worker2/2·exit0(1009.651ms)도 통과했습니다. 새 capability 회귀는 별도 후보 `6c59a37808b3b6c451c297e9f5816e07334ae257d50d5c081ed7c869e6a11d16`을 사용합니다.

실제 브라우저 메뉴/폼/포인터/물리 IME와 외부 데모는 아직 검증/승격하지 않았습니다. 기본 WASM에는 필요한 ABI가 없어 삽입 UI가 비활성화됩니다. 현재 배치는 block prototype이며 정확한 inline/쪽 배치, host 위치 재배치·생성 셀 서식/구조·HWP5 생성은 남아 있습니다.

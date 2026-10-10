# 문서 메뉴 팝업 레이어

기존 native details 메뉴에서 버튼을 펼치면 도구 내용 자체가 아래로 밀렸습니다. 2026-10-11 실제 1280×633 데모의 편집 메뉴 열기 전후에 편집 시작 버튼 top508→552px를 관측했습니다. command bar는45vh 한도로284.84375px였고 Canvas top562.84375px는 그대로여서 아래쪽 버튼이 도구 스크롤 경계에 걸렸습니다. 파서/편집 거래의 실패가 아닌 메뉴 배치 경계입니다.

`document-menu-popup-layer.mjs`는 버튼 컨테이너를 native manual Popover의 최상위 레이어로 표시합니다. 메뉴 열림 SSOT는 계속 `details.open`이며 native popup은 표시 투영입니다. 메뉴 선택은 기존 `document-menu-controls`가 기존 명령에 위임합니다. 도구/Canvas 크기를 변경하거나 메뉴 전용 편집 모델을 만들지 않습니다.

위치 계산은 summary의 화면 좌표·viewport·popup 실제 크기를 사용합니다. 좌우를 화면 안에 제한하고 아래 공간이 부족하면 더 넓은 위쪽 공간을 사용합니다. popup 내용 자체의 스크롤은 유지하되 문서/도구 스크롤은 메뉴를 닫습니다. resize 재배치·외부 native 닫힘·stale toggle·close 후 리스너 제거를 처리합니다. Popover API가 없으면 기존 details 경로를 유지하며 그 fallback의 실제 구형 브라우저 배치 검증은 별도입니다. Escape와 hover/외부 pointer 닫기는 기존 disclosure 계약을 재사용합니다.

## 2026-10-11 검증

팝업 변경 후 같은1280×633 측정에서 메뉴 열기 전후 편집 시작 top508px·Canvas top562.84375px·command bar284.84375px가 같았습니다. 메뉴는 화면 안의 top-layer에 표시됐습니다. 폭800px에서는 메뉴 열기 전후 Canvas top879px·편집 시작 top508px가 같았고 가로 overflow=false였습니다. Escape 뒤 열린 popup0과 summary 포커스를 확인했습니다.

후속 위/아래 배치·스크롤·stale 닫힘·fallback·close 검사와 기존 메뉴/실제 HWP5·HWPX 저장 회귀 묶음은13/13·fail/skip0입니다. `node --test tests/hwpx/document-menu-popup-layer.test.mjs tests/hwpx/document-menu-controls.test.mjs tests/hwpx/document-menu-disclosures.test.mjs tests/hwpx/document-menu-wiring.test.mjs tests/hwp5/document-menu-save.test.mjs tests/hwpx/document-menu-save.test.mjs`로 재현합니다.

최종 팝업 코드로 실제 parashape.hwpx의 `문단 6` 검색 선택 → 편집 popup의 선택 삭제 → 빈 문단·popup0 → 메뉴 undo 원문 복원을 확인했습니다. agent-browser 세션 `hwpjs-menu-layout`는 종료했고 기본 WASM/서버는 교체하지 않았습니다. 해당 화면/표본·단위 위치 경계의 증거이며 전체 브라우저·접근성·모든 문서 조판/편집 완료로 확대하지 않습니다.

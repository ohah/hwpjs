# 찾기·바꾸기 메뉴 연결

RHWP 참조의 `rhwp-studio/src/command/commands/edit.ts`는 찾기 명령으로 기존 FindDialog를 열거나 포커스를 복원합니다. 우리 `편집 → 찾기·바꾸기`도 검색 구현을 별도로 만들지 않고 `createFindControls().focus()`에 위임합니다. Canvas Ctrl/Cmd+F와 메뉴가 같은 포커스 함수를 사용합니다. 기존 초안을 보존하고 전체 입력을 선택하며, 메뉴 진입만으로 검색·선택·native 편집을 실행하지 않습니다. 종료된 컨트롤의 포커스 요청은 false이며 close는 멱등입니다.

검색은 기존 현재 표시 문서 범위입니다. 전체 문서·표시되지 않은 구간 검색이나 RHWP 전체 명령 지원으로 확대하지 않습니다. 결과 선택/교체의 기존 capability·보호·조합/대기 입력 정책은 [Canvas 검색 계약](canvas-text-search.md)이 계속 소유합니다.

## 2026-10-11 검증

`node --test tests/hwp5/text-search.test.mjs tests/hwpx/document-menu-wiring.test.mjs tests/hwpx/document-menu-controls.test.mjs tests/hwpx/document-menu-disclosures.test.mjs`는13/13, fail/skip0입니다. 포커스 요청의 검색/편집 호출 금지·초안 보존·close 후 거부와 기존 단축키/검색/교체·메뉴 authority/잘못된 연결 반례를 검사했습니다.

agent-browser로 외부 데모 `https://macstudio.tailed42f2.ts.net:10000/web/preview/index.html`에서 검색 입력에 `검증 초안`을 넣고 편집 메뉴를 실제 클릭한 뒤 찾기·바꾸기를 클릭했습니다. activeElement는 `find-input`, 값은 동일하고 selectionStart0/selectionEnd5, 메뉴 open=false였습니다. 브라우저 세션 `hwpjs-menu-find`는 종료했습니다. 이 검사는 메뉴 포커스의 실제 GUI 증거이며 문서 파싱·검색 결과·저장/편집 전수 검사는 아닙니다. WASM이나 데모 서버를 교체하지 않았습니다.

# 문서 메뉴와 명령 검색의 공통 실행 경계

rhwp 참조 커밋 `e8800c8def63449808a4092798442652ed460552`의 `rhwp-studio/src/ui/command-palette.ts`는 registry/dispatcher를 소비하고, 명령·이력 지침은 문서 mutation이 공통 편집 라우터를 통과하도록 요구합니다. UI 코드나 포맷 모델을 섞지 않고 이 책임 분리만 참고합니다. 참조 저장소는 수정하지 않았습니다.

현재 `createDocumentMenuControls`가 메뉴 delegate를 소유합니다. `commands()`는 실제 버튼 ID/라벨과 기존 target의 현재 disabled/상위 fieldset 상태로 활성 여부를 반환합니다. 버튼 ID가 없으면 순번 기반 로컬 키를 쓰며 중복 키는 리스너 등록 전 거부합니다. 명령 목록은 UI용 snapshot이고 실행 권한 캐시가 아닙니다.

`execute(id)`는 현재 상태를 다시 갱신·검사한 뒤 원래 메뉴 클릭과 동일한 delegate를 정확히 한 번 호출합니다. 새 Worker/native 명령·이력·선택·보호 판단을 독립 구현하지 않습니다. unknown/disabled/닫힌 controller는 실행하지 않습니다. 사용자 작업 종료 시 기존 리스너·popup과 함께 정리합니다.

명령 metadata/일반 메뉴와 같은 실행·stale 활성 값·상위 fieldset 비활성·disabled에서 활성 전환·unknown·반복 close·중복 ID, 기존 메뉴/서식/패널/Escape 회귀8/8·skip0·종료코드0입니다. 이는 명령 검색창 자체의 완성이나 실제 browser palette/모든 rhwp UI 기능 완료가 아닙니다. 다음 UI는 이 snapshot과 실행 경계를 소비하며 명령 정의·허용 조건·native dispatch를 두 번째로 소유하지 않습니다.

## 명령 검색 UI 연결

`command-search.mjs`는 기존 registry를 받아 버튼·native dialog·검색/목록·키보드·포커스 수명만 소유합니다. 스타일은 별도 `command-search.css`입니다. Ctrl/⌘+Shift+P 또는 명령 검색 버튼으로 열고 한국어 label/ID를 검색합니다. 방향키로 사용 가능한 명령에 이동하고 Enter로 실행하며 Escape/닫기는 문서 명령 없이 포커스를 복원합니다. IME·229·반복/Alt shortcut은 소비하지 않습니다. Enter는 input 이벤트가 없더라도 실제 검색값으로 목록을 다시 만들고, 실행은 current registry 확인 후 공통 execute 경계를 통과합니다. 목록 리스너는 재검색마다 누적하지 않고 root 위임1개를 사용합니다. pagehide 때 UI·stylesheet·keyboard listener를 정리합니다.

UI 대역의 shortcut/Enter/IME/Escape·뒤늦은 비활성·검색 결과 없음·방향키·반복 close·기존 registry/menu 회귀11/11·skip0·종료코드0입니다. 실제 Chromium 세션 hwpjs-command-search/loopback18480/후보39c827ed에서는 문서가 없어도 검색이 열리고 다운로드/undo 등의 사용 불가 상태가 표시됐습니다. table-bug가 로딩된 후 Canvas 제목0:2:6에 `검색😀`을 입력하고 명령 검색의 실행 취소/다시 실행을 Enter로 수행했습니다. Worker 기록은 splice/undo/redo 각1회이며 원문과 변경문 복원·canvas-input 포커스 복귀를 확인했습니다. 로딩 중 너무 이른 enable/입력 시도는 성공 증거에서 제외했습니다.

native dialog 화면 screenshot-1791855280820.png를 시각 확인했습니다. 소유 브라우저를 close하고 서버PID1070을 확인해 종료했습니다. 이번 검증은 같은 후보·한 문서의 명령 검색/이력 사례이며 모든 palette 명령·clipboard 권한·IME/모바일·원본 조판 전수 완료는 아닙니다. 이전 검색창 미구현 기록은 이 연결로 대체합니다.

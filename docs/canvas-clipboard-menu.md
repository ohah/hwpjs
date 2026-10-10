# Canvas 복사·잘라내기 메뉴

RHWP `rhwp-studio/src/command/commands/edit.ts`의 copy/cut 메뉴는 입력 핸들러에 위임합니다. 우리 편집 메뉴도 Canvas controller의 `transferSelection`에 위임하며 네이티브 저장 모델을 만들지 않습니다. `clipboard-transfer.mjs`는 시스템 클립보드 쓰기와 비동기 완료만 소유합니다. 여러 문단의 Ctrl/Cmd+C·X도 같은 함수를 사용합니다. 단일 문단의 기본 브라우저 clipboard 이벤트와 기존 붙여넣기 경로는 그대로입니다. 이번 작업에 붙여넣기 메뉴·객체/서식 clipboard·전역 전체 선택은 포함하지 않습니다.

복사는 현재 확정된 선택 텍스트만 쓰고, 잘라내기는 쓰기 성공 뒤 현재 선택·target·확정 텍스트·revision·DOM 선택 좌표·조합/pending/history/busy/종료 상태를 다시 확인합니다. 지연 중 바뀐 대상에 삭제하지 않습니다. 보호·편집 capability는 기존 Canvas 교체 명령이 마지막으로 검증하며 단일/여러 문단은 각각 기존 splice/문단 교체 거래를 재사용합니다. 시스템 clipboard API가 없거나 권한이 거부되면 원문을 삭제하지 않습니다. clipboard에는 쓰였지만 선택이 바뀌면 삭제는 하지 않는다는 경계를 유지합니다.

## 2026-10-11 검증

기본 WASM SHA256 `fe97aa698bcc1cdfef9bc75f3fcafc4941a3c0069724bc700f0a62923c48fc20`의 `tests/hwp5/canvas-editor.test.mjs` 전체184/184·fail/skip0, 메뉴/검색/clipboard 집중14/14·fail/skip0입니다. 실제 parashape.hwp의 단일 잘라내기 한 거래·undo 원문 바이트/redo 저장 바이트와 지연 중 선택 변경·close·busy의 삭제 거부를 포함합니다. 기존 여러 문단 cut-key/cut-stale 회귀도 통과했습니다. 첫 회귀에서 IME의 엄격 capability 판정을 cut에 잘못 재사용해 두 경로가 실패했고, 실제 문단 교체 capability 정책에 맞춰 교정한 뒤 전체 재실행했습니다. 메뉴 wiring 검사도 중첩 proxy의 첫 닫는 괄호에서 잘리던 정규식을 줄 끝 기준으로 교정했습니다.

agent-browser 스킬로 외부 데모에서 parashape.hwp 업로드 → 편집 시작 → `문단 6` 검색 선택(0:4) → 편집 메뉴 복사 성공 상태 → 잘라내기 빈 문단/undo 활성 → 메뉴 실행 취소로 `문단 6` 복원을 확인했습니다. 기본 WASM·서버는 교체하지 않았고 브라우저 세션 `hwpjs-clipboard-menu`는 종료했습니다. 문단 선택 전 입력 활성화를 기다렸던 초기 조건과 잘못된 selector의 timeout은 검사 조건 오류이며 제품 오류로 계수하지 않습니다. 실제 GUI 증거는 HWP5 표본 한 개입니다. 브라우저 다운로드 전체 CFB/독립 oracle·HWPX GUI·모든 문서 clipboard/IME 완료를 주장하지 않습니다.

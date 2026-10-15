# Canvas 클립보드 메뉴

RHWP `rhwp-studio/src/command/commands/edit.ts`의 copy/cut 메뉴는 입력 핸들러에 위임합니다. 우리 편집 메뉴도 Canvas controller의 `transferSelection`에 위임하며 네이티브 저장 모델을 만들지 않습니다. `clipboard-transfer.mjs`는 시스템 클립보드 I/O와 비동기 완료만 소유합니다. 여러 문단의 Ctrl/Cmd+C·X는 별도의 브라우저 clipboard 이벤트에서 clipboardData에 확정 선택을 쓰고, 잘라내기는 기존 replaceSelection 거래를 사용합니다. 시스템 clipboard helper를 호출하는 메뉴 경로와 같은 I/O 함수라고 해석하지 않습니다. 단일 문단의 기본 브라우저 clipboard 이벤트와 기존 붙여넣기 경로는 그대로입니다. 초기 복사·잘라내기 작업에는 붙여넣기 메뉴가 없었고 후속 구현은 아래 계약을 따릅니다. 객체/서식 clipboard·전역 전체 선택은 아직 포함하지 않습니다.

## 2026-10-15 현재 작업 트리 회귀

고정 후보 SHA256 `26f6e9f820fc6d1d24bf4659921d0b080140849db00d1e48f1fdff7c7d2d47b5`로 clipboard-transfer/canvas-editor/document-menu-wiring 세 파일을 정확한 선택 wrapper에서 실행했습니다. 최종204/204·fail/skip/cancel0·exit0(3754.656583ms,실행74330)입니다. 실제 HWP5 native의 단일/다중 문단 cut/paste·독립 저장/이력과 선택 변경·close·busy·조합·pending 거부를 포함합니다. 메뉴 wiring은 정적 검사이고 DOM/이벤트는 harness 대역입니다. 현재 작업 트리 증거이며 게시 JS snapshot·실제 브라우저/OS clipboard·모든 HWPX clipboard 지원의 증거로 확대하지 않습니다. 기본 WASM을 교체하거나 새 브라우저/디바이스를 실행하지 않았습니다.

복사는 현재 확정된 선택 텍스트만 쓰고, 잘라내기는 쓰기 성공 뒤 현재 선택·target·확정 텍스트·revision·DOM 선택 좌표·조합/pending/history/busy/종료 상태를 다시 확인합니다. 지연 중 바뀐 대상에 삭제하지 않습니다. 보호·편집 capability는 기존 Canvas 교체 명령이 마지막으로 검증하며 단일/여러 문단은 각각 기존 splice/문단 교체 거래를 재사용합니다. 시스템 clipboard API가 없거나 권한이 거부되면 원문을 삭제하지 않습니다. clipboard에는 쓰였지만 선택이 바뀌면 삭제는 하지 않는다는 경계를 유지합니다.

## 2026-10-11 검증

기본 WASM SHA256 `fe97aa698bcc1cdfef9bc75f3fcafc4941a3c0069724bc700f0a62923c48fc20`의 `tests/hwp5/canvas-editor.test.mjs` 전체184/184·fail/skip0, 메뉴/검색/clipboard 집중14/14·fail/skip0입니다. 실제 parashape.hwp의 단일 잘라내기 한 거래·undo 원문 바이트/redo 저장 바이트와 지연 중 선택 변경·close·busy의 삭제 거부를 포함합니다. 기존 여러 문단 cut-key/cut-stale 회귀도 통과했습니다. 첫 회귀에서 IME의 엄격 capability 판정을 cut에 잘못 재사용해 두 경로가 실패했고, 실제 문단 교체 capability 정책에 맞춰 교정한 뒤 전체 재실행했습니다. 메뉴 wiring 검사도 중첩 proxy의 첫 닫는 괄호에서 잘리던 정규식을 줄 끝 기준으로 교정했습니다.

agent-browser 스킬로 외부 데모에서 parashape.hwp 업로드 → 편집 시작 → `문단 6` 검색 선택(0:4) → 편집 메뉴 복사 성공 상태 → 잘라내기 빈 문단/undo 활성 → 메뉴 실행 취소로 `문단 6` 복원을 확인했습니다. 기본 WASM·서버는 교체하지 않았고 브라우저 세션 `hwpjs-clipboard-menu`는 종료했습니다. 문단 선택 전 입력 활성화를 기다렸던 초기 조건과 잘못된 selector의 timeout은 검사 조건 오류이며 제품 오류로 계수하지 않습니다. 실제 GUI 증거는 HWP5 표본 한 개입니다. 브라우저 다운로드 전체 CFB/독립 oracle·HWPX GUI·모든 문서 clipboard/IME 완료를 주장하지 않습니다.

## 붙여넣기 메뉴와 추가 검증

`pasteSelection`은 빈 caret도 캡처하고 시스템 `readText` 전후에 기존 선택 snapshot과 편집 적격성을 검사합니다. 문자열이 비었거나 UTF-16이 잘못되었으면 삭제/입력하지 않습니다. 확정된 문자열은 기존 `replaceSelectedText`에 전달하며 여러 줄은 기존 문단 교체 거래로 연결합니다. 클립보드 접근 권한 거부 시 원문을 유지하고 Ctrl/Cmd+V 안내를 표시합니다. 기존 브라우저 paste 이벤트를 우회하거나 권한을 자동 변경하지 않습니다.

단일 caret Unicode 입력·저장/undo/redo와 지연 중 선택 변경·close·busy 거부를 실제 HWP5 WASM으로 검사했습니다. 기존 여러 줄 시험에 menu 경로를 추가하여 빈 문단·suffix·독립 CFB 전체 stream/본문 대조·원문 undo/저장본 redo를 같은 기준으로 검사했습니다. pure clipboard/menu 집중10/10·fail/skip0이고, menu 여러 줄 집중4/4·fail/skip0입니다.

menu 여러 줄 경로를 포함한 최종 `node --test tests/hwp5/canvas-editor.test.mjs` 전체 재실행은190/190·fail/skip0,2969.28975ms입니다. 이전189개 실행과 누적 합산하지 않습니다.

실제 외부 데모의 parashape.hwpx에서 동일한 `문단 6` 선택으로 메뉴 붙여넣기를 클릭하자 browser read 권한 거부 안내와 원문 유지가 확인됐습니다. 자동화 eval 및 CLI clipboard write도 권한 거부였으므로 붙여넣기 성공으로 계수하지 않습니다. 이후 실제 메뉴 복사는 성공 상태를 표시했고, 잘라내기 빈 문단/undo 활성·메뉴 실행 취소로 원문 복원을 확인했습니다. 세션 `hwpjs-paste-menu`는 종료했습니다. HWPX 메뉴 복사/잘라내기 표본과 권한 거부 GUI 증거이며, 허용된 clipboard read 이후 메뉴 붙여넣기의 실제 GUI 성공·브라우저 저장본 독립 XML·HWPX 전수 clipboard는 아직 별도 게이트입니다.

## 권한 거부 안내의 포커스 복원

거부 안내만 표시하면 메뉴 버튼에 포커스가 남아 키보드 붙여넣기의 대상이 되지 않는 연결 누락을 수정했습니다. 현재 선택에 대한 read 거부일 때만 `onDenied`가 Canvas 입력 포커스를 복원합니다. 지연 중 선택이 바뀌거나 close/busy이면 안내와 포커스 복원을 모두 실행하지 않습니다. clipboard 권한이나 문서 바이트를 변경하지 않습니다.

pure clipboard5/5·fail/skip0은 현재/지연된 거부의 콜백 실행 여부를 검사합니다. 실제 HWP5 native를 연결한 Canvas 테스트는 선택1:2·원문 바이트·요청0·포커스 복원을 검사합니다. 최종 Canvas 전체191/191·fail/skip0,2588.959833ms입니다.

agent-browser의 별도 `hwpjs-clipboard-granted` 테스트 브라우저에서 데모 origin에만 CDP 권한 허용을 시도했으나, 성공 응답과 달리 실제 Permissions API의 clipboard-read는 계속 denied였습니다. 원래 프로필/다른 브라우저를 변경하지 않았고 이 세션은 종료했습니다. 서버 응답에는 Permissions-Policy가 없었지만, 이것만으로 권한 거부의 정확한 원인을 단정하지 않습니다.

후속 `hwpjs-paste-fallback`에서 실제 parashape.hwpx의 문단6 메뉴 복사 후 문단5 선택·메뉴 붙여넣기 거부를 검사했습니다. activeElement=`canvas-input`, 텍스트=`문단 5`, 안내가 유지되어 수정한 포커스 경로를 확인했습니다. 자동화 Control+V·Meta+V 이후에도 텍스트가 그대로였으므로 fallback 붙여넣기 성공으로 계수하지 않습니다. 초기 disabled 파일 input에 대한 자동화 upload는 로드 이벤트가 처리되지 않아 시작을 기다린 뒤 다시 업로드했고, 도구 내부 스크롤로 가려진 편집 시작 버튼은 scrollintoview 뒤 클릭했습니다. 세션은 종료했습니다. 실제 브라우저 paste 성공 게이트는 계속 남습니다.

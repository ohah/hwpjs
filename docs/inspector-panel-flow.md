# 열린 속성 검사기의 흐름 배치

속성 검사기가 열리면 `.editor-surface`는 sticky 대신 relative로 배치합니다. 닫혀 있을 때의 고정 workspace와 viewport 내부 스크롤 정책은 유지합니다.

실제 chart HWPX의 수동 결과 입력 중 결과 적용 버튼이 후속 도움말/API 패널에 가려 일반 클릭이 거부되는 현상을 재현했습니다. 검사기 확장 상태에서도 workspace가 고정되어 후속 패널과 겹친 것이 원인입니다. 검사기 열림 조건에만 흐름 배치를 적용한 후 강제 클릭 없이 적용·저장·undo/redo 다운로드를 확인했습니다. 수동 결과 ABI는 별도 후보에서 검증한 것으로, 이 CSS 수정만으로 해당 ABI가 main에 추가되는 것은 아닙니다.

`node --test tests/hwp5/workspace-panel-flow.test.mjs tests/hwp5/editor-controls.test.mjs`는 main 기반 격리 사본에서3/3·실패/skip0·exit0입니다. CSS 회귀는 열린 검사기의 relative 배치·기본 sticky·viewport 스크롤을 고정하며 실제 브라우저의 모든 화면 크기나 조판 동등성을 증명하지 않습니다.

# 찾기 도구 접기

찾기 폼은 기본 닫힌 native `details#find-options` 안에 둡니다. 메뉴와 Canvas 단축키가 공유하는 `findControls.focus()`는 입력에 포커스하기 전에 폼의 가장 가까운 details를 엽니다. 열림 상태는 DOM만 소유합니다. 컨트롤러 종료 후에는 열거나 포커스하지 않습니다.

`node --test tests/hwp5/text-search.test.mjs tests/hwp5/editor-controls.test.mjs`로 현재 작업 트리에서17개 검사가 통과했습니다. 수동 닫기 후 재열기·종료 후 거부·조합/수정키/범위 제한을 포함하며 실제 브라우저 배치 검증을 대신하지 않습니다.

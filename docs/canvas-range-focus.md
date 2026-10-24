# Canvas 선택 범위 복원과 포커스

`createCanvasEditor().selectTextRange(range, options)`는 기존 range 외에 선택적인 `affinity: "forward" | "backward"`를 받습니다. 기본값은 forward입니다. `options.focusInput` 기본값은 true이며 false이면 선택 표시·textarea의 방향은 복원하되 툴바 포커스를 빼앗지 않습니다.

방향·범위·Unicode scalar 경계와 배치 위치를 검증한 뒤에만 초안 선택을 바꿉니다. 이 메서드는 native 문서나 저장값을 변경하지 않으며, 스냅샷 변경 후 선택이 유효한지를 판정하는 책임도 갖지 않습니다. 호출자는 먼저 현재 문서 기준으로 범위를 확인해야 합니다.

`node --test tests/hwpx/canvas-selection-focus.test.mjs`는 방향 유지, 포커스 선택권, 잘못된 방향·서로게이트 내부·범위 초과 거부와 입력 불변성을 검사합니다. 실제 브라우저나 포맷 파서 검증을 대신하지 않는 순수 입력 경계 테스트입니다.

# Canvas 선택 범위 복원과 포커스

`createCanvasEditor().selectTextRange(range, options)`는 기존 range 외에 선택적인 `affinity: "forward" | "backward"`를 받습니다. 기본값은 forward입니다. `options.focusInput` 기본값은 true이며 false이면 선택 표시·textarea의 방향은 복원하되 툴바 포커스를 빼앗지 않습니다.

방향·범위·Unicode scalar 경계와 배치 위치를 검증한 뒤에만 초안 선택을 바꿉니다. 이 메서드는 native 문서나 저장값을 변경하지 않으며, 스냅샷 변경 후 선택이 유효한지를 판정하는 책임도 갖지 않습니다. 호출자는 먼저 현재 문서 기준으로 범위를 확인해야 합니다.

`node --test tests/hwpx/canvas-selection-focus.test.mjs`는 방향 유지, 포커스 선택권, 잘못된 방향·서로게이트 내부·범위 초과 거부와 입력 불변성을 검사합니다. 실제 브라우저나 포맷 파서 검증을 대신하지 않는 순수 입력 경계 테스트입니다.

## 인라인 개체 위의 선택 표시

텍스트 범위가 인라인 차트를 포함해도 차트의 막대·눈금·제목을 지우지 않습니다. `text-selection-paint.mjs`가 선택 배경을 반투명하게 합성하고 Canvas 상태를 복원합니다. 흰 배경에서는 기존 선택 색을 유지하며, 이미 그린 개체의 픽셀을 불투명한 사각형으로 덮지 않습니다. 문서 내용·이력·개체 크기는 바꾸지 않습니다.

차트 데이터 편집 예제를 공개 데모에서 실제 마우스로 드래그하면 기존 구현은 막대와 배경을 모두 같은 파란색으로 덮었습니다. 수정 후보에서는 같은 위치의 막대와 배경 픽셀이 구분됐으며, 정방향·역방향 선택에서도 차트 표시가 유지됐습니다. 이는 텍스트 선택의 표시 수정이며 차트 이동·크기 조절 구현의 완료를 뜻하지 않습니다.

`tests/text-selection-paint.test.mjs`는 흰 배경 색 유지·개체 색 보존·오류 시 상태 복원을 확인합니다. `tests/hwp5/canvas-edit.test.mjs`와 기존 선택·이력 paint 검사를 함께 실행합니다.

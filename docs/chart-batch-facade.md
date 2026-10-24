# HWPX 차트 일괄 수정 facade

`createHwpxChartApi`는 `chartPointBatchLimits()`와 `setChartPoints(section, wrapper, edits)`를 제공합니다. 제한값과 일괄 메시지 인코딩은 기존 `chart-point-batch.mjs`의 단일 구현을 사용하며 별도 기본 상한이나 wire를 만들지 않습니다. Native의 한도 export가 빠지면 명시적으로 거부합니다.

기존 저장 세션의 ready/uint/encodedText/memory 경계를 공유합니다. 중복 point, 값 크기 초과와 수명 만료는 native 쓰기 전에 거부합니다. 이 facade 연결은 차트 장면·rich text·모든 차트 편집의 완료를 뜻하지 않습니다.

`node --test tests/hwpx/chart-batch-facade.test.mjs`에서 한도·인코딩·호출 인자·중복/초과/ABI 부재/폐기 검사를 실행합니다. 게시 대상 HEAD 사본에서는 두 메서드 부재로 실패하고 이 변경만 적용한 뒤2건 통과하는 것을 확인했습니다. native 배치 알고리즘 자체의 검증과 구분합니다.

후속 실제 WASM 연결에서도 HEAD 사본의 HWPX parashape load/enable/Canvas 선택 검사를 실행했습니다. 수정 전에는 `editor.chartPointBatchLimits is not a function`으로 열기가 실패했고, 이 facade 변경 후 `canvas-selection-affinity.test.mjs`가1건 통과했습니다. 해당 검사는 명시 `HWPJS_TEST_WASM`이 필요하며 DOM 대역/실제 WASM의 연결 증거입니다. 실제 브라우저·모든 차트 표시 동치 증거로 확대하지 않습니다.

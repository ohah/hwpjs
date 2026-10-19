# HWPX 차트 API 책임 경계

`js/hwpx-chart-api.mjs`가 차트 ABI 호출·값 바이트 한도·결과 해독·output_free를 소유한다. 상위 hwpx-editor는 같은 인스턴스의 wasm/memory와 ready/uint/encodedText를 주입한다. 차트 값이나 이력을 별도 cache로 소유하지 않으며 getter/setter를 실행하기 전에는 선택적 차트 ABI를 호출하지 않는다.

기존 공개 메서드는 chartPoints/chartNodes/chartSites/chartSeriesText/setChartSeriesText/setChartNumericPoint/setChartPoint다. 기존7메서드와 chartPointBytes의 본문을 그대로 이동한 분리 단계에서는 공개 인자·결과·오류·호출 순서·UTF-8/native 한도·legacy numeric-only fallback을 바꾸지 않는다. 상위 편집기의 close 이후에도 동일한 ready 검사로 거부한다. detached 메서드 호출도 주입된 수명/메모리를 공유한다.

이 분리는 새 native 차트 API나 Canvas 기능의 배포 완료를 뜻하지 않는다. 후속 typed display/rich 제목/원자적 batch와 Canvas는 각 후보의 별도 검증·게시 범위를 따른다. 작업 트리의 후속 구현과 main의 공개 범위를 혼동하지 않는다.

게시 사본은 main에서 기존7메서드만 분리한 격리 source를 사용한다. primary의 수식·표·그림 등 다른 editor 변경을 포함하지 않는다. 별도 native/API 후보 사본과 이 refactor-only 사본도 구분한다.

격리된 기존 main 차트24파일은 현재 기본 WASM1211e561을 명시해107/107·fail/cancel/skip0·exit0(179633.8ms)으로 통과했다. 로그 `/tmp/hwpjs-chart-publish-scope.XSas2v/facade-tests.log` SHA-256은 `0d3401700fbc2d8056e1bf5badebf9f94da79b001404312f58790aa29f820e6d`다. 기존7메서드/한도 helper의 본문 byte 일치와 상위 editor의 위임 변경만 발생했음도 대조했다. 실제 참조 차트·저장/이력·독립 XML/ZIP/OLE와 Worker/Canvas 대역 범위이며 새 GUI·native API 지원 증거가 아니다. JS 문법/차이 공백 검사도 통과했다. source/runtime/default WASM·데모 서버는 바꾸지 않는다.

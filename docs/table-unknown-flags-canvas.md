# 미확정 표 플래그의 Canvas 편집 회귀

페이지 배치의 미지원과 셀 텍스트 편집 지원은 별개입니다. 미확정 TABLE 플래그를 삭제하거나 지원한 것으로 해석하지 않으며, 원본 플래그와 비대상 스트림을 저장에서 보존합니다.

`tests/hwp5/table-unknown-flags-canvas.test.mjs`는 실제 `table-bug.hwp`의 TABLE node453/1130/1796/1955에서 독립 레코드/셀 소유권으로 대표 scalar를 선택합니다. 각 표의 bit25 진단과 페이지 배치 실패를 먼저 요구한 뒤 실제 Canvas controller의 입력 이벤트가 Worker에 정확히 한 번의 원본 UTF-16 범위를 전달하는지 검사합니다.

실제 WASM의 저장 구역 전체를 독립 레코드 기대값과 비교하고 비대상 스트림·undo 원본·redo 저장본·재열기 텍스트/무편집 저장·입력 불변을 검사합니다. 공유 Canvas harness와 독립 레코드/셀 선택기를 재사용하며 테스트가 제품의 표 flags 해석기를 oracle로 사용하지 않습니다.

2026-10-19 격리 source `/tmp/hwpjs-flow-ui-publish.367rSf`에 이 테스트만 추가하고 후보 SHA256 `bacf2ef3cd5ed1b2cf5b2ffc9d50f755ae08092d4a52c9ccf6a264e936a7a9fc`로1/1·실패/skip0·exit0을 확인했습니다. 정규 editor API gate에도 등록합니다. 실제 Worker/WASM과 모사 DOM/Canvas의4대표 셀 검증이며 실제 브라우저/OS IME·전체 셀·원본 페이지 조판 동치는 아닙니다. 기존 동결 소스의 전체 gate 결과에 새 테스트를 소급해 포함하지 않습니다.

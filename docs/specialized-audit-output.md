# HWPX 전용 편집 감사 출력

`tools/hwpx-specialized-audit-output.mjs`는 자식 감사의 stdout 전송 경계만 소유합니다. 입력은 start JSON 한 줄, 거부 JSONL 0개 이상, 최종 compact 또는 pretty JSON 집계입니다. 반환값은 `{ start, refusals, summary }`이며 입력·출력 텍스트를 수정하거나 거부를 성공으로 바꾸지 않습니다.

start kind, 거부 행의 파일/구역/문단/구역 로컬 문단/오류, 중복 구역·문단, 최종 사유별 거부 수와 실제 행 수의 일치를 검사합니다. 누락·잘린 JSON·미지 행·추가 JSON·잘못된 집계를 거부합니다. 편집/이력/독립 XML 완료와 WASM hash 검증은 상위 감사의 책임입니다.

## 검증

실제 `chart.hwpx`의 전용 감사 출력에서 start 이후 전체를 하나의 JSON으로 읽던 방식이 SyntaxError를 내는 것을 재현했습니다. 자식은 정상 종료하며 17시도·4편집/독립 XML/이력 검증·13 UnsupportedFieldLabelRange 거부를 보고했습니다. 이 처리기는 거부13행과 집계를 그대로 분리합니다.

작업 트리의 상위 감사에 연결한 뒤 같은 차트의 임시 사본을 검사했습니다. 175문단 중 일반110·전용4편집, 숫자 prefix48거부·보호 결과13거부를 `partial_paragraph_prefix_support`로 보고하며 파싱 오류로 오분류하지 않았습니다. 한 파일의 통합 증거이며 전체 원본 편집 완료는 아닙니다. 기존 장기 부모는 수정 전 소스를 이미 로드한 상태이므로 결과를 소급하지 않습니다.

`node tools/run-selected-node-tests.mjs tests/hwpx/specialized-audit-output.test.mjs tests/hwpx/reference-edit-counts.test.mjs`는 5/5·실패/skip0입니다. compact/pretty 집계, 거부 없음, 거부 행/집계 불일치, 중복 좌표, 잘못된 좌표/오류, 누락/잘림/미지 행과 부분 지원을 전체 완료로 세지 않는 반례를 포함합니다.

이 독립 처리기와 테스트의 게시가 상위 감사 또는 전체 코어 변경의 게시·검증 완료를 뜻하지 않습니다. 상위 통합과 장기 실행의 현재 상세 상태는 작업 트리의 `reference-fixture-edit-coverage.md`에 별도로 기록합니다.

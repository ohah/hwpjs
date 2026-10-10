# 집중 테스트의 정확한 파일 선택

`tools/run-selected-node-tests.mjs`는 선택 파일이 모두 존재하는 정규 `.test.mjs` 파일인지 먼저 확인합니다. 비어 있는 선택·누락 경로·다른 확장자·실제 경로가 같은 중복은 자식을 실행하기 전에 거부합니다. 성공 선택 행에 실제 절대 경로 목록을 기록하고 Node 자식의 종료코드/신호/파일 수를 마지막 행에 기록합니다. dependency/source snapshot 검사는 별개입니다. 실행 명령은 [개발·검증 명령](development-commands.md)을 따릅니다.

현재 Node24.19.0 환경에서 유효한 cell-resize.test.mjs와 없는 cell-resize-controls.test.mjs를 함께 넘긴 기존 Node 명령은2/2·exit0으로 끝나는 것을 재현했습니다. 따라서 실행 성공만으로 요청한 모든 파일이 포함됐다고 주장하지 않습니다. strict selector의 누락 파일 부정 대조는 child 실행 전 MissingTestFile/exit1·stdout 없음으로 확인했습니다.

이전 `/tmp/hwpjs-scale-input-consumers-regression.log`의183/183은 실제3파일이며 셀/그림 resize 컨트롤 파일명2개가 잘못됐습니다. `/tmp/hwpjs-renderer-scale-regression.log`의191/191도 실제5파일입니다. 통과한 사례 수를 취소하지는 않지만 누락된 두 컨트롤의 집중 검증 근거로 사용하지 않습니다. 해당 주제 문서의 파일 수와 범위를 교정했습니다.

정확한 파일로 별도 재실행한 `/tmp/hwpjs-strict-selected-resize-regression.log`는 선택/셀 geometry·컨트롤/두 포맷 셀 Worker/14그림 Worker/실제 그룹 Renderer의5파일8/8, fail0/cancelled0/skip0/todo0, wrapper exit0·signalnull입니다. 이 결과는 뒤따르는 셀 배율36경로 추가 전 snapshot입니다.

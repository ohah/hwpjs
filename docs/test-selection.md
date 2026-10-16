# 집중 테스트의 정확한 파일 선택

## 중첩 runner와 게시본 선택 반례 — 2026-10-16

추가로 runner 자체를 symlink나 macOS /tmp alias 경로로 실행하면 기존 direct-invocation 판정의 URL 비교가 달라 CLI 본문을 실행하지 않고 끝나는 경계도 재현했습니다. 처음 /tmp 경로를 쓴 부정 대조의 빈 stdout은 이 별도 문제였고, 원본 runner를 realpath 경로로 다시 실행한 뒤 중첩 컨텍스트의 test-selection→test-complete code0을 구분해 확인했습니다. 판정도 realpath로 정규화하고 import 용도의 존재하지 않는 argv 경계에서는 CLI 본문을 실행하지 않습니다. 새 회귀는 실제 runner/launcher symlink 양쪽에서 pass/fail 자식과 완료 행을 검사합니다.

게시본 UI 검사에서 Node에 넘긴 document-window-controls 경로는 해당 main snapshot에 없었습니다. 실제 실행된3개 검사 결과는 유지하지만 누락된 컨트롤러 검증 근거로 사용하지 않습니다. 작업 트리의14검사와도 구분합니다. 게시 snapshot에서 존재하는 정확한 두 파일로 다시 실행해3/3·exit0을 확인했습니다. 이후 집중 실행은 기존 strict selector를 사용합니다.

새 반례에서 node:test 내부의 spawn이 NODE_TEST_CONTEXT=child-v8을 물려받으면 별도 --test runner가 정상 실행되지 않는 것을 발견했습니다. 수정 전 wrapper에 의도적으로 실패하는 단일 파일을 전달하면 test-complete code0이었고 실패 본문은 실행되지 않았습니다. 새 runner의 child 환경에서 내부 NODE_TEST_CONTEXT만 제거한 뒤 같은 반례는 실패 본문 실행·code1로 종료했습니다. 다른 사용자 환경/옵션을 지우거나 제품 동작을 바꾸지 않습니다. 셸에서 해당 내부 환경 없이 실행한 과거 검사를 일괄 무효로 해석하지 않습니다.

선택 테스트는 성공/실패 자식 실행·정확한 선택/종료 행·누락/디렉터리·realpath 중복과 symlink alias를 검사합니다. 첫 테스트 기대값의 macOS /var→/private/var 정규화 차이는 realpath 기준으로 교정했습니다. 새 selector4검사+UI disclosure1검사가 strict runner에서5/5·fail/skip/cancel0·exit0입니다. 기존506파일/native 전체 실행은 별도 이전 snapshot입니다.

`tools/run-selected-node-tests.mjs`는 선택 파일이 모두 존재하는 정규 `.test.mjs` 파일인지 먼저 확인합니다. 비어 있는 선택·누락 경로·다른 확장자·실제 경로가 같은 중복은 자식을 실행하기 전에 거부합니다. 성공 선택 행에 실제 절대 경로 목록을 기록하고 Node 자식의 종료코드/신호/파일 수를 마지막 행에 기록합니다. dependency/source snapshot 검사는 별개입니다. 실행 명령은 [개발·검증 명령](development-commands.md)을 따릅니다.

현재 Node24.19.0 환경에서 유효한 cell-resize.test.mjs와 없는 cell-resize-controls.test.mjs를 함께 넘긴 기존 Node 명령은2/2·exit0으로 끝나는 것을 재현했습니다. 따라서 실행 성공만으로 요청한 모든 파일이 포함됐다고 주장하지 않습니다. strict selector의 누락 파일 부정 대조는 child 실행 전 MissingTestFile/exit1·stdout 없음으로 확인했습니다.

이전 `/tmp/hwpjs-scale-input-consumers-regression.log`의183/183은 실제3파일이며 셀/그림 resize 컨트롤 파일명2개가 잘못됐습니다. `/tmp/hwpjs-renderer-scale-regression.log`의191/191도 실제5파일입니다. 통과한 사례 수를 취소하지는 않지만 누락된 두 컨트롤의 집중 검증 근거로 사용하지 않습니다. 해당 주제 문서의 파일 수와 범위를 교정했습니다.

정확한 파일로 별도 재실행한 `/tmp/hwpjs-strict-selected-resize-regression.log`는 선택/셀 geometry·컨트롤/두 포맷 셀 Worker/14그림 Worker/실제 그룹 Renderer의5파일8/8, fail0/cancelled0/skip0/todo0, wrapper exit0·signalnull입니다. 이 결과는 뒤따르는 셀 배율36경로 추가 전 snapshot입니다.

# Canvas 편집 이력 입력

[HWPX Worker](hwpx-worker-history.md)와 [HWP5 Worker](hwp5-edit-history.md)의 native 실행 취소·재실행을 Canvas 단축키와 버튼에 연결합니다. 문단 분할·병합은 아직 미구현입니다. HWP5 software 제목의 실제 브라우저·다운로드 검증 기록은 HWP5 주제 문서가 소유합니다.

편집 세션 enable 응답의 historyAvailable=true를 확인한 경우 Ctrl/Meta+Z는 undo, Ctrl/Meta+Shift+Z 및 Ctrl/Meta+Y는 redo를 요청합니다. beforeinput의 historyUndo/historyRedo도 같은 명령 경로를 사용하며 textarea의 브라우저 자체 이력은 적용하지 않습니다.

조합·미반영 초안·splice 대기·다른 명령 처리 중에는 이력 이동을 거부합니다. 이력 요청 중 textarea는 readOnly이며 같은 문단 클릭과 입력도 차단합니다. 응답 후 renderer의 현재 native projection을 입력값에 적용하고 기존 선택을 새 길이·서로게이트 경계 안으로 제한합니다. 과거 caret 복원은 지원하지 않습니다.

native 변경 후 표시 오류는 기존 fail-closed 경로를 사용합니다. 변경 전 오류는 입력값을 보존하고 다시 입력할 수 있습니다. 파일 변경은 capability를 초기화하고 같은 세션의 고급 폼 편집은 capability를 유지합니다.

`history-controls.mjs`는 두 버튼의 활성 상태를 Canvas canHistory에서 도출하고 같은 history 명령을 호출합니다. Canvas 선택이 없는 고급 폼 편집 후에도 문서 이력을 이동할 수 있습니다. 미활성 세션·입력 대기에서는 버튼을 비활성화하며 빈 이력은 native changed=false와 안내로 처리합니다. 스택 개수나 editable 값을 JS에 복제하지 않습니다.

버튼·Canvas 집중 검사는 22/22로 통과했습니다. 클릭 직전 재검사·연속 명령 차단·close 이벤트 해제·선택 없는 이력 응답·잘못된 명령 거부를 포함합니다. 외부 실제 Chromium에서 shapeline의 `버튼😀` 입력 후 undo/redo 버튼을 클릭해 원본과 편집값 전환을 확인하고 `/private/tmp/hwpjs-history-buttons-e2e.png`를 캡처·확인했습니다. HWP5 파일로 교체하면 두 버튼이 비활성화됩니다. agent-browser의 자동 브라우저 검사이며 OS IME 검증은 아닙니다.

모사 DOM Canvas·실제 제품 Worker·기존 controls 회귀는 27/27을 통과했습니다. 키/이벤트 라우팅·조합·대기·오류·native projection 동기화를 검사합니다. Canvas 이력 응답 자체는 모사 projection이며 실제 native 이력은 별도 Worker 테스트가 검사합니다. 후속 Canvas 21/21은 외부 고급 폼 편집 뒤 capability 유지·잘못된 이력 명령 거부까지 포함합니다.

2026-10-02 외부 preview 주소의 실제 Chromium에서 shapeline에 `이력😀`를 입력하고 Meta+Z·Meta+Shift+Z·Control+Z·Control+Y를 실행했습니다. 입력값·접근성 표시의 원본 복원/재적용을 확인했습니다. 실제 다운로드한 undo ZIP은 원본 fixture와 바이트 단위로 동일하며 redo ZIP은 native editor에서 재열어 앵커 문자열과 재저장 바이트가 일치합니다. `/private/tmp/hwpjs-history-e2e.png`를 캡처하고 화면을 확인했습니다. 화면 안내의 오래된 실행 취소 미지원 문구도 수정했습니다. 자동 Chromium 키 입력이며 실제 OS 한글 IME·한컴 조판 검증은 아닙니다.

## V2 이력 예산과 단계 배포

V2를 제공하는 Native 엔진은 기본 이력 예산을 직접 결정하며 SDK는 options/stats 응답을 소비합니다. 현재 후보의 Native 기본값은 256 entries, checkpoint payload 8MiB, retained allocation request bytes 128MiB이고 checkpoint별 owned 한도 기본값은 별도 지정되지 않습니다. 이 수치는 JS heap·WASM 전체 메모리 상한이 아닙니다. 구 엔진은 협상된 V1을 유지하고 지원하지 않는 명시 V2 예산 요청은 거부합니다.

현재 후보는 Noori HWP/HWPX에서 trusted 100입력·100undo·100redo, caret·실제 다운로드·독립 CFB/XML 저장 검증과 재열기를 확인했습니다. HWP 저장은 파일 메뉴의 명시적 줄 배치 저장 동의를 사용했습니다. OS IME·한컴 조판 검증이나 성능 A/B는 아닙니다. 양형식 fast-settled와 실제 pending 중 키보드 Undo의 추가 4사례도 저장 oracle까지 확인했습니다. 실제 관측은 100개 1문자 Native 요청이었으며 다른 입력 묶음 규칙이나 인위적 stale ACK 주입 검증으로 일반화하지 않습니다. 2026-10-27 전체 Native gate는 4,900개 통과·1개 skip·실패 0개로 종료했습니다(root 4,891 pass/1 skip, text splice 9 pass). 검사 전후 소스 4,227개·픽스쳐 559개·실행 바이너리의 지문 변경은 없었습니다. 과거 실행의 부분 통과 개수를 합산하지 않았습니다. 이 결과가 운영 엔진 교체나 delta/atomic/RN 전체 완료를 뜻하지는 않습니다.

이 후보는 16회 이력 제한 해소를 위한 단계이며 전체 입력 O(n) 완료가 아닙니다. standalone V2의 `history_budget_stack.plan`은 undo entry 전체를 순회하고, commit·travel의 debug recount와 oldest revision 조회에도 스택 순회가 남습니다. 여기서 R은 보존한 이력 수이며, 단일 편집의 O(R) 비용과 N회 누적 비용을 구분해야 합니다. 매 편집의 문서 projection·복제 비용까지 포함한 전체 파이프라인의 O(n) 상한도 보장하지 않습니다.

r10 running ledger/Ring 후속은 이 순회를 줄이는 별도 후보입니다. 서로 다른 budget stack 구현의 회계·퇴출·복원 SSOT를 최종 통합해 검증해야 하며, 이 V2 단독 소스나 현재 fullgate에 새 최적화를 혼합하지 않았습니다. 사용자의 전체 O(n) 목표와 delta/atomic/RN 후속 목표는 계속 남아 있습니다.

2026-10-27 `ac196c07`의 V2 SDK·Worker·WASM을 같은 세대로 묶어 React·Svelte·바닐라 × Noori HWP5·HWPX 6조합을 실제 Chromium에서 검사했습니다. 각 조합의 trusted 100입력·100undo·100redo, caret, 다운로드, 원본 undo 바이트 일치, redo·재열기 바이트 일치와 독립 CFB/전체 XML 검증을 확인했습니다. 공개 API 화면의 실제 컨트롤에서도 load·splice·undo·redo·save·reopen·read를 실행했습니다. 사용한 브라우저는 모두 종료했습니다. 이는 OS IME·한컴 조판 동치나 전체 API 지원 검증은 아닙니다.

같은 검사에서 Noori HWPX의 100undo는 약 29초로, 대기 시간이 남았습니다. 다른 Native 검사와 브라우저가 병행된 관측이며 단독 성능 A/B로 일반화하지 않습니다. 이력 보존 제한 해소와 입력·이력 성능 개선은 별도 완료 기준으로 유지합니다. 정적 묶음의 검증·운영 전환·되돌리기 계약은 [데모 서버 모드](demo-server-modes.md)를 따릅니다.


## 실행 취소 대기 중 커서와 다음 입력

Noori HWP5·HWPX에서 공백 527개를 입력하고 문단 위치 249를 클릭한 뒤 실행 취소와 즉시 R 입력을 이어 가는 경우를 검사했습니다. 기존 화면은 커서 249를 표시했지만, 실행 취소가 복원하는 선택과 다음 입력 위치는 528이었습니다. 입력은 보존되었으나 화면이 다음 입력의 권위를 잘못 나타냈습니다.

실행 취소·다시 실행 접수 직후에는 현재 커서가 새 입력 위치가 아니라는 대기 안내를 표시하고 기존 커서 강조를 억제합니다. Native 성공 ACK 뒤 이력 선택과 현재 본문을 검증하고 DOM 선택·미리보기·실제 paint가 일치한 뒤에만 다음 대기 입력을 소비합니다. 단일 rAF나 기하 알림만으로 paint 완료를 가정하지 않습니다. Native 명령과 ACK 순서, 이력의 복원 위치는 바꾸지 않습니다.

실패·변경 없음 응답은 기존 선택을 유지하며, 요청 거부에서도 안내 상태가 남지 않도록 setter-only 상태 port를 검사합니다. IME와 반복 입력은 같은 대기 경계를 따릅니다. 문서 교체·dispose는 이전 대기 작업을 무효화합니다. 변경된 이력에서 복원 위치를 확인할 수 없으면 입력을 보존한 비권위 대기 상태로 남기며 다른 위치에 조용히 적용하지 않습니다.

정규 회귀 22개는 모델 기반 검사입니다. 별도 실제 Chromium의 HWP5·HWPX 두 사례에서 복원 위치 528의 paint 표식 뒤 R 소비, 최종 위치 529와 독립 CFB·XML 저장 위치를 확인했고 소유 브라우저와 서버를 종료했습니다. 기존 재현은 별도 운영 세대이며 동일 SDK A/B나 모든 compositor 프레임의 전수 검증은 아닙니다. 긴 입력의 backlog와 성능 개선은 별도 과제로 남습니다. 이 소스 변경만으로 운영 번들이 갱신되지는 않습니다.

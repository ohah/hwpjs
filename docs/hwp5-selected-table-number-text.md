# 표 번호 참조가 있는 구역의 일반 텍스트 편집

## 계약과 책임

선택 구역에 로컬 표 번호/이름 상호참조가 있더라도 결과 영역 밖의 일반 텍스트를 splice할 수 있습니다. 기존 대상 부재와 저장된 결과 문자열은 그대로 보존합니다. 번호·개체 ID를 재생성하거나 표시 결과를 재계산하지 않습니다. 다른 구역의 정책은 [비대상 참조 보존](hwp5-unselected-table-number-text.md)을 따릅니다.

`source_policy.validateFieldTextTransaction`은 레코드/참조 종류만 검사합니다. 공개 적격성 조회는 별도 필드 연결 검사를 수행하고, 실제 `field_splice`는 모델 거래 안에서 바인딩·제어 경계·기존 `field_result_protection`을 적용합니다. 필드 연결에서 문단 검증으로 다시 진입할 수 있으므로 source policy에서 연결 검사를 재귀 호출하지 않습니다.

현재 `cross_reference_name_apply.applyDraftRetainingObjectNumbers`는 [로컬 개체 번호 보존](hwp5-object-number-retention.md)의 공통 판정을 사용하며, 기존 책갈피 이름 결과는 원래 경로로 처리합니다. 아래 표 번호 실측은 그 하위 범위입니다. 기존 일반 결과 적용 API와 수식 정의·문단 분할/병합의 허가는 변경하지 않습니다. 외부 문서·페이지·대상 텍스트·상대 위치는 계속 거부합니다. 파생 결과 영역은 삽입 시작/끝 경계와 결과 삭제를 포함해 `ReadOnlyCrossReferenceResult`로 보호합니다.

## 분리 후보 검증

게시 후보 WASM SHA256은 `59235b1263465c623ec2c9ef338edee9b5b2ca705103f97b324f0a14eefbc7c4`입니다. main1bdd5324 이전 제품 소스와 같은 main4bc5b261에서 해당 제품 변경과 최종 주석을 적용해 ReleaseSafe5/5 재빌드했습니다. 이후 main의 두 커밋은 테스트·문서 변경이며 제품 코드는 동일합니다. 초기 검사/브라우저 후보는 `f66a6e363deaf59642e77dbbd117f35576542757b4e7948680165acb1796dc10`이며 새 산출물과 검증 기록을 구분합니다.

실제 `hwpspec.hwp`의 2/3번 구역과 실제 HWP5인 `hwp-3.0-HWPML.hwp`의 2번 구역에서 일반 입력·독립 전체 Section/비대상 stream·저장 재열기·undo/redo를 검사했습니다. 독립 레코드/UTF16 스캐너의147개 참조 시작·끝294지점에서 입력을 거부하고 기존 redo를 유지했습니다. 결과 문자열 삭제와 문단 분할/병합도 거부하며, 외부/페이지/텍스트/상대 위치 반례와 실제 roadmap 보호를 유지합니다.

API·수식 정의·기존 Canvas와 새 두 구역 Canvas를 합친 묶음은24/24·fail/skip0입니다. 실제 참조 문단 파생 입력의 source policy와 모델 splice/저장/재열기에 전체 부분 할당 실패를 주입한 native 집중 검사는 ReleaseSafe2/2·Debug2/2·exit0입니다. 로그는 `/tmp/hwpjs-selected-table-number.VuYP69/selected-combined-regressions.log`, `selected-native-allocation.log`, `selected-native-debug.log`입니다. 모든 명령의 실패 원자성이나 전체 native 완료를 뜻하지 않습니다.

## 실제 브라우저 검증과 최초 관측

최종 주석까지 반영한 게시 산출물은 `publication-regressions.log`의 단일 명령27/27·fail/cancel/skip0·exit0으로 재검증했습니다. 이름/종류 기준 export331개도 추가/제거 없이 동일합니다. `publication-reader-parity.jsonl`의 reference975개는 전체 읽기 JSON944동일·기존 거부5동일·HWP3범위제외26입니다. 입력 hash도 함께 대조했으며 같은 거부는 지원 성공이 아닙니다. 물리 fixture/baseline을 갖춘 HWPX 전체 실행은 별도로 진행 중이고, 시작만으로 완료로 기록하지 않습니다.

통합24개 실행 이후 새 Canvas 검사를 각 구역의0/1번 문단으로 확장해4/4·fail/skip0을 별도로 확인했습니다(`selected-canvas-four-paragraphs.log`). 실제 브라우저에서 선택한2/1 문단도 포함하지만, DOM 대역4개를 실제 Chromium 이력 갱신의 대체 증거로 사용하지 않습니다.

격리 Chromium에서 원본 업로드·보정본 동의·찾기의 세 번째 결과(표시상 구역3/문단2, native2/1) 선택·Home·한글/이모지 입력창 반영을 확인했습니다. 하지만 실행 취소 후 입력창의 기존 문자열이 유지되는 징후를 관측했고, 저장 동의 checkbox의 가림과 agent 다운로드 대기 때문에 독립 다운로드 원문 대조를 완료하지 못했습니다. native 이력 실패로 원인을 확정하거나 E2E 통과로 보고하지 않습니다. DOM 대역의 성공과 이 실제 브라우저 미확인 경계를 합치지 않습니다.

후속 실측에서 이 징후는 자동화의 역할 이름 기반 클릭이 버튼 대신 `MAIN`에 전달된 경우였습니다. 캡처 단계의 trusted click 기록은 MAIN, Worker undo 요청은 없었습니다. 실제 `#undo`/`#redo` 클릭은 요청·응답과 이력1→0→1·입력창 원문/편집문 복원을 확인했습니다. 따라서 이전 관측을 제품의 native 이력 오류로 판정하지 않습니다. 저장 동의도 별도로 스크롤한 뒤 중앙의 실제 hit target이 checkbox임을 확인하고 클릭했습니다.

게시 후보59235b12의 수동 후속 검사에서는 다운로드된 `history-diagnostic-edited.hwp`를 독립 전체 Section/비대상 stream/CFB metadata와 대조하고 strict 재열기·브라우저 재업로드의 편집문 유지까지 확인했습니다. 반복 가능한 `tools/hwp5-reference-browser-audit.mjs`는 CLI 성공 응답만으로 클릭을 승인하지 않고 실제 hit element와 trusted event의 대상까지 확인합니다. 클릭 가림·MAIN 오배송·불완전 상태·종료 응답 뒤 아직 활성인 daemon에 대한 guard 검사7/7이 통과했습니다. 최초 자동 실행의 본문 검증은 성공했으나 즉시 종료 확인 경합으로 exit1이었고, 소유 세션의 비활성 상태를 확인하는 종료 재시도 후 실행은 `browser-audit-complete.success=true`·exit0입니다. 종료 응답이나 pageCount0만으로 종료 완료를 승인하지 않습니다.

해당 자동 실행의 원본 SHA256은 `64df877f3c4accda0111ecf39d837da889741bb821b220cf61b6c126dc88364d`, 저장본은 `ce2504ee869143d0525865b592722cc63d4746d8159e9cc329c7e197ab1309fe`입니다. `browser-repeatable-fixed.log`와 임시 출력 `hwpjs-reference-browser-wNwuqh`의 edited/undone/reuploaded 스크린샷을 보존했습니다. 이는 한 원본의2/1 위치에 대한 실제 Chromium 입력·이력·동의·다운로드·재업로드이며 전체 GUI 픽스쳐/IME/조판 완료로 확대하지 않습니다.

게시 전 main 의존성에 새 도구/검사만 포함한 분리 tree `7b18ecb9e4a02559d954c39d673d5999b1241ba2`에서도 guard7/7과 실제 Chromium 전체 경로·종료를 재검증했습니다. `browser-clean-main-audit.log`는 최종 success=true·exit0이며 같은 저장 SHA256을 확인했습니다. 위치는 `/tmp/hwpjs-browser-publication.AuUO6d`, 실제 화면/저장본은 임시 출력 `hwpjs-reference-browser-2DufFF`입니다. 잘못된 같은 길이 삽입 문자열을 기대한 독립 oracle 반례도 실패해야만 통과합니다. 이 분리 실행은 작업 트리의 미게시 JS/Canvas 변경에 의존하지 않습니다.

최초2/1 제목은 원문 DocInfo의 CharShape61 글자색이 `0x00ffffff`입니다. 논리 미리보기의 흰 Canvas 위에서 글자가 잘 보이지 않는 것도 관측했습니다. 저장 색을 임의로 바꾸지 않으며 원문 배경/배치 동치는 여전히 별도입니다. 가시적인 글리프 검증을 위해 검정 글자색 CharShape40의2/12 본문에도 `--paragraph=12 --occurrence=1`로 같은 실제 입력·이력·다운로드·독립 원문 대조·재업로드를 수행했습니다. 저장 SHA256은 `5d934c5e2da051a917d0aa5693901fe283f2ed1daaf05d7bdcc28704e76e783a`입니다. `readable-body-browser.log`·후속 `readable-visible-browser.log`와 edited/undone/reuploaded 스크린샷을 보존하며, 본문 위치의 한글/이모지 표시도 직접 확인했습니다. 이 도구는 스크린샷 직전에 활성 입력 위치로 스크롤해 화면 밖 선택을 가시 검증으로 오인하지 않습니다.

스크린샷 `selected-browser-section2.png`, `selected-browser-edited.png`와 같은 후보 폴더에 진단을 보존했습니다. 브라우저 세션 `hwpjs-selected-table-number-35c54947528a`는 close 후 active=false/pid=null, 소유 서버58851도 종료했습니다. 기본 제품 WASM과 외부 데모는 교체하지 않았습니다.

## 재현 명령

`HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/hwp5-reference-browser-audit.mjs --root=/absolute/verified-source --port=58851`로 위 실제 Chromium 경로를 재현합니다. agent-browser CLI/Chrome·테스트용 Python oracle·해당 root의 원본 hwpspec.hwp가 필요합니다. 최초에 비활성인 전용 세션만 획득하며, 소유한 세션과 서버를 finally에서 종료합니다. 기본 WASM/외부 데모를 바꾸지 않습니다. `node --test tests/hwp5/browser-click-target.test.mjs tests/hwp5/browser-session-close.test.mjs`는 CLI/Chrome 없이 검증 guard의 반례를 검사합니다.

가시적인 본문 위치는 위 명령에 `--paragraph=12 --occurrence=1`을 추가합니다. `tests/hwp5/reference-browser-arguments.test.mjs`는 잘못된 옵션·위치·중복 인자가 후보 파일 접근/브라우저 실행 전에 거부되는지 검사합니다. 세 guard 파일을 함께 실행한 결과는8/8·fail/skip0입니다.

`HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwp5/selected-table-number-text.test.mjs tests/hwp5/selected-table-number-canvas.test.mjs tests/hwp5/unselected-table-number-text.test.mjs tests/hwp5/unselected-cross-reference-gate.test.mjs tests/hwp5/table-number-character-format.test.mjs tests/hwp5/normalized-distribution.test.mjs tests/hwp5/table-number-format-canvas.test.mjs tests/hwp5/formula-definition-editor.test.mjs`

`zig test src/root.zig -O ReleaseSafe --test-filter 'table number character format source validation cleans every partial allocation'`와 Debug로 검사합니다. 전체 픽스쳐 편집·번호 재계산·원본 조판 동치는 별도 목표입니다.

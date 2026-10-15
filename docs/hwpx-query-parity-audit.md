# HWPX 조회·저장 대조 감사

## 범위와 판정

`tools/hwpx-query-parity-audit.mjs`는 실제 서명으로 HWPX를 선택하고 모든 구역의 paragraphTextSnapshot/formulaCurrent 응답 전체 hash·오류와 save 응답을 두 후보 사이에서 비교합니다. 원본 buffer/disk와 WASM 파일 hash도 확인합니다. 편집 명령이나 브라우저를 실행하지 않습니다. 명령은 [개발·검증 명령](development-commands.md)이 소유합니다.

matchedDocuments는 전후 응답이 같다는 뜻입니다. 같은 열기·조회·저장 오류는 지원 성공이 아닙니다. save의 sourceExact는 원본 ZIP과의 바이트 일치를 별도로 표시합니다. 전후 저장본이 같아도 원본과 다르면 nonExactNoOpDocuments가 증가하고 최종 exit1입니다. 저장 오류나 미완료 문서도 exit1이며 다음 파일 검사는 계속합니다. 원본 파일은 쓰지 않습니다.

## 책임과 자원 한도

- inventory는 공통 reference-hwpx-files가 소유합니다. HWP3/HWP5는 제외 수를 남깁니다.
- 문서별 worker가 순차적으로 두 후보를 열고 조회·저장을 수행합니다. 후보마다 native 세션을 닫고 GC를 요청하며 문서가 끝나면 프로세스가 종료됩니다.
- guarded-node-worker는 자기 ChildProcess만 감시합니다. 기본 RSS1024MiB·시간120000ms이며 명시적 상한을 받을 수 있습니다. V8 old-space512MiB는 WASM 메모리 전체의 하드 상한이 아닙니다.
- RSS는 ps의 소유 PPID와 함께 주기적으로 관측합니다. 상한/시간 초과 시 SIGTERM, 필요시 소유권 재확인 뒤 SIGKILL하고 실제 close를 기다립니다. 관측 사이 overshoot가 가능하므로 OS 하드 한도로 주장하지 않습니다. peak0은 측정 전에 종료됐다는 뜻이지 메모리0이 아닙니다.
- 결과 메시지 하나와 exit0·signal 없음이 모두 필요합니다. 누락/중복 메시지·비정상 종료·과다 출력은 미완료입니다. 마지막 문서·후보·단계를 기록합니다. 중단된 문서를 성공이나 포맷 오류로 바꾸지 않습니다.

## 확인한 실패 경로

모든 의존성을 포함한 main 격리 공개 묶음의 최종 결과는22파일·53/53·exit0·fail/skip0이며 위 도구와 guard/인수 회귀도 포함합니다. 실제 문서 전체 대조의 기존 저장 문제는 이 공개 묶음의 통과로 상쇄하지 않습니다.

격리 사본에서도 프로토콜·RSS/time 종료·인수 오류4/4·exit0입니다. 성공 메시지 뒤 exit1과 결과 없는 exit0도 실패로 처리했고 signal handler가 제거되는지 검사했습니다. 최초 공개 묶음의 missing inventory module 실패는 helper를 명시적으로 포함해 수정했으며 그 실패 실행을 통과로 소급하지 않습니다.

첫 bounded 참조 실행은975경로 중 HWPX436개를 모두 시도해434전후 일치·2미완료·exit1입니다.991조회 성공·InvalidFieldLinks3조회 오류·암호1개를 별도 집계했습니다. aift는 Buffer 비교 경로 자원 중단, copay_cap_tac_table_leading은 baseline save의 InvalidFormulaReference였습니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/rectangle-query-parity-bounded.jsonl`입니다.

## aift의 대형 assertion과 실제 저장 차이

동일 baseline에서 조회를 생략하고 save만 실행해도 큰 Buffer assertion 경로에서는512MiB 관측 한도를 넘었습니다. Buffer.equals와 hash/크기만 반환하도록 바꾼 별도 probe는 약147MiB에서 정상 종료했고 저장본은 원본과 달랐습니다. 따라서 처음 관측한 과다 메모리를 native save 자체의 소비량으로 단정하지 않습니다. 감사 worker도 원시 Buffer를 deep assertion으로 출력하지 않고 metadata만 비교하도록 바꿨습니다.

원본5056727바이트/저장9243288바이트이며 독립 ZIP payload 비교에서 section2.xml만4416720→4416708바이트로 바뀌었습니다. XML57852요소 중 변경은 FORMULA dirty0→1, Command/LastResult/본문의1,000,000→1e+06 네 곳입니다. 전후 후보 저장 hash는 같지만 무변경 원본 보존은 실패합니다. 이 표시 형식 문제는 셀 좌표 batching의 회귀가 아니라 baseline에서도 존재한 별도 수정 대상입니다. 원본을 잘못된 문서로 분류하지 않습니다.

원시 Buffer 대신 metadata로 비교한 aift 단독 실행은6조회·저장 응답 전후 일치, nonExactNoOpDocuments1·exit1입니다. 누락을 허용해 통과시킨 것이 아닙니다.

## 안전한 비교의 전체 결과

같은 방식의 새 전체 실행은975경로/HWPX436개 전후 응답 일치·미완료0입니다.997조회 성공·InvalidFieldLinks3/InvalidFormulaReference2조회 오류·암호1을 구분했습니다. 저장에서는 aift의 nonExactNoOpDocuments1과 copay의 InvalidFormulaReference1이 남아 exit1입니다. 모든 문서가 편집/저장 가능하다는 뜻이 아닙니다. 로그는 `rectangle-query-parity-bounded-save-outcomes.jsonl`이며 최초 자원 중단 실행을 소급해 통과시키지 않습니다.

원본 aift의 무편집 저장 변경은 HWPX implicit grouped 정수를 explicit general6 표시로 처리하는 경로와 연결됩니다. 작업 트리에는 HWPX adapter의 유한 정수만 공통 fixed0 formatter로 보내는 미게시 수정 후보가 있습니다. HWP5 explicit general6·비그룹·소수값·fixed2는 유지하며 native3/3·exit0입니다. 최초 필터가 root1개만 실행된 결과는 근거에서 제외하고 직접 root 등록 후 실제 두 회귀를 실행했습니다. 실제 aift 저장본 검증은 아직 완료하지 않았으며 batching 게시 범위에 이 표시 수정은 포함하지 않습니다.

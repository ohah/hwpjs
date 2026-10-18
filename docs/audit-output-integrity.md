# 감사 JSONL 출력 무결성

## 계약과 적용 범위

tools/audit-jsonl-output.mjs의 writeAuditRow는 JSON 직렬화 후 UTF-8 바이트 전체를 동기적으로 기록합니다. 부분 쓰기는 남은 바이트를 계속 기록하고, 진전 없음/잘못된 길이는 AuditOutputWriteFailed로 거부합니다. ENOSPC·EBADF 등 쓰기 오류는 숨기지 않고 전파합니다. 직렬화할 수 없는 값은 출력 전에 거부합니다.

현재 적용 대상은 reference-reader-parity-audit.mjs의 start/file/summary 세 종류 행입니다. 첫 행도 reader 정리용 try/finally 안에서 기록합니다. 제품 parser·WASM·JSON 데이터 계약을 바꾸지 않습니다. 다른 감사/guardian의 모든 출력 경로가 이 helper로 전환됐다는 뜻은 아닙니다.

## 재현과 완료 판정

메모 실험 WASM00c5b853 후보의 최초 읽기 대조는 exit0이었지만 start+919file의920행만 남았고 summary가 없었습니다. 전체975개 완료로 계산하지 않습니다. 해당 실행에서 어떤 OS 오류가 발생했는지는 확정하지 않았습니다.

읽기 전용 fd를 실제 stdout으로 넘긴 자식 Node에서 console.log가 오류 없이 exit0으로 끝나는 현상을 재현했습니다. 같은 fd의 writeAuditRow와 실제 reader 감사 CLI는 EBADF·exit1이었습니다. 실제 CLI에 모의 ENOSPC를 주입한 경우도 exit1이었고 원본 테스트 파일은 불변이었습니다. 부분 UTF-8 쓰기, 잘못된 진행 값, 직렬화 실패, OS 오류 전파와 기존 reader 결과/인자 회귀를 합쳐8/8·skip0·exit0입니다.

재현 명령은 HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwp5/audit-jsonl-output.test.mjs tests/hwp5/audit-reader-output-cli.test.mjs tests/hwp5/reference-reader-parity-result.test.mjs입니다. 새 출력2파일은 정규 hwp5-editor-audit에도 등록합니다. 기존 console 경로의 실제 디스크 부족 원인까지 증명했다거나 모든 Node 버전/플랫폼에서 검증했다고 확대하지 않습니다.

읽기 전수 완료는 exit 코드만으로 판정하지 않습니다. start의 inventory와 모든 file 행의 수/경로, 최종 summary의 개수·artifact hash·결과 합계를 함께 확인합니다. 같은 거부와 범위 제외는 편집 지원 성공이 아닙니다. 작은 task2070 범위는3파일 모두 일치하는 최종 summary와 exit0을 확인했습니다.

메모 후보00c5b853와6ddc76ab의 신뢰 출력 재실행(handle14418)은 exit0·stderr0바이트·977행(start/975file/summary)으로 완료했습니다. 모든 file 경로의 유일성975개와 행에서 다시 센 결과/summary의 counts·artifact hash 일치를 별도로 검증했습니다. 전체 JSON 일치944·동일 거부5·HWP3 제외26이며 근거는 /tmp/hwpjs-memo-label-probe.GvEcmM/memo-reader-parity-reliable.jsonl입니다. 앞선 불완전919개를 이 결과에 합산하지 않으며 전체 명세/편집/조판 완료로 확대하지 않습니다.

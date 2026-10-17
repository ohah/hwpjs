# 조합된 HWPX 수식 저장의 테스트 계약 수정 후보

## 재현과 원인 — 2026-10-18

이전 main 고정 소스의 전체 native 검사에서 `HWPX composed formula save derives current cells and cleans every allocation failure`가 실패하고 테스트 할당 누수가 보고됐다. 현재 main `dd32eed4`의 별도 격리 소스에서도 같은 테스트를 그대로 실행해 재현했다. probe 포함 2개 중 1개 실패, 1개 누수다.

`formula_values.zig`는 SUM·AVG의 `readScalar` 경로에서 text/empty를 제외하며 AVG의 숫자 입력이 없으면 0이다. PRODUCT는 기존 strict 숫자 읽기를 사용한다. 실패한 테스트는 SUM 대상 셀의 `bad` 문자열에 대해 여전히 `InvalidFormulaNumber`를 기대했다. 성공한 반환 버퍼를 `expectError`가 해제하지 않으므로 누수가 함께 보고됐다. 이 재현만으로 제품 저장 경로 자체의 누수라고 단정하지 않는다.

## 수정 범위

작업 트리에 있던 `paragraph_formula_save.zig`의 테스트 수정안을 main 기반 격리 소스에 적용해 검증한다. 제품 `write`/`writeWithDefinitions`와 계산기는 수정하지 않는다. SUM·AVG는 입력 `bad` 보존과 결과 캐시 0을 확인하고 PRODUCT는 오류를 확인한다. 오류를 기대하는 helper는 예상 밖 성공 버퍼도 먼저 해제한다. AVG를 helper에 넣는 부정 대조로 그 경로도 실행하고 PRODUCT 거래의 전체 할당 실패 주입을 검사한다.

Debug·ReleaseSafe 집중검사는 각각 probe 포함 2/2, 실패·skip·누수 0이다. 이전 fef4b71d 고정 소스의 전체 실행은 4,040개 중 4,038통과·1skip·1실패, 로그 오류1·테스트 누수1·exit1로 종료했다. 유일 실패가 이 수정 전 기대값이며 skip은 별도 환경변수로 실행하는 mixed character property OOM shard 선언이다. 새 차트 후보의 전체 감시 실행도 수정 전 테스트를 포함한다. 이후 집중검사 통과로 전체 실행을 소급 통과 처리하거나 실행 중인 소스를 바꾸지 않는다.

집중 재현 명령은 `zig test src/root.zig -O ReleaseSafe --test-filter 'composed formula save'`이며 Debug도 같은 필터를 사용한다. 이번 격리 검증은 동일 테스트 모듈만 import하는 probe로 실행했으며 전체 root 통과의 증거가 아니다.

후속 main `601e0091`의 src만 별도로 추출하고 이 테스트 변경만 적용한 probe에서도 Debug·ReleaseSafe 각각 2/2·실패/skip/누수 0으로 재확인했다. 차트 native 통합과 독립된 재검사이며 실행 중인 수정 전 전체 바이너리를 교체하지 않았다.

# 공유 수식 문법의 MAX 회귀 기대값

분리 native 바이너리 `7d6551a7c43ea8996dc53a006ce01a76f2fa18fa0a6763ff6cdce1b1a98c3d70`의 표준 runner index586에서 `formula_command_plan` 검사가 실패했습니다. 공유 문법은 MAX를 `.maximum`으로 해석하지만 테스트는 UnsupportedFormulaExpression을 기대했습니다. 실제 성공 Plan의 command/formula/display 버퍼3개가 expectError에서 해제되지 않아 logs3/leaks3도 보고됐습니다. 제품 prepare의 실패 경로 누수로 단정하지 않습니다.

`formula_expression.zig`와 `formula_command_plan.zig`의 오래된 음성 기대값을 MAX 양성/ MEDIAN 음성 대조로 바꿉니다. 성공 Plan은 기존 `deinit`으로 해제하고 문법 종류·명령·표시 문자열을 확인합니다. 제품 파서/평가기와 지원 정책, 기존 할당 실패 순회는 바꾸지 않습니다. MAX의 실제 셀 계산·모든 문서 수식 지원을 이 세부 검사로 대신하지 않습니다.

이 실패와 별개로 같은 바이너리의 index619 연결선 실제 문서 검사가 새 프로세스에서도4096MiB 관측 한도를 넘었습니다. 앞선 단일 전체 native 실행의13.6GiB RSS 증가를 MAX 테스트의 작은 버퍼3개로 설명하지 않습니다. 자원 원인과 전체 gate는 별도로 조사합니다.

HEAD 의존성에 두 테스트 변경만 적용한 별도 디렉터리에서 ReleaseSafe 집중4/4(root 포함)·실패/누수0·exit0입니다. fmt도 통과했습니다. 전체 native 통과나 HWP5 생성 표 작성의 완료 검사와는 구분합니다.

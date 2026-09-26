# Zig 0.16 테스트 stderr와 `failed command` 표기

이 프로젝트에서 `zig build test --summary all`이 종료 코드 0, 전체 빌드 단계 성공, 전체 테스트 통과인데도 출력 중간에 `test` → `run test w` → `failed command: .../test --listen=-`가 나타났습니다. **이 조합의 문구만으로 테스트 실패라고 판정하지 않습니다.** 반대로 종료 코드가 0이 아니거나 테스트 실패·충돌·시간 초과가 보고되면 이 설명으로 덮어서는 안 됩니다.

로컬 `zig version`은 `0.16.0`입니다. 같은 설치본의 `lib/std/debug.zig`에서 `std.debug.print`는 stderr에 씁니다. `lib/std/Build/Step/Run.zig`의 `evalZigTest`는 모든 테스트가 끝나고 자식이 정상 종료한 경우에도 누적된 stderr를 `result_stderr`에 보존한 채 성공 결과를 반환합니다. `lib/compiler/build_runner.zig`의 `makeStep`은 단계 성공 여부와 별도로 stderr가 있으면 `printErrorMessages`를 호출합니다. 이 경로의 `printStepFailure`는 테스트 결과가 성공이고 stderr가 남은 경우 `w`를 표시하며, 기본 verbose 출력은 남아 있는 실행 명령을 `failed command:`라는 레이블로 출력합니다. 이 레이블이 그 단계의 최종 상태를 덮어쓰지는 않습니다. 실제 프로젝트의 `src/hwpx/package_tests.zig` 등 corpus 테스트는 통계를 `std.debug.print`로 남깁니다.

독립 재현에서는 별도 임시 Zig 빌드에 `std.debug.print("diagnostic stderr from a passing test\n", .{}); try std.testing.expect(true);` 한 테스트를 넣고 `zig build test --summary all`을 실행했습니다. 종료 코드 0·3/3 빌드 단계·1/1 테스트 통과와 함께 `run test w`, 해당 진단문, `failed command:`가 나왔습니다. 같은 테스트에서 **출력문만 제거**한 뒤 재실행하면 종료 코드 0·3/3·1/1은 그대로이고 두 문구는 사라졌습니다. 반대로 stderr 출력은 유지하고 `expect(false)`로 바꾸면 종료 코드 1·실패 단계 1개·0/1 테스트 통과가 보고됐습니다. 임시 파일과 생성 캐시는 실험 후 삭제했습니다. 이 재현과 Zig 소스 경로가 반복 관측된 로그의 원인을 설명하며, 개별 문서·필드의 의미 정확성까지 증명하지는 않습니다.

검증 결과를 기록할 때는 프로세스 종료 코드, 빌드 단계 및 테스트 pass/fail/crash/timeout 수를 함께 적습니다. stderr의 진단을 잃지 않기 위해 corpus 출력을 무조건 숨기거나 `failed command:` 문자열만 필터링하지 않습니다.

적대적 확인 경계는 (1) 프로젝트의 실제 `std.debug.print` 호출과 출력 내용 대조, (2) Zig 0.16 러너의 정상 종료·stderr 보존 경로, (3) 성공 테스트+stderr 독립 재현, (4) 출력문만 제거한 반례, (5) stderr를 유지한 실제 실패 반례의 비영 종료 코드입니다. 이 결론은 확인한 Zig 0.16 설치본과 관측 로그에 한정하며, 다른 버전의 러너나 앞으로 나올 모든 `failed command:` 문구에 자동 적용하지 않습니다.

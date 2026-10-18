# 현재 main 소스의 전체 native 실행

## 소스와 빌드

`/tmp/hwpjs-native-group-current.TKXcyl`의 추적 src2,635개 Git blob을 ab811f17과 전수 대조해 모두 동일함을 확인했습니다. 무관한 작업 트리 변경은 가져오지 않았습니다. ReleaseSafe 전체 빌드 `zig test src/root.zig -O ReleaseSafe --test-no-exec -femit-bin=.../native-safe`는 `native-safe-build.log`가 비어 있고 exit0입니다. 바이너리 SHA256은a80d8cc6d1070542c826439d8ac169d46e816362339b8d8a4c01582449a1177b입니다.

이전 `/tmp/hwpjs-native-main-current.YkuRnv` 빌드는 NoSpaceLeft·exit1로 종료했습니다. 그 실패의 실행 결과나 부분 산출물은 현재 빌드와 합산하지 않습니다. 현재 빌드의 기본 WASM/외부 데모 반영도 없습니다.

## 실행 범위

`native-full-guard.jsonl/.stderr`에서4,114개 inventory의0..4114 전체 범위를 batch1·seed0x485750·4,096MiB guardian으로 시작했습니다. HWPJS_CHARACTER_FAILURE_START=0/HWPJS_CHARACTER_FAILURE_END=1을 명시했습니다. 해당 문자 속성 실패 shard는0번 한 지점이며 전체56,136개 실패 지점 전수와 같지 않습니다. 나머지 개별 테스트의 범위를 이 환경변수로 줄이지 않습니다.

실행은 아직 진행 중이며 전체 완료/성공으로 세지 않습니다. 관측 타임아웃만으로 재시작하지 않고 실제 PID/CPU와 로그를 확인합니다. [구형 고정 바이너리](native-prefix-coverage-current.md)의 구간 완료, 다른 소스의 집중 Safe/Debug 통과, 이 실행의 부분 완료를 하나의 성공 수로 합산하지 않습니다. 전체 native 결과도 브라우저·원본 조판·모든 편집 명령 완료를 대신하지 않습니다.

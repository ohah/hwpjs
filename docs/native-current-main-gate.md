# 현재 main 소스의 전체 native 실행

## 소스와 빌드

`/tmp/hwpjs-native-group-current.TKXcyl`의 추적 src2,635개 Git blob을 ab811f17과 전수 대조해 모두 동일함을 확인했습니다. 무관한 작업 트리 변경은 가져오지 않았습니다. ReleaseSafe 전체 빌드 `zig test src/root.zig -O ReleaseSafe --test-no-exec -femit-bin=.../native-safe`는 `native-safe-build.log`가 비어 있고 exit0입니다. 바이너리 SHA256은a80d8cc6d1070542c826439d8ac169d46e816362339b8d8a4c01582449a1177b입니다.

이전 `/tmp/hwpjs-native-main-current.YkuRnv` 빌드는 NoSpaceLeft·exit1로 종료했습니다. 그 실패의 실행 결과나 부분 산출물은 현재 빌드와 합산하지 않습니다. 현재 빌드의 기본 WASM/외부 데모 반영도 없습니다.

## 실행 범위

`native-full-guard.jsonl/.stderr`에서4,114개 inventory의0..4114 전체 범위를 batch1·seed0x485750·4,096MiB guardian으로 시작했습니다. HWPJS_CHARACTER_FAILURE_START=0/HWPJS_CHARACTER_FAILURE_END=1을 명시했습니다. 해당 문자 속성 실패 shard는0번 한 지점이며 전체56,136개 실패 지점 전수와 같지 않습니다. 나머지 개별 테스트의 범위를 이 환경변수로 줄이지 않습니다.

이 실행은 index3476의 필드 분할·dirty ZIP 전체 할당 실패 검사 중 PhysicalFootprintLimitExceeded로 종료했습니다.0..3476 배타 범위의3,476개 결과는 status/logs/leaks0이고,3476번은 테스트 결과를 반환하기 전에 guardian이 중단했으므로 통과·단언 실패로 세지 않습니다. physical current/peak4,339,568,072바이트가4,294,967,296바이트 한도를 넘었으며 guardStopped=true·wrapper exit1입니다. 소유 guardian/runner/native 자식의 종료도 확인했습니다. 전체 완료/성공이 아닙니다.

관측 타임아웃만으로 재시작하지 않고 실제 PID/CPU와 로그를 확인했습니다. [구형 고정 바이너리](native-prefix-coverage-current.md)의 구간 완료, 다른 소스의 집중 Safe/Debug 통과, 이 실행의 부분 완료를 하나의 성공 수로 합산하지 않습니다. 전체 native 결과도 브라우저·원본 조판·모든 편집 명령 완료를 대신하지 않습니다.

## 공개 WASM 후보와 소스 대응

38dfb334의 추적 src2,635개 Git blob을 공개 API 감사에 사용한 `/tmp/hwpjs-unknown-anchor-probe.1MV5w4/src`와 별도로 전수 대조했습니다. 보관 소스에도 정확히2,635개 파일이 있으며 누락/추가0, 정확한 blob 일치2,627, 차이8개입니다. 후보 보관본과 위 native 사본의 build.zig도 바이트 차이가 없습니다. 현재 main의 후속 build 변경까지 같은 파일이라고 확대하지 않습니다.

차이 중 여섯 파일은 formula_session_tests/formula_structure_transaction_tests/column_boundary_checkpoint_tests/column_boundary_group_extend_tests/paragraph_id_source_parts_tests/paragraph_structure_formula_tests입니다. root.zig의14행에서 시작하는 test 블록에서만 이 여섯 모듈을 import합니다. 나머지 column_boundary_joined_collect.zig와 field_structure_split.zig의 차이도 test 선언 안의 할당 실패 checker 교체뿐입니다.8개 전체 diff를 확인했으며 제품 함수의 변경을 발견하지 못했습니다. 테스트용 관측 할당자/observer·검사 범위의 차이는 유지하며 서로 다른 native 바이너리의 결과를 합산하지 않습니다.

재확인한 공개 후보 SHA256은eaaa0d2007a2e02fce27335e6218379284108e756e285d4859cad28167d0fe5f이고, 설치된 기본 WASM은cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346입니다. 이 근거는 보관된 소스와 검증 범위의 대응이지 현재 HEAD로 재빌드한 WASM의 바이트 동일성/전체 native 성공/기본 승격 증거가 아닙니다. 제품 기본을 교체하지 않았습니다.

## 장시간 반복 검사의 관측

공개 HWP5/HWPX gate가 종료된 뒤 남은 native index2507의 밑줄 배치 전체 할당 실패 검사는44,929지점을 순차 재생합니다.1,024지점마다 남기는 stderr가43,008→44,032로 증가했고 동일 PID87595의 CPU 시간이 함께 증가했습니다. 이는 전체4,114개 테스트의 완료 수가 아니라 한 테스트 안의 반복 진행입니다.

해당 PID를1초/10ms 간격으로 관측한 `/tmp/hwpjs-native-underline-87595.sample.txt`의83개 main-thread 샘플은 verifyUnderlineFailures 아래 History.applyBatch·문자 속성 투영/parseHeaderAt·Session.save/header_resource_save를 실행 중이었습니다. physical footprint5184K/peak6144K였으며 RSS와 같은 지표로 합산하지 않습니다. 짧은 샘플을 전체 실행 시간의 정확한 비중이나 완전한 무한 루프 부재 증명으로 확대하지 않습니다. 이 관측과 증가한 반복 지점은 현재 작업이 실제 검증 계산을 수행하고 있다는 근거입니다. 원본 header 재해석과 저장을 실패 주입마다 반복하는 비용은 후속 성능 조사 대상이며, 이 관측만으로 제품 캐시나 검증 범위를 바꾸지 않았습니다.

첫 sample 보고서 쓰기는 일시적 No space left on device였고, 즉시 공간/PID를 다시 확인한 뒤 같은1초 관측의 재시도로 보고서를 저장했습니다. 기존 검사 프로세스는 살아 있었으며 샘플 저장 실패를 native 테스트 실패/성공으로 분류하지 않습니다. 추가 전수 검사나 브라우저는 실행하지 않았습니다.

## 필드 분할 실패 주입의 메모리 보강

3476번 중단 뒤 `paragraph_split_session_tests.zig`의 일반 std.testing.allocator 기반 실패 주입4곳을 기존 `testing/allocation_failures.zig`의 check로 연결했습니다. 이 공통 구현은 같은 std.testing.checkAllAllocationFailures를 호출하고 safety=true·누수 회계를 유지하되 반복 할당마다 호출 스택을 보관하지 않습니다. fixture/거래 callback/원자성·ZIP 바이트·이력 단언은 그대로이며, 실제 발생하는 모든 할당 실패 인덱스를 순회합니다. 임의 지점 선택·범위 축소는 하지 않았습니다. 이미 별도 failure_backing을 쓰는 재분할 검사는 바꾸지 않았습니다. 제품 함수나 WASM은 변경하지 않았습니다.

`/tmp/hwpjs-field-session-memory.84U4nD`의 src2,635개를499d3819와 blob 단위로 대조해 위 테스트 파일만 다름을 확인했습니다. ReleaseSafe 집중 빌드 exit0·stderr0, SHA256은6fb8daca1af12152b8283774afa71d22303b2411c92eaaa1b1c9ae9cc2acf8a1입니다. 같은4,096MiB guardian의 `field-safe-guard.jsonl/.stderr`는6/6·fail/skip/logErrors/leaks0·guardStopped=false·wrapper exit0·stderr0·최대 physical60,588,416바이트입니다.6개에는 실제 실패 주입/이력3검사·공통 할당자/실패 주입2검사·root import sentinel1개가 포함됩니다. 공통 helper는 모든 실패 인덱스와 삼킨 OOM 거부를 별도 검증합니다.

Debug 집중 빌드도 exit0·stderr0입니다. `field-debug-guard.jsonl/.stderr`는 같은6개가6/6·fail/skip/logErrors/leaks0·guardStopped=false·wrapper exit0·stderr0·최대 physical18,121,064바이트로 완료됐습니다. Debug SHA256은22b5e21dac20539b38c40e3a86d6487a0b00cccc64f182582923c6d68383a34c입니다. 두 모드의 집중 결과를 이전 바이너리의3,476개와 합쳐 새 단일 전체 gate 성공으로 주장하지 않습니다. 이후 범위 재개/전체 성공은 별도 종료 근거가 필요합니다.

후속 전체 목록용 ReleaseSafe 빌드의 `native-field-safe-build.log/.stderr`는 모두0바이트이나 프로세스 exit1이고 `native-field-safe`도0바이트입니다. stderr가 비었다는 이유로 빌드 성공으로 처리하지 않으며, 이 산출물의 inventory나 테스트는 실행하지 않았습니다. 당시 디스크 여유가 약116MiB였지만 진단 부재 때문에 종료 원인을 NoSpaceLeft로 확정하지 않습니다. 루트 .zig-cache는 약22GiB이고 읽기 전용 lsof 검사에서 열린 파일이 없었으며, 아직 삭제하지 않았습니다. 새 전체 빌드/범위 재개는 미완료입니다.

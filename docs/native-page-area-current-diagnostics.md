# 쪽 영역 현재 XML 테스트의 진단 할당 범위

## 2026-10-18 게시 src의 후속 native 바이너리

기존5837cd37 바이너리의 full-guard-space-corrected.jsonl은 이전4GiB 중단 대상과 같은 original lazy installation allocation failures 테스트를 현재 인덱스3337에서 status0/log0/leak0으로 통과했습니다. 이 지점까지0..3337의3,338개가 완료됐고 다음3338에서 아래와 같이 중단됐습니다. 집중2/2를 넘어 전체 실행 문맥에서 해당 실패 주입 경계를 확인한 것이지만 전체4,096개 종료 성공이나 최신4,103개 바이너리의 결과로 바꾸지 않습니다.

bf725540 시점 게시 src와 git diff --quiet가 일치하는 분리 소스에서 ReleaseSafe 전체 native를 --test-no-exec로 빌드했습니다. /tmp/hwpjs-click-retention.Vm3dFy/native-current-safe의 SHA256은4e1e849c53fc6fbe8e89991aa82c3e58b544420ba488b945bcb86ef2285344ad, 등록 테스트는4,103개입니다. native-current-build.log의 컴파일 exit0과 native-current-inventory.jsonl의 root만0..1 범위1/1·skip/log/leak0은 빌드/runner 연결 증거이며 전체 통과가 아닙니다.

같은 바이너리의 native-current-full.jsonl/.stderr는 batch1·물리4,096MiB·expected hash 고정의 별도 전수 guardian입니다. 아래 ordered XML 테스트가 이전 실패 바이너리와 동일함을 cmp로 확인한 뒤 중복 장시간 실패 재현을 피하려고 소유 guardian93330만 TERM했습니다. 완료906개·다음906번 중 ExternalSIGTERM·exit1·guardStopped=true·peak1,071,563,928바이트입니다. 자원 초과/제품 테스트 실패가 아닌 명시적 중단이며 전체4,103개 통과가 아닙니다. 수정 후 새 바이너리로 재시작해야 하며 기존4,096개 prefix와 합산하지 않습니다.

## 순서형 쪽 영역 XML의 다섯 실패 주입 진단

ec174d05 게시 src와 diff --quiet 일치하는 수정 소스에서 전체 native를 다시 빌드했습니다. /tmp/hwpjs-page-area-ordered.Zrprql/native-full-safe의 SHA256은d3c5d9f6c0a240c0fdbab6658490c7a55a67ccc25f70a4b8b234a2e47e1c69c0이고4,103개를 등록했습니다. ordered-full-build.log의 compile exit0 뒤 ordered-full-guard.jsonl/.stderr에 기존과 같은 batch1·4,096MiB·expected hash 고정 guardian을 새로 시작했습니다(handle56210). 아래 후속 History 테스트에서 자원 중단으로 종료됐으며 현재 실행 중이 아닙니다. source/이전 binary를 덮어쓰지 않았고, 중단한4e1e849c/5837cd37의 prefix를 새 전수 성공으로 합산하지 않습니다.

이 실행은0..3345의3,346개를 fail/log/leak0으로 완료했습니다. 이전 문제였던 lazy installation과 ordered XML 테스트도 현재3344/3345에서 status0입니다. 다음3346 `page area public ordered merge History ZIP transaction fails atomically`에서 관측 peak4,310,486,400바이트가4,294,967,296바이트 기준을 넘어 guardian이 중단했습니다. exit1·guardStopped=true이고 마지막 child88049의 종료를 확인했습니다. 전체4,103개 통과나 새 메모/계산 결과 후보의 전체 native 결과가 아닙니다.

후속 중단 파일 `page_area_history_failure_tests.zig`는 저장 불변 관찰에도 std.testing.allocator를 사용하며 같은 할당자로 전체 실패 주입을 반복합니다. 작업 트리에 이미 있던 checked_allocator observer·공통 allocation_failures helper 전환은 callback·단언·입력·전체 실패 주입을 유지하는 변경임을 diff로 확인했습니다. 별도5df653c5 기반 소스 `/tmp/hwpjs-page-history-diagnostic.0szIEF`에서 이 파일만 반영해 검증했습니다. ReleaseSafe43cceccac8e07b003bd54367318da4defdb98e9ca71525fb36ffdae4e0fe1fe3은 같은4,096MiB guardian에서2/2·fail/skip/log/leak0·exit0·guardStopped=false·관측 peak16,269,672바이트입니다(`history-safe-guard.jsonl`). Debuga0836a45a166954f1a2b28e3ae2b29511264dd547dcbe80a702dface4d168727도2/2·같은 오류/누수0·exit0·guardStopped=false·peak8,077,648바이트입니다(`history-debug-guard.jsonl`). 검증 후 기존 작업 트리 변경을 채택했으며 새 작성이나 제품 메모리 절감으로 주장하지 않습니다.

원인 대조는 실패했던 ec174d05 소스의 별도 사본 `/tmp/hwpjs-history-same-source.IENwSM`에서도 수행했습니다. Git blob hash로 src2,630개를 대조해 위 테스트 파일만 다르고 다른 모든 소스가 같음을 확인했습니다(`source-proof.json`). 제품 소스가 바뀐 뒤 우연히 통과한 경우를 구분하기 위한 대조입니다. 해당 ReleaseSafe979e9034e3976c85126d157585ea1a376ff2e56481178aa7cb2a351ab74dc7ca는2/2·fail/skip/log/leak0·exit0·guardStopped=false·peak16,236,904바이트입니다(`safe-guard.jsonl`). 관측자는 실패 주입 대상과 분리하되 안전/누수 검사는 유지하고, 공통 helper는 기존 std.testing.checkAllAllocationFailures로 전체 실패 지점을 그대로 검사합니다. 기존3,346개 prefix와 이 집중 결과를 합산하지 않습니다.

반영된5fee5965 게시 src와 git diff --quiet가 일치하는 별도 소스에서 전체 native 바이너리를 compile exit0으로 빌드했습니다(`native-full-build.log`, `/tmp/hwpjs-page-history-diagnostic.0szIEF`). SHA-256은26723ae6af5aedc3285bbd7e489967ee4977cd22c4951c1700d0e1831bfd2ef2, inventory는4,109개입니다. `native-current-inventory.jsonl`은 root0..1의1개만 통과한 연결 검사이며 전체 결과가 아닙니다.

후속 문제를 먼저 찾기 위해 같은 새 바이너리의3340..4109 범위를 batch1·4,096MiB·expected hash 고정 guardian으로 실행 중입니다(`native-tail-guard.jsonl/.stderr`). 이 범위는 반영된 지연 설치/ordered XML/History 테스트와 그 이후를 포함합니다. 이전4,103개 binary의 결과나 다른 집중 바이너리의 통과를 새 소스의 전수 성공으로 옮기지 않습니다. 새 바이너리의 나머지 범위 검증도 아직 필요합니다.

5837cd37 전수의 다음3338 page area ordered pieces preserve alternating source run styles and single declarations에서 물리 peak4,298,231,168바이트가 기준4,294,967,296바이트를 넘어 guardian이 종료했습니다. 기존 guardian/batch/child 종료를 확인했습니다. source의 std.testing.checkAllAllocationFailures(std.testing.allocator, ...) 다섯 호출은 검증/쪽 영역 XML/문단 XML/두 병합 경계를 검사합니다. 제품 함수·callback·입력·단언·전체 실패 지점은 바꾸지 않고 기존 testing/allocation_failures.check로 모두 전환했습니다. 작업 트리에 이미 있던 정확히5줄 전환을 분리 소스에서 검증 후 채택했으며 새 작성으로 주장하지 않습니다.

/tmp/hwpjs-page-area-ordered.Zrprql의 Safe22d1f2ef04f20da8396b85fd96a4f5f0d7eed2e648065b19c53577a51f78080f는 root 포함2/2·fail/skip/log/leak0·exit0·guardStopped=false·peak48,267,648바이트입니다. Debug4a78f67da6cee752743a484cabc9e829a4b0445e6432c22d5c7d690b25397c9a도2/2·같은 실패/누수0·exit0·guardStopped=false·peak14,696,784바이트입니다. 동일4,096MiB guardian과 expected hash를 사용했고 근거는 ordered-safe-guard-retry.jsonl·ordered-debug-guard-retry.jsonl입니다. 최초 ordered-*-guard 실행은 분리 tools 경로 부재로 native 시작 전 실패했으므로 통과에 합산하지 않습니다. 변경 파일은 검증 소스와 작업 트리가 cmp 일치하며 전체 native 통과/제품 메모리 절감/파서 기능 확대를 의미하지 않습니다.

## 재현과 변경 범위

이전 개체 번호 보존 스냅샷의 전체 native 바이너리 `3e781bafcb0668d5111122ccf47ae55e8ce8c06e3d7e5a3d00de8ecd66950d74`는4,087개 중 인덱스0..3313의3,314개를 완료했습니다. 완료 결과의 실패·오류 로그·누수는0입니다. 다음 인덱스3314 `page area current XML saves real owner relocation with nested prior edits`에서 물리 footprint4,313,533,872바이트로4,096MiB 감시 기준을 넘어 guardian이 소유 프로세스를 종료했습니다. 최종 exit1·guardStopped=true이며 전체 native 통과가 아닙니다. 해당 native 및 guardian/batch 프로세스의 종료도 확인했습니다.

테스트는 실제 `headerfooter.hwpx`를 열어 본문과 머리말/꼬리말의 선행 편집을 적용하고, 쪽 영역의 위치2/4·저장 XML·독립 재파싱·잘못된 순서 거부·모든 쓰기 할당 실패를 검사합니다. `page_area_current_xml.zig`의 제품 함수는 변경하지 않습니다. 테스트 바깥 수명은 기존 `testing/checked_allocator.run`, 실패 주입은 기존 `testing/allocation_failures.check`로 분리합니다. 두 공통 도우미가 안전 검사·누수 검사를 계속 담당하며 테스트별 allocator 정책을 새로 만들지 않습니다. 기존 실패 주입 callback·인자·전체 실패 인덱스·단언·fixture는 유지합니다. 한도 상향이나 테스트 제외가 아닙니다.

## 대조 근거

`7f02026c` 기반 별도 스냅샷에서 위 테스트의 진단 범위만 바꿔 컴파일했습니다. ReleaseSafe 집중 바이너리 SHA256은 `5b7f6fe8c7bf49f4841af783884837ad7bbb585a00164d99eeb062c95356a9fa`입니다. 같은4,096MiB 관측 기준에서 root 선언 포함2/2·fail/skip/log/leak0·exit0·guardStopped=false, 관측 peak7,487,824바이트로 끝났습니다. 로그는 `guard-safe-retry.jsonl`입니다. 최초 실행은 분리 스냅샷에 로컬 guardian 파일이 없어 native 시작 전 실패했고, 실제 workspace guardian의 절대 경로를 지정해 재실행했습니다. 최초 실패를 테스트 통과로 계산하지 않습니다.

Debug 집중 바이너리 `179ccd4aa22e180ad4ac1522575fadc9221baa63a1f0986572c41b834dfb701c`도 같은 기준에서2/2·fail/skip/log/leak0·exit0·guardStopped=false, 관측 peak4,309,328바이트로 끝났습니다(`guard-debug.jsonl`).

별도 제품 ReleaseSafe 빌드도5/5·exit0입니다. 소스 대조는 test 선언 앞의 제품 함수 원문이 byte-exact 동일함을 확인하고, allocator 수명 래퍼/실패 주입 호출만 정규화하면 테스트 본문 전체가 이전 버전과 동일함을 확인했습니다. 원문 보존·재파싱·순서·실패 주입 단언을 줄이지 않았습니다.

원래 전체 바이너리와 수정한 집중 바이너리는 다르므로 이2개를 기존3,314개와 합쳐 전체 통과로 집계하지 않습니다. 관측 수치는 샘플링된 테스트 진단 비용이며 제품 편집의 메모리 상한·단일 장수명 native 프로세스 gate 완료를 뜻하지 않습니다. 최신 전체 native 재검증은 별도입니다.

후속 전체 native 바이너리 `2e3ae5ac4a18bc4b094261d72870dfa13fd5032073d2e566fc0bf9b2f942f5c3`는4,090개입니다. 최초 시작은 분리 스냅샷의 참조 fixture 경로가 빠져 실제 문서 테스트가 실패/skip했고 설정 오류를 확인한 뒤 guardian을 명시적으로 중단했습니다(`full-guard.jsonl`,ExternalSIGTERM·exit1). 이 중단은 제품 자원 초과나 전체 통과가 아닙니다. 참조/legacy 경로를 실제 입력에 연결한 같은 바이너리의 `full-guard-corrected.jsonl`은 인덱스0..3325의3,326개를 실패/로그/누수0으로 완료한 뒤 종료됐습니다. 다음3326 `page area original lazy installation allocation failures retain prior source edits`에서 관측 peak4,304,162,224바이트가4,294,967,296바이트 기준을 넘어 guardian이 중단했습니다. exit1·guardStopped=true이며 전체 통과가 아닙니다. guardian/batch/소유 test PID의 종료도 확인했습니다.

새 중단 지점은 `page_area_session_tests.zig`의 실제 headerfooter 원본/선행 편집을 준비한 뒤 `std.testing.checkAllAllocationFailures(std.testing.allocator, ...)`를 수행합니다. 해당 파일은 중단 바이너리 소스와 별도 게시 소스에서 byte-exact 동일함을 확인했습니다. 아래 집중 대조로 테스트의 실패 주입 진단 할당 경로를 수정했습니다. 위4,090개 바이너리는 이후의 HWP5 소속 인덱스/필드 진단/API/UI 변경을 포함하지 않으므로 최신 main 전체 native 검증으로 해석하지 않습니다.

## 원본 쪽 영역 지연 설치의 실패 주입

작업 트리에 이미 있던 해당 테스트의 공통 `allocation_failures.check` 교체 한 줄을 별도 `4a96f589` 기반 소스 `/tmp/hwpjs-page-area-lazy.B8hUf1`에서 검증했습니다. 전체 파일은 HEAD의 원문에서 이 호출만 교체한 결과와 동일합니다. 실제 fixture·선행 편집·실패 주입 callback/인자·단언·저장 불변 검사는 유지합니다. 제품 코드나 한도를 바꾸지 않고, 기존 helper가 안전 검사·누수 검사와 전체 실패 주입을 담당합니다. 테스트 바깥의 `std.testing.allocator`도 그대로입니다.

ReleaseSafe 집중 바이너리 `7dcbd29c370669b956f2c8207ae73c92fc12e37bc02168de49db2e03438bf611`은 같은4,096MiB guardian에서 root 포함2/2·실패/건너뜀/로그/누수0·exit0·guardStopped=false, 관측 peak34,652,520바이트입니다(`guard-safe.jsonl`). Debug `9fbb08b8c57da28582e245a6bebf1a1abea876831eb9e1c5c18d2493e940f296`도2/2·동일0결과·exit0·guardStopped=false, 관측 peak11,288,912바이트입니다(`guard-debug.jsonl`). 최초 잘못된 테스트 범위를 교체한 컴파일 산출물은 실행 전에 구분했고 위 결과에 포함하지 않았습니다.

이 대조는 재현된 메모리 증가가 테스트 실패 주입의 진단 할당 경로에 의해 해소된다는 근거입니다. 제품 편집 메모리 최적화나 모든 누수 부재로 확대하지 않습니다. 이전3,326개와 이 집중2개는 다른 바이너리이므로 합산하지 않으며, 수정된 최신 전체 native 실행은 별도입니다. 종료된 이전 실행의 임시 `.zig-cache`233MiB만 삭제했고 원본·로그·검증 바이너리는 보존했습니다. 캐시는 재빌드로 재생성할 수 있습니다.

`72c3ab63`과 `src/` 전체가 동일한 위 분리 소스에서 전체 ReleaseSafe 바이너리 `5837cd376892f967c6cd942c6708e819fb50e4f93d3a59e0a8fc3bf4d1043adb`를 새로 컴파일했습니다. runner inventory는4,096개이며 이전4,090개 결과를 이어 붙이지 않고 인덱스0부터 같은4,096MiB guardian으로 검증합니다. 첫 시도와 재실행은 아래에서 구분하며 전체 완료/통과 판정은 아직 하지 않았습니다. JS/Worker/Canvas 전체 편집 묶음과 이 native 결과도 합산하지 않습니다.

위 실행의 첫 시도는0..811의812개 결과를 남긴 뒤 Node 로그 기록의 ENOSPC로 exit1 종료됐습니다. resource-guard-complete까지 기록되지 않았으므로 전체 자원 gate나 제품 실패로 분류하지 않습니다. 디스크 공간 확보 후 같은 바이너리/한도로0부터 full-guard-space-corrected.jsonl에서 다시 실행 중이며 첫 시도와 합산하지 않습니다. 별도의469개 편집 묶음은 성공 종료했지만 이 native 재실행과 범위가 다릅니다.

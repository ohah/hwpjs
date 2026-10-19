# 현재 main 소스의 전체 native 실행

## 52개 수정 뒤의 새 전체 재검사 사본 — 컴파일 진행 중

게시 `6f4fe0ea3315d316c6896587db2c4f0ead5bfc59`·tree `5c51feac1fa3e5b8dde0723ad4d4f4d9ef3761d2`를 `/tmp/hwpjs-native-postfix-main.33GojG`에 새로 추출했습니다. 추적 blob7,194개를 원래 Git blob 해시와 전수 대조해 일치했습니다. legacy/hwpers gitlink1개는 커밋 식별자만 추적되며 하위 저장소 내용은 archive/검사 대상에 없습니다. 최초 blob 전수 스크립트가 이 gitlink를 일반 파일로 취급해 UnexpectedTreeEntry로 종료한 뒤, gitlink를 명시적으로 구분한 재검사로 위 분모를 확인했습니다. 제품/테스트 소스를 맞추기 위해 무관한 사용자 변경을 가져오지 않았습니다.

guardian overlay는 앞선 고정 실행에서 사용한 정확한 세 파일만 복사했고 참조 samples도 별도로 복사했습니다. 새 `zig test src/root.zig -O ReleaseSafe --test-no-exec -femit-bin=.../native-safe`는 nice10·Zig0.17.0으로 실행 중입니다(`native-safe-build.log/.stderr`). 컴파일 종료/새 바이너리 해시/실제 inventory를 확인하기 전에는 빌드 성공이나 테스트 시작·완료가 아닙니다. 이전52개 수정의 집중 결과와 새 전체 결과를 합산하지 않고, 기본 WASM/데모는 유지합니다.

## 단 소속·분할·원본 inventory의 마지막 여섯 실패

고정 전체 실행의 마지막 실패 index3687/3708/3716/3729/3740/3746도 `last-six-original.stderr`에서 모두 NondeterministicMemoryUsage·exit1(root1 pass/대상6 fail)로 재현됐습니다. source tree/문단/현재 styles를 읽기만 하고 callback 안에서 후보·배열·출력 XML을 해제하는 일곱 호출을 기존 `allocation_failures.check`에 연결했습니다. site-union의 split/merge 후보도 callback 소유 allocator로 생성/해제하며 외부 원본에는 publish하지 않는 것을 확인했습니다. 전체 실패 지점·실제 표의 소속·빈 provenance·편집 style·소유권 불일치 거부·원본 불변 단언은 유지하고 제품 함수는 변경하지 않았습니다.

`/tmp/hwpjs-native-allocator-probe.Kn255w/last-six-safe.stderr`·`last-six-debug.stderr`는 ReleaseSafe/Debug 각각7/7·exit0(대상6+root1)입니다. 변경6파일은 검사 사본과 바이트 일치하며 fmt --check·diff --check도 통과했습니다. 앞선46개와 이6개로 원래52개 실패 각각의 수정/집중 검증 근거가 확보됐지만, 구형 전체 실행 결과를 소급 통과로 바꾸거나 최신 단일 전체 native 성공으로 합산하지 않습니다. 보조 shard의 skip도 그대로 별도 범위 증거가 필요합니다.

같은 사본의 별도 prefix ReleaseSafe 제품 빌드도5/5·exit0입니다(`last-six-product-build.stderr`, WASM compile43s). 기본 WASM/데모는 변경하지 않았습니다.

## HWP5 소속·구역·그림·단 조회의 후속 여덟 실패

고정 전체 실행 index3497/3499/3572/3602/3607/3612/3614/3615는 분리 사본의 `next-eight-original.stderr`에서 모두 NondeterministicMemoryUsage·exit1(root1 pass/대상8 fail)로 재현했습니다. 후보 소유권을 확인한 열 호출만 공통 `allocation_failures.check`로 연결했습니다. 문단 소속 검사는 원문/현재 모델을 읽기만 하고, 삭제 계획/저장·그림 배열·리소스 바이트·단 선언 후보는 주입 allocator에서 만들고 callback 안에서 해제합니다. 단 소속 바인딩의 얕은 copy는 자신의 배열만 해제하며 원래 열 정보는 빌립니다. 구역 확장 바이트도 원본 수명을 빌리는 계약을 유지합니다.

`/tmp/hwpjs-native-allocator-probe.Kn255w/next-eight-safe.stderr`·`next-eight-debug.stderr`는 ReleaseSafe/Debug 각각9/9·exit0(대상8+root1)입니다. 제품 함수·실패 지점·독립 원값/그림 서명/길이/소속/원본 보존 단언은 변경하지 않았습니다. 변경8파일은 검사 사본과 바이트 일치하며 fmt --check·diff --check도 통과했습니다. `next-eight-product-build.stderr`의 별도 prefix ReleaseSafe 빌드도5/5·exit0(WASM compile45s)입니다. 기본 WASM/데모와 진행 중인 고정 전체 바이너리는 바꾸지 않았으며 현재 소스의 단일 전체 native 통과는 아닙니다.

## 필드·셀 크기·혼합 문단 후보의 후속 11개 실패

index2987/3132/3161/3233/3288/3306/3336/3361/3369/3399/3421도 `remaining-eighteen-original.stderr`에서 NondeterministicMemoryUsage로 개별 재현된 대상입니다. source/tree는 읽기 전용이고 결과/후보/clone은 callback 안에서 해제하는12호출을 기존 `allocation_failures.check`에 연결했습니다. 체크박스3132는 기존 배열의 scalar만 바꾸는 경로이고 검증용 임시 버퍼는 주입 allocator에서 생성/해제하며 기존 배열에 새 할당을 publish하지 않는 것을 set 구현으로 확인했습니다. 원본 소유 배열의 allocator는 바꾸지 않습니다. 셀 크기3233은 callback 소유 copy만 수정/해제합니다. 전체 실패 지점·후보 원자성·잘못된 소속 거부·문자/스타일/독립 저장 단언을 유지했습니다.

분리 사본의 `remaining-eleven-safe.stderr`·`remaining-eleven-debug.stderr`는 각12/12·exit0(대상11+root1)입니다. fmt가 section_save의 **테스트 코드** enum 변환2곳을 @intFromEnum→@backingInt로 바꿔, 해당 실제 배포 문서 편집/서명 거부 두 테스트까지 포함한 최종 `remaining-eleven-final-safe.stderr`·`remaining-eleven-final-debug.stderr`를 다시 실행했습니다. 두 모드 모두14/14·exit0입니다. 변경11파일의 사본 바이트 일치·fmt --check·diff --check 및 별도 prefix ReleaseSafe 제품 빌드5/5·exit0도 확인했습니다(`remaining-product-build.stderr`, WASM compile45s). 제품 저장 함수나 기본 WASM/데모는 변경하지 않았습니다.

이것으로 앞서 재현한 후속18개는 반복 provenance1·차트/OLE6·이11개로 각각 수정/집중 검증됐습니다. 고정 전체 실행의 원래 실패 행을 고치거나 단일 최신 전체 native 성공으로 합산하지 않습니다. 이후 전체 실행에서 추가된 index3497/3499 등은 별도 원인 재현/검증이 필요한 새 실패입니다. index3449는 아래에서 원래 상태값2(skip)를 재확인했으며 실패가 아닙니다.

## 차트/OLE/중첩 양식 속성의 후속 여섯 실패

`remaining-eighteen-original.stderr`에서 재현된 index2759/2767/2814/2825/2832/2907의 callback은 차트 type/object table·CFB 입출력·문서 검사 report·중첩 속성 트리를 주입 allocator로 생성하고 callback 안에서 해제합니다. 외부 세션으로 결과를 넘기지 않으므로 공통 `allocation_failures.check`에 해당 일곱 호출(중첩 속성 정상/오류 두 경로 포함)만 연결했습니다. 제품 코드·모든 실패 지점·독립 DebugAllocator 회계·truncation/원값/메타데이터/후기 오류 단언은 유지했습니다.

같은 분리 사본의 `detached-six-safe.stderr`·`detached-six-debug.stderr`는 ReleaseSafe/Debug 각각21/21·exit0입니다. 대상6개 외 같은 차트/단일 OLE/속성의 주변 회귀와 root도 포함합니다. 이는 이 여섯 모듈의 모든 테스트나 전체 native gate 성공은 아닙니다. 변경6파일은 검증 사본과 바이트 일치하며 fmt/diff 검사도 통과했습니다.

## 반복 provenance 문단 병합의 실패 주입

고정 전체 실행 index3290을 포함한 후속18개를 별도 필터로 재현한 `remaining-eighteen-original.stderr`는 대상18개 모두 NondeterministicMemoryUsage·root1개 pass·exit1입니다. 이 중 paragraph_joined_tests의 두 테스트와 공유 XML 검증 callback의 소유권을 확인했습니다. 세 callback은 source/current를 읽기만 하며 출력·clone을 주입 allocator로 만들고 callback 안에서 해제하므로 기존 `testing/allocation_failures.check`로 세 호출만 연결했습니다. 제품 코드·전체 실패 지점·문자 순서·서식·원본 불변 단언은 변경하지 않았습니다.

`/tmp/hwpjs-native-allocator-probe.Kn255w/joined-safe.stderr`와 `joined-debug.stderr`는 ReleaseSafe/Debug 각각3/3·exit0(문단 병합2+root1)입니다. 수정 파일은 검증 사본과 바이트 일치하며 fmt --check와 diff --check도 통과했습니다. 나머지17개 수정이나 최신 전체 native 통과를 뜻하지 않습니다. 실행 중인 고정 바이너리/실패 기록과 기본 WASM/데모는 보존합니다.

## BMP/GIF/ViewText 소유권과 보호 앵커의 후속 여섯 회귀

고정 실행 index1947/1989/2005/2007/2489/2494도 별도 필터로 재현했습니다. `/tmp/hwpjs-native-allocator-probe.Kn255w/remaining-six-original.stderr`는 대상6개 모두 NondeterministicMemoryUsage·root1개 pass·exit1입니다. BMP/RLE·GIF·ViewText detached report 소유권 및 보호 splice/OLE의 실제 단언 실패라고 추정하지 않고 오류 종류를 확인했습니다.

이 여섯 실패 주입 callback은 전달받은 allocator로 버퍼/후보를 만들고 callback 안에서 해제하며 원래 tree/문단을 읽기만 합니다. 따라서 기존 `testing/allocation_failures.check`에 연결하는 여섯 호출만 교체했습니다. 정상 detached 소유권 검사·별도 메모리 회계와 전체 실패 인덱스/Unicode 경계/opaque payload·실패 원자성 단언은 유지합니다. 세션으로 버퍼를 publish하는 앞선 덧말 거래의 backing 변경과는 구분합니다. 제품 코드와 공통 검사기는 변경하지 않았습니다.

중간 `remaining-six-fixed.stderr`는 비슷한 이름의 styled splice 호출을 먼저 바꿔 대상2489가 여전히 실패한6pass/1fail·exit1 기록입니다. 그 변경을 되돌리고 정확한2489의 호출만 수정했습니다. 최종 `remaining-six-final.stderr`·`remaining-six-debug.stderr`는 ReleaseSafe/Debug 각각7/7·exit0(대상6+root1)입니다. 커밋용 tree `3ce88a007096256b098d8040253f178f36a3ce16`의 변경6파일이 해당 사본과 바이트 일치하며 fmt --check·별도 prefix ReleaseSafe 제품 빌드5/5(제품 컴파일 cached)·exit0도 확인했습니다(`remaining-six-build.stderr`). 기존 helper의 OOM 누락/누수 음성 대조는 앞선 별도 근거가 소유합니다. 고정 전체 실행의 실패 행은 보존하며 이 집중 결과를 새 단일 전체 native 성공으로 합산하지 않습니다.

## 후속 11개 할당 실패 회귀의 동일 오류 재현과 수정

고정 바이너리의 index138/546/575/620/623/626/700/712/726/886/928도 각각 단독 필터 목록에 넣어 원래 소스에서 재현했습니다. `/tmp/hwpjs-native-allocator-probe.Kn255w/remaining-original.stderr`는 root sentinel1개만 pass·대상11개 모두 NondeterministicMemoryUsage·exit1입니다. 앞선 세 실패와 이름이 비슷하다는 이유로 원인을 추정해 통과 처리한 것이 아닙니다.

해당 테스트 전체를 기존 checked_allocator.run에 연결했습니다. 거래가 publish하는 버퍼의 backing과 복원/해제 backing을 일치시키며 전체 std.testing.checkAllAllocationFailures·숫자0/부재·namespace·독립 원값·원본 ZIP·이력 단언은 유지합니다. XML/표/각주/그림/자동번호 등의 제품 읽기/저장 로직은 바꾸지 않습니다. 단, Zig0.17 fmt가 character_font_patch의 enum 정수 변환2곳을 @intFromEnum→@backingInt로 치환한 표기 변경은 포함합니다.

같은 사본의 `remaining-fixed.stderr`·`remaining-debug.stderr`는 각각 ReleaseSafe/Debug12/12·exit0(대상11+root1)입니다. 기존 helper 정상/삼킨 OOM/의도적 누수 대조는 앞 절의 별도 결과가 소유합니다. 변경11파일의 fmt --check와 별도 prefix ReleaseSafe 제품 빌드5/5·exit0도 확인했습니다(`remaining-product-build.stderr`). 커밋용 tree `05943b2b0b50b8c4d83828d42c6e19166435355f`의 수정11파일은 검사 사본과 최상위 선언 사이 빈 줄 외 바이트가 같으며, 사용자 readChart 추가는 제외했습니다. 실행 중인 구형 고정 바이너리의 실패 행과 합산하거나 최신 전체 native 성공으로 바꾸지 않습니다.

## 0.17 기본 테스트 할당자의 비결정적 할당 횟수 — 세 회귀 수정

위 전체 실행의 index27 덧말 거래·133 글꼴 metric·924 생성 표 snapshot은 status1을 반환했습니다. 같은 게시 소스를 별도 filter로 실행한 `native-dutmal-focused.stderr`·`native-query-focused.stderr`에서 세 오류 모두 `NondeterministicMemoryUsage`·exit1로 재현했습니다. std.testing.allocator는 이0.17 설치에서 SafeAllocator이고, 작은 bucket의 현재 채움 위치에 따라 growingResizeBucket 성공 여부가 바뀝니다. checkAllAllocationFailures는 최초 성공 실행의 alloc_index를 분모로 삼으므로 backing의 재할당 경로가 바뀌면 대상 할당 지점에 도달하지 못한 성공을 이 오류로 거부합니다. 오류를 OOM으로 바꾸거나 무시하지 않습니다.

세 테스트 전체만 기존 `testing/checked_allocator.zig.run`으로 감싸 원본 준비·거래·복원·해제를 같은 안전 DebugAllocator에서 수행하게 했습니다. 특히 변경 값을 publish하는 덧말 거래에서 실패 주입 backing만 교체하면 allocator 소유권이 어긋날 수 있으므로 테스트 전체의 backing을 일치시킵니다. 기존 std.testing.checkAllAllocationFailures의 전체 실패 인덱스와 XML/ZIP·원값·이력 단언은 그대로이며 제품 함수는 변경하지 않습니다. 다른 native 실패의 원인까지 이 세 재현으로 확정하지 않습니다.

별도 `/tmp/hwpjs-native-allocator-probe.Kn255w`에서 세 회귀/루트 sentinel은 ReleaseSafe4/4·exit0(`allocator-probe.stderr`), Debug는 공통 checked callback 회귀까지5/5·exit0(`allocator-debug.stderr`)입니다. helper 자체 ReleaseSafe2/2는 삼킨 OOM 거부와 callback 오류 보존을 확인했고, 의도적 누수 대조는 TestAllocatorLeak·exit1로 실패했습니다(`allocator-helper.stderr`, `allocator-negative.stderr`). 누수 검사를 비활성화하지 않았습니다. 최종 커밋용 tree `60ad2fda3e4aab988b2cb185a88d6dafeedcb705`의 수정3파일이 해당 사본과 바이트 일치하며 zig fmt --check·별도 prefix ReleaseSafe 제품 빌드5/5·exit0도 확인했습니다. 진행 중인 고정 native 바이너리의 실패를 소급 통과로 고치거나 새 전체 native gate 성공으로 합산하지 않습니다. 기본 WASM/외부 데모는 변경하지 않았습니다.

## Zig 0.17 게시 소스의 root 전체 재실행 — 종료, 실패/skip 포함

공개 gate에 사용한 eddbfa8c·tree `c201fa64d85323f153b5dc691e87d131e30bbbaf`의 `/tmp/hwpjs-published-hwpx-gate.7WPrL4`에서 `zig test src/root.zig -O ReleaseSafe --test-no-exec -femit-bin=.../native-safe`를 Zig0.17.0으로 새로 컴파일했습니다. 빌드 exit0·stdout/stderr0이며 SHA256은 `21be9993e5f06ca8564a5ce9be49a9b246663bce6f3b59b0481439036236296e`입니다. 아래 구형4,114개/부분 결과를 재사용한 바이너리가 아닙니다.

`native-guard-full.jsonl/.stderr`는 이 바이너리의 실제 inventory4,118개·범위0..4118·fullInventoryCovered=true·batch1·seed0x485750·4,096MiB 관찰 한도로 시작했습니다. 시작 명령은 `env -u HWPJS_CHARACTER_FAILURE_START -u HWPJS_CHARACTER_FAILURE_END`로 범위 환경변수를 제거했습니다. 이는 단일 지점을 요구하는 mixed-run 문자 속성 보조 검사의 전수 실행을 뜻하지 않습니다. index3449는 두 변수가 없으면 SkipZigTest를 반환하며 실제 원래 상태값도2(skip)입니다. 최초 후속 목록의 status!=0을 모두 실패로 부른 분류를 정정합니다. 같은 고정 바이너리의 `shard-unset-server.jsonl/.stderr`에서도 해당 한 검사가 pass0/fail0/skip1·exit1·stderr0으로 재현됐고, 분리 사본의 `character-shard-unset.stderr`는 terminal runner에서도 root1 pass/대상1 skip·exit0입니다. skip을 성공으로 변경하거나 원래 전체 결과에서 제외하지 않습니다.

최종 complete는4,118개 모두 종료·pass4,065/fail52/skip1·logErrors/leaks0·success=false입니다. 결과 인덱스가0..4118 순서로 정확히 한 번씩 나오고 이름 중복0임을 확인했습니다. resource-guard-complete는code1/signal=null·guardStopped=false·최대 physical1,687,635,576바이트(한도4,294,967,296)이며 terminal exit1과 guardian/runner 종료도 확인했습니다. 로그 SHA256은 `1776c7fd1e7e4f5d7e40723211e459781dc019d7a1c0aae5b76b39278d8b06c3`이고 원래 바이너리 해시도 그대로입니다. 실패52개 중 앞선46개는 후속 source/집중 검증으로 수정했으며 마지막3687/3708/3716/3729/3740/3746 여섯 개는 별도 재현 대상입니다. 원래 결과를 수정 후 성공으로 덮어쓰지 않습니다.

이 종료는 전체 통과가 아닙니다. 최신 수정 소스의 단일 전체 재실행과 skip인 보조 검사의 범위 증거도 별도입니다. `src/root.zig`의 실행이며 build test에 별도로 연결된 controlled text 테스트나 모든 native 빌드 target의 완료로 확대하지 않습니다.

메모리 guardian은 게시 Git에 없는 로컬 보조 도구이므로 제품 소스에 섞지 않고 세 파일만 사본에 추가했습니다. `zig-native-footprint-audit.mjs` SHA256은 `7593186be0ac17078b440d04f62aad2f2b6a67cbf076c1512e2e6cdfd115cf1f`, `native-footprint-values.mjs`는 `8dbcb2ed523db52592d38ebc901259408f7c53509b5268e77e21948d5e1fb1da`, `native-audit-fatal-observer.mjs`는 `6e031ec9cfa8dab67a8b8c3de4d013968af2a266268d78561d27f1270624aeaa`입니다. 실행기/프로토콜·기존 helper는 게시 사본 그대로입니다. 최초 `native-full.stderr`는 guardian 부재 MODULE_NOT_FOUND·exit1이고 테스트를 시작하지 못한 진입 실패로 보존합니다. 후속 로그와 합산하거나 숨기지 않습니다. 기본 WASM/외부 데모는 교체하지 않았습니다.

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

## 남은 목록의 분할 수집 대조

같은 사본에서 원래4,114개 inventory의 index3476부터 끝까지638개 이름을 기준으로 분할 빌드를 수행했습니다. 단순 test-filter 빌드 `native-tail-safe`는 exit0이었지만 실제 inventory에는 필요한378개만 있었고260개가 누락됐습니다. 필터로 제외된 상위 테스트의 import가 수집되지 않는 경우이므로 이 바이너리로 남은 전체 검사를 실행하지 않았습니다.

보관 사본에만 import 전용 `src/native_tail_imports.zig`를 추가해 누락 모듈을 명시적으로 수집했습니다. 동일한638개 필터를 사용한 ReleaseSafe 빌드 `native-tail-imports-safe`는 exit0·signal null입니다. 원래 전체 이름과 다시 대조한 결과 필요한638개가 모두 포함되며 누락0·중복0입니다. 추가2개는 native_tail_imports.test_0/root.test_0 import sentinel이고, 컴파일 inventory는640개입니다. 제품 진입점·원래 테스트 본문·실패 주입 범위는 이 수집용 파일로 변경하지 않았습니다.

바이너리 SHA256은bd78ecd0a24a6ef7c2c03e8af92745c51db0f68065be0e2bb9535c41bb936e4a입니다. `native-tail-imports-guard.jsonl/.stderr`에 같은4,096MiB guardian·batch1·seed0x485750·명시적 해시를 적용해 직렬 실행을 시작했습니다. guardian과 자식은 nice10을 상속합니다. 실행 시작은 완료 증거가 아니며, 이640개 inventory에 대한 성공도 기존3,476개 결과와 합친 단일 전체 gate 성공으로 취급하지 않습니다. 기본 WASM 교체·캐시 삭제·브라우저 실행은 하지 않았습니다.

이 실행은0..535 배타 범위의535개가 status/logs/leaks0으로 완료된 뒤 index535의 `column two groups merge candidate is atomic under allocation failures`에서 자원 한도로 종료했습니다. physical current/peak4,321,824,152바이트·limit4,294,967,296바이트·guardStopped=true·wrapper exit1이며 소유 guardian/runner/자식의 종료도 확인했습니다.535번은 결과가 없으므로 통과나 단언 실패로 세지 않습니다. stderr의 수식 구조 할당 지점 수/두 다단 fixture 완료 문구도 테스트 오류로 분류하지 않습니다.

`column_boundary_groups_merge_tests.zig`는 작업 트리에 이미 있던 두 줄의 공통 allocation_failures.check 연결만 별도 사본에 적용했습니다. 두 callback·기본/서식 상태·원본 불변·분할/재병합·후속 입력·모든 실패 지점은 그대로입니다. src2,635개의 HEAD blob과 대조해 이 파일만 다르고 추가 파일은 위 import 수집 root뿐임을 확인했습니다. 제품 함수는 변경하지 않았습니다.

집중 ReleaseSafe `column-groups-safe` SHA256은55f2d1d1e6046319dc28e12a4b58910ecc4b7b455f8de5b481868f5637b59d0a입니다. `column-groups-safe-guard.jsonl/.stderr`는4/4·fail/skip/logErrors/leaks0·guardStopped=false·wrapper exit0·stderr0·최대 physical63,275,392바이트입니다. 실제 두 상태의 실패 주입1검사·공통 할당자 대조2검사·root sentinel1개이며, 앞선535개와 합산한 전체 gate 성공이 아닙니다.

Debug `column-groups-debug` SHA256은8ed646add285f06db5556ec63c40860ee5e2768f654eea56ef19751196819046입니다. `column-groups-debug-guard.jsonl/.stderr`도 같은4개가4/4·fail/skip/logErrors/leaks0·guardStopped=false·wrapper exit0·stderr0·최대 physical21,922,152바이트로 완료됐습니다. 두 빌드 모두 exit0이며 fmt/diff 검사와 검증 사본/작업 트리의 해당 파일 바이트 대조도 통과했습니다. 남은 전체 목록의 재개는 별도 실행으로 검증해야 합니다.

## 원본 단 그룹 확장 재개

afed750b의 src2,635개 Git blob과 같은 사본에서 남은105개를 필터링한 첫 빌드는 exit0이지만 drawing_gradient_source 검사1개가 누락됐습니다. 실행하지 않고 해당 모듈을 import 수집 root에 추가했습니다. 후속 `native-tail-after-groups-complete-safe`는 exit0·SHA256 c95a2d5cd59bea9dfc1dc5f3745df6c1d8aa3e3637d5fa8927e1d12e352d0436이며 필요한105개 포함·누락/중복0·추가 import sentinel2개로 inventory107개입니다.

`native-tail-after-groups-complete-guard.jsonl/.stderr`는 index0..15 배타 범위의15개가 status/logs/leaks0으로 완료된 뒤15번 `joined column source extension merges either adjacent owner without resetting coordinates`에서 자원 한도로 종료했습니다. physical current4,366,208,456/peak4,366,798,280바이트·limit4,294,967,296바이트·guardStopped=true·wrapper exit1입니다. stderr의 NativeRunnerClosed/SIGTERM은 감시기 중단 이후의 불완전 실행이며 단언 실패나 전체 통과가 아닙니다.

column_boundary_joined_merge_tests의 다섯 실패 주입 호출을 공통 checker로 연결했습니다. 원본 저장 불변 관측도 실패 주입과 독립적인 checked_allocator.run으로 분리해 안전성·누수 검사를 유지하고 호출 스택 추적을 끕니다. 원래 두 방향·좌표·서식·분할/재병합·원본 보존 단언과 모든 실패 지점은 유지합니다. src2,635개를 afed750b와 대조해 이 테스트 파일만 다르고 추가 파일은 import 수집 root뿐임을 확인했습니다. 제품 함수는 변경하지 않았습니다.

첫 집중 빌드의 테스트 매개변수 shadowing 오류를 수정한 뒤 재빌드가 명시적 NoSpaceLeft·exit1로 종료했습니다. joined-merge-safe는0바이트이며 실행하지 않았습니다. 디스크 부족으로 이 기록 추가도 한 번 실패했으나 기존 문서 바이트가 보존됨을 확인했습니다. 사용자 재개 요청 후 여유 약91GiB를 관측해 루트 .zig-cache는 삭제하지 않고 재빌드했습니다.

집중 ReleaseSafe `joined-merge-safe-retry` 빌드는 exit0이고 SHA256은482192789ce0e99c51bdc95cd495a20cd9e1a5229257296531f477488eed9c27입니다. `joined-merge-safe-retry-guard.jsonl/.stderr`는5/5·fail/skip/logErrors/leaks0·guardStopped=false·wrapper exit0·stderr0·최대 physical36,618,600바이트입니다. 실제 확장/재병합2검사·공통 할당자 대조2검사·root sentinel1개이며, 중단된107개 실행과 합친 전체 gate 성공이 아닙니다.

Debug `joined-merge-debug` 빌드도 exit0입니다. SHA256은4d28598a0a95582876211e07433b27d0ef488334bc5084182440e45c8cd132f4이며 `joined-merge-debug-guard.jsonl/.stderr`는 같은5개가5/5·fail/skip/logErrors/leaks0·guardStopped=false·wrapper exit0·stderr0·최대 physical14,893,392바이트로 완료됐습니다. 두 모드의 집중 결과는 별도 증거이며 남은 전체 목록의 완료나 제품 WASM 반영은 아닙니다.

## 남은 검사 목록 종료

10978ca9의 남은92개가 소속된53개 모듈을 보관 사본의 native_remaining_after_joined_imports.zig에서 모두 명시적으로 import했습니다. ReleaseSafe 빌드 exit0이며 native-remaining-after-joined-safe의 SHA256은3a490199b6295de9ea313a0c8c4b50c5ec115a0d2bef03966ea4ad493c2b4e43입니다. 이전107개 inventory의 index15부터 끝까지92개를 전체 이름으로 대조해 누락/중복0이며 추가2개는 import sentinel입니다.

native-remaining-after-joined-guard.jsonl/.stderr는94/94·fail/skip/logErrors/leaks0·guardStopped=false·wrapper exit0·최대 physical599,229,184바이트입니다. stderr의43바이트는 Switch chart corpus: 28 files, 28 wrappers 진단이고 테스트 오류가 아닙니다. 기본 WASM과 데모 산출물은 교체하지 않았습니다.

원래4,114개 이름을 기존 전체 실행의3,476개 결과, 분할640개 실행의535개 결과, 후속107개 실행의15개 결과, 이번94개 결과의 이름 집합과 대조했습니다. 원래 목록에서 누락0이며 모든 개별 결과의 status/logs/leaks0을 확인했습니다. 반복된 root/import sentinel을 중복 합산하지 않습니다. 이 이름별 교차 실행 범위 확인은 단일 최신 소스/바이너리 전체 gate 성공이 아니며 문자 속성 실패 shard의 제한도 그대로입니다. 현재 소스의 무필터 전체 재빌드와 종료 검증은 별도입니다.

## 0.16 무필터 전체 재빌드

10978ca9의 추적 src2,635개와 보관 사본의 blob이 모두 같은 상태에서 Zig0.16.0 ReleaseSafe 무필터 빌드 native-current-after-joined-safe가 exit0으로 완료됐습니다. SHA256은f17bb92ee236af46d149d8d19e512cd8ec2b069f4f8617a2b295f98d738fb33c입니다. 표준 runner의 metadata만 조회해 원래4,114개 전체 이름과 순서까지 동일함을 확인했습니다. 이 새 바이너리의 전체 테스트 본문을 실행한 결과는 아니며 전체 runtime gate 성공으로 처리하지 않습니다. 이후 요청된 별도 Zig0.17 업그레이드 검증과 고비용 작업이 중복되지 않도록 이 바이너리의 전체 실행은 시작하지 않았습니다.

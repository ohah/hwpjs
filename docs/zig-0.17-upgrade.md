# Zig 0.17 이관

## 변경 경계

`.mise.toml`은 Zig 0.17.0을 선택합니다. 로컬 설치의 `zig version`, `lib/std/lang.zig`, `lib/std/Build.zig`, `lib/std/array_list.zig`, `lib/std/zig/Server.zig`, `lib/compiler/test_runner.zig`를 실제 컴파일 오류와 대조했습니다. 외부 의존성이나 GPL/LGPL 코드는 추가하지 않았습니다.

검증은 `c9faba6652f198ce93f1690371ffcf1b493500ae`에서 만든 분리 worktree `/tmp/hwpjs-zig017.iGwHEN`을 사용합니다. 원본의 사용자 dirty/staged 코드·미게시 Zig 파일은 이 검증 대상에 포함되지 않습니다. legacy/reference 데이터·제품 기본 WASM·데모 서버를 수정하지 않았습니다. `docs/native-current-main-gate.md`와 `docs/fixture-editor-completion.md`도 이 패치의 수정 대상이 아닙니다.

## 호환성 원인과 책임

- 배열 반복 연산자 `**` 제거: 단일 원소 `[_]T{x} ** N`은 `@as([N]T, @splat(x))`로 바꿉니다. 타입이 이미 선언된 필드는 `@splat(x)`를 사용합니다. 중첩 배열은 각 차원과 원소 타입을 유지합니다. 다중 원소 패턴·문자열·타입 생략 튜플은 별도로 원소 순서·길이·포인터/배열 타입을 보존합니다. 기존 테스트 이름·실패 주입 범위·단언을 삭제하지 않습니다.
- reflection 변경: enum/struct의 `fields`가 `field_names`·`field_values`·`field_types`로 분리됐습니다. 개수만 필요한 곳은 `field_names.len`을 사용합니다. 이름과 타입/enum 값을 함께 순회하는 제품 코드는 `src/reflection.zig`가 선언 순서를 연결합니다. 테스트 전용 probe는 자신의 모듈 경계 안에서 직접 `field_names`·`@FieldType`을 사용합니다.
- 정수 타입 생성: 제거된 `std.meta.Int`는 `@Int`로 바꾸고 signedness와 bit 수를 유지합니다. 정수 바이트 읽기·쓰기의 endian이나 검증 범위는 변경하지 않습니다.
- 최적화 enum: `builtin.mode`의 size 최적화 비교는 `.small`을 사용합니다. CLI의 기존 `ReleaseSafe`/`Debug`/`ReleaseFast` 별칭은 계속 유효합니다.
- ArrayList: 기존 소유/borrowed slice로 구성하는 값에 새 `pointer_stability = .{}`를 초기화합니다. 할당자·소유권·실패 정리 정책은 유지합니다.
- 테스트 backing: 0.17의 `std.testing.allocator`는 DebugAllocator에서 SafeAllocator로 바뀌었습니다. CFB writer/read/rebuild의 전체 실패 주입에서0.16 pass·0.17 `NondeterministicMemoryUsage`를 재현했습니다. 같은 callback과 모든 실패 인덱스를 기존 `testing/allocation_failures.check`의 safety/leak-checked DebugAllocator로 재생하면 ReleaseSafe·Debug 각각 root sentinel 포함2/2로 통과합니다. 이 helper도 동일한 `std.testing.checkAllAllocationFailures`를 호출하며 실패 지점/단언을 줄이지 않습니다. 제품 CFB 동작을 변경하지 않습니다.
- 빌드 설치 경로: 제거된 `getInstallPath` 대신 `.install_bin` lazy path를 사용합니다. `installedArtifactEnvironment`와 `tools/run-with-artifact-env.mjs`가 실행 시 확정된 경로를 기존 Node 명령의 환경변수에 전달합니다. prefix를 문자열로 추측하지 않으며 공백 경로·중첩 환경·자식 실패 종료를 검사합니다.

초기 기계적 패치 생성 스크립트는 `/tmp/hwpjs-zig017-migrate.mjs`와 `/tmp/hwpjs-zig017-api-migrate.mjs`입니다. 이후 다중 원소·튜플 타입·함수 호출 길이·문자열 예외를 수동 보정했으므로 이 스크립트를 다른 dirty 소스에 그대로 재적용하는 것은 검증된 이관 절차가 아닙니다. 최종 Git 패치가 결과의 기준입니다.

## 표준 native runner

0.16.0과 0.17.0 설치의 wire 구조는 같습니다. 요청 헤더는 두 u32와 선택적 index u32입니다. metadata는 문자열 길이·테스트 개수, 이름 오프셋 배열·expected-panic 오프셋 배열·NUL 문자열 테이블입니다. 결과는 index u32와 align(4)된 flags u64이며 status 2bit·fuzz 1bit·log 30bit·leak 31bit입니다.

`tools/zig-test-protocol.mjs`의 `protocolForVersion`이 정확히 두 버전만 허용하고 같은 parser를 반환합니다. 미확인 버전은 거부합니다. 구형 고정 바이너리의 진단 기능도 유지하며 batch audit의 inventory 행에 실제 `zigVersion`을 기록합니다. 이 선택은 대체 Zig test runner를 만들거나 테스트를 우회하지 않습니다.

초기 무필터 ReleaseSafe native 빌드는 exit0·stderr0이며 SHA256은 `91a9f8192bb7acf06b503e5f90f3f1036a5eb2b42bdd9504eb7f3d46a482aee3`입니다. 이 바이너리는 포맷/CFB 테스트 backing 수정 전 산출물입니다. 0.16 기준 바이너리 `f17bb92ee236af46d149d8d19e512cd8ec2b069f4f8617a2b295f98d738fb33c`와 ordered names 4,114개가 모두 일치합니다. metadata 수집은 테스트 실행 통과가 아닙니다.

양 버전의 실제 binary에서 index0 한 개씩만 실행한 wire smoke는 각각 `range-complete`·pass1·fail/skip/logErrors/leaks0·exit0입니다. 전체4,114개 runtime·`zig build test` 완료 근거로 세지 않습니다. 전체 runtime은 공유 검증 슬롯을 넘기기 위해 시작하지 않았습니다. 문자 속성 실패 shard와 기존 전체 gate의 제한은 [현재 native 기록](native-current-main-gate.md)을 따릅니다.

0.17에서 EMF+ record 분류·JPEG 2원소 반복 패턴·BMP 4원소 반복 패턴·MaxLength2개·모델 equality3개의 실제 native 회귀8개(index1209,1843,1967,2911,2912,3173..3176 배타)를 추가 실행했습니다.8/8·fail/skip/logErrors/leaks0·exit0이며 `native-focused.jsonl/.stderr`에 남겼습니다. 이 선택 검사를 전체 inventory 통과로 확대하지 않습니다.

CFB backing 수정까지 포함한 최종 무필터 ReleaseSafe 재빌드도 exit0·stderr0입니다. `native-final-safe`의 SHA256은 `8b1d36c44c081494de01f58172548f8fc4613ceb1c7d518a15f53d8e94699679`이며 원래0.16 ordered inventory4,114개와 이름·순서가 전부 같습니다. 최종 바이너리에서 위8개와 zlib3개·CFB 읽기4개/쓰기6개·AES256 CBC NIST1개·AES128 CFB1/독립 DES4개·공통 allocator2개·DEFLATE/gzip/zlib16개를 실행해44/44·fail/skip/logErrors/leaks0·stderr0·exit0입니다. 모든 index는0이 아닌 실제 검사입니다. 초기 실패를 포함한 `native-core-focused.jsonl`은 보존하고, 수정 후 최종 근거는 별도 `native-core-final.jsonl/.stderr`입니다. 이름 선택 스크립트 `/tmp/hwpjs-zig017-core-check.mjs`는 기존 이름을 최종 inventory에 전수 매핑하며, batch1·4,096MiB 기존 guardian으로 직렬 실행합니다. 짧은 검사에서 guardian의 sampling 최대값0은 메모리 사용량0이라는 증거가 아닙니다.

`src/testing/allocation_failures_negative.zig`의 의도적 누수 대조도 ReleaseSafe에서 실행했습니다. 실제 native 프로세스는 `FAIL (TestAllocatorLeak)`·exit1이며 기대 실패를 확인한 wrapper는 exit0입니다. 함께 수집된 helper의 정상/삼킨 OOM 거부·callback 오류 보존2개는 pass입니다. 이 기대 누수 실패는 정상44개 테스트 성공과 별도로 `allocator-negative-control.log/.stderr`에 기록하며 누수 검사 기능을 끄지 않았음을 확인합니다.

## WASM과 도구 검증

포맷 후 ReleaseSafe 제품 빌드는 5/5 단계·exit0입니다. 최종 `zig-out/bin/hwpjs.wasm` SHA256은 `bdf9d992878edf47137bf0b11d86707b9dcbe3cad325eb4c9694e61e893aef06`입니다. 공개 0.16 후보 `eaaa0d2007a2e02fce27335e6218379284108e756e285d4859cad28167d0fe5f`의 335개 export 이름/종류를 모두 유지하며 컴파일러가 내보낸 `__stack_pointer` global 하나가 추가됐습니다. 함수 signature·전체 동작 동일성은 export 목록만으로 주장하지 않습니다.

최종 WASM과 위 공개 후보의 reference975파일 reader parity는944전체 JSON 응답 일치·5동일거부·26형식 범위 제외·stderr0·exit0입니다. 제외는 HWP3이며 동일거부를 지원 성공으로 세지 않습니다. 첫 포맷 전 후보 `5d700823546e128479f5b025e1fd313fa04022d8277a4606e9d577ea884c26cb`에서도 같은 집계를 확인했지만 최종 근거는 별도 `reader-parity-final.jsonl/.stderr`입니다. 이 공개 후보 대조는 두 컴파일러의 동일 소스 재빌드 비교나 편집/브라우저 검증이 아닙니다.

공백이 포함된 `--prefix '/tmp/hwpjs-zig017.iGwHEN/custom install'`에서 `hwp5-ownership-query-parity`는 7/7 단계·2/2 테스트·fail/skip0·exit0입니다. 최종 후보로 추적48파일의45열기/3동일거부·47구역·141조회·723셀과 reference3파일의3열기·3구역·9조회·54,009셀을 기존 후보/독립 셀 oracle에 대조하고 원본 저장 바이트를 보존했습니다. 이 결과는 전체 편집/실제 브라우저 검사가 아닙니다.

Node 24.20.0에서 artifact-env/protocol/native-range 집중 검사는9/9·fail/skip0입니다. 수정한 Zig 파일과 새 reflection 파일의 `zig fmt --check`, 수정 도구의 `node --check`, `git diff --check`도 통과했습니다.

동일 최종 WASM으로 `tests/hwp5/editor.test.mjs`, `tests/hwp5/history-editor.test.mjs`, `tests/hwpx/editor.test.mjs`, `tests/hwpx/history-editor.test.mjs`를 concurrency1로 실행해21/21·fail/skip0·stderr0·exit0입니다. 실제 양 형식 편집·저장·재열기, undo/redo·분기·실패 후 redo 보존·checkpoint 한도, HWP5 독립 CFB/레코드/전체 스트림 복원, HWPX 필드 dirty/원본 ZIP 복원 및 독립 Python XML/ZIP 대조를 포함합니다. HWPX의 두 파일은 분리 worktree의 `zig-out/bin/hwpjs.wasm`을 직접 읽으며 실행 전후 위 최종 해시를 확인했습니다. 집중 공개 API 회귀이며 전체 native·모든 명령·브라우저 검증이 아닙니다. 근거는 `public-edit-history.log/.stderr`입니다.

## 재현 명령과 산출물

mise 환경에서 고비용 명령은 nice10·직렬로 실행합니다. 전용 `ZIG_GLOBAL_CACHE_DIR`를 설정하면 다른 프로젝트의 캐시를 재사용하지 않습니다.

```sh
nice -n 10 mise exec -- zig build -Doptimize=ReleaseSafe -j1 --summary all
nice -n 10 mise exec -- zig test src/root.zig -O ReleaseSafe --test-no-exec -femit-bin=/absolute/native-safe
nice -n 10 mise exec -- node --test --test-concurrency=1 tests/artifact-env.test.mjs tests/zig-test-protocol.test.mjs tests/hwp5/native-test-range.test.mjs
HWPJS_BASELINE_WASM=/absolute/baseline.wasm nice -n 10 mise exec -- zig build hwp5-ownership-query-parity -Doptimize=ReleaseSafe -j1 --prefix '/absolute/custom install' --summary all
nice -n 10 mise exec -- node tools/reference-reader-parity-audit.mjs --before-wasm=/absolute/baseline.wasm --after-wasm=/absolute/candidate.wasm --root=reference/rhwp/samples
nice -n 10 mise exec -- node tools/zig-native-batch-audit.mjs --binary=/absolute/native-final-safe --batch-size=1 --start-index=3542 --end-index=3543 --expected-sha256=8b1d36c44c081494de01f58172548f8fc4613ceb1c7d518a15f53d8e94699679
HWPJS_TEST_WASM=/absolute/candidate.wasm nice -n 10 mise exec -- node --test --test-concurrency=1 tests/hwp5/editor.test.mjs tests/hwp5/history-editor.test.mjs tests/hwpx/editor.test.mjs tests/hwpx/history-editor.test.mjs
```

분리 worktree의 `native-build.log/.stderr`, `native-final-build.log/.stderr`, `inventory-016.json`, `inventory-017.json`, `inventory-final-017.json`, `protocol-016.jsonl/.stderr`, `protocol-017.jsonl/.stderr`, `native-core-final.jsonl/.stderr`, `wasm-final-build.log/.stderr`, `wasm-final-confirm.log/.stderr`, `install-path-audit.log/.stderr`, `reader-parity-final.jsonl/.stderr`, `public-edit-history.log/.stderr`를 근거로 남깁니다. 생성 캐시·바이너리·로그·reference symlink는 커밋하지 않습니다.

초기 두 번의 빌드 진입은 기본 Zig 캐시를 사용했고 이후 빌드는 전용 `/tmp/hwpjs-zig017.iGwHEN/.zig-global-cache`로 고정했습니다. 공용 캐시 삭제나 글로벌 mise 설정 변경은 수행하지 않았습니다.

## 원본 작업 트리 통합 검증

사용자 변경과 기존 staged 테스트를 보존하면서 0.17 변경만 통합했습니다. 원본 작업 트리의 별도 prefix ReleaseSafe 빌드는 6/6 단계 통과했습니다. 해당 후보 SHA256은 `f4e0f396a3fea6e6354b364ff176e31d72ed00ec643fa566c4abbd8bc2f58d77`이며, 미커밋 기능을 포함하므로 위 분리 worktree 후보와 구분합니다. 데모의 기본 WASM은 교체하지 않았습니다.

제거된 stackFallback의 호환 계층은 Zig 0.16의 MIT 고지를 보존하고 스택 우선·힙 fallback·할당 소유권을 유지합니다. 반복 바이트 생성은 별도 공통 helper로 분리했습니다. 두 helper의 실제 테스트 4개와 import sentinel 3개가 ReleaseSafe/Debug 각각 7/7 통과했습니다. 도구 회귀도 원본에서 9/9 통과했습니다. 사용자 미커밋 기능 자체는 이 업그레이드 커밋에 포함하지 않습니다.

전체 native runtime 일괄 실행은 완료하지 않았습니다. 위 집중 실행과 전체 테스트 컴파일을 전체 runtime 통과로 해석하지 않습니다.

커밋용 별도 인덱스의 소스·빌드 입력만 `/tmp/hwpjs-zig017-preserve.ADzGLJ/clean-publish`에 추출해 ReleaseSafe 빌드를 다시 실행했고 5/5 단계가 통과했습니다. 사용자 미커밋 기능이 없는 공개 소스의 빌드와 원본 작업 트리의 6/6 결과를 분리해 확인했습니다.

# 큰 문서 테스트의 할당자 진단 비용

## 체크포인트 전체 실패 주입

main143b6b2f 전체 바이너리 `ffae8b9436cb8bba4e53e7fda7289f2c09cd7c5a4cb75438e4f400a9ed667efa`의 3,957개 실행은 2,446개 완료 후 index2446 `HWPX checkpoint capture allocation failures preserve current model`에서 OS 관측 peak1,154,319,536바이트로 1024MiB 기준을 넘겨 종료됐습니다. 최종 incomplete·guardStopped=true·exit1이며 guardian/batch/native PID16552/16563/71055 부재를 확인했습니다. 느린 index889는 이후 정상 진행했으므로 해당 검사를 무한 루프나 자원 실패로 분류하지 않습니다.

main2d56f5ac 의존성의 분리 소스에서 해당 테스트의 실패 주입 호출 한 줄만 공통 `allocation_failures.check`로 연결했습니다. fixture 읽기와 session 열기·capture·exchange·save·원문 바이트 동치, 전체 실패 인덱스 및 누수 검사는 유지했습니다. 제품 체크포인트 코드는 변경하지 않았고 1024MiB 기준도 그대로입니다.

수정 집중 바이너리 `f1071bc1c17050cf256d3c5b3aac99a131bf0dfdb3632b67f32cde365df8bc90`는 root 포함2/2·fail/skip/log/leak0·exit0·관측 peak8,569,168바이트입니다. 컴파일 완료 전에 시작해 ENOEXEC로 끝난 최초 harness 시도는 검증으로 계수하지 않습니다. 집중 성공을 전체 native 완료로 대체하거나 이전 완료 수와 합산하지 않습니다. 테스트 할당자 진단 비용의 대조이며 제품 메모리 개선 주장이 아닙니다.

## 보호 문단 fixture 모듈의 선택 전수 대조

main98d0dba0 전체 바이너리 `aa6e396a49a52678dbf8e87d200679431754b7d45e07d827f4587c6f533af344`의8개 보호 문단 테스트를 표준 protocol로 각각 선택해 독립 프로세스에서 측정했습니다. seed0x485750·1024MiB 관측 기준은 유지하고 테스트 결과 뒤에도 프로세스를 닫기 전에 OS peak를 읽었습니다. 결과는5성공·3자원 초과·exit1이며, 단일 테스트/모듈 선택 검사를 전체3,957개 완료로 세지 않습니다.

| 선언의 핵심 이름 | 이전 전체 바이너리 관측 peak(bytes) | 수정 전체 바이너리 관측 peak(bytes) |
| --- | ---: | ---: |
| styled protected merge (index2427) | 1,077,544,112 | 5,783,912 |
| styled protected split (index2428) | 1,212,368,120 | 7,192,912 |
| protected merge (index2430) | 1,165,952,176 | 6,521,192 |

세 테스트만 scoped checked allocator·공통 전체 실패 주입으로 연결했습니다. 나머지5개는 수정하지 않았습니다. Unicode/서식 범위·이동한 스타일 유닛 수·양쪽 문단/원문 저장 동치·실패 원자성 등 기존 단언과 전체 할당 실패 검사는 그대로입니다. 제품 구현은 변경하지 않았습니다. styled merge를 먼저 별도로 선택한 재현에서도 peak1,216,398,560바이트로 같은 기준을 넘었으며, 중단 시점 차이를 정상 완료의 절대 메모리 비용으로 해석하지 않습니다.

수정 모듈 집중 바이너리 `624ab6438c15c53c0b3bf97a14fa80c23d43377a7138cae1f2af9a4801577624`는 root 포함9/9·fail/skip/log/leak0·exit0·관측 peak303,727,168바이트입니다. 이어 전체3,957개를 담은 수정 바이너리 `ffae8b9436cb8bba4e53e7fda7289f2c09cd7c5a4cb75438e4f400a9ed667efa`에서 같은8개를 다시 선택해8/8·실패/오류 로그/누수0·exit0을 확인했습니다. 이때 가장 큰 peak443,695,776바이트는 수정하지 않은 protected splice입니다. 위 표의 전후 수치는 모두 전체 바이너리에서 선택한 같은 테스트별 값입니다.

전후 전체 이름 배열/순서는 byte-exact 동치이며3,957개·names SHA-256 `e710a22d7cd15c1f77de2e7a7d7c4b08d2910d3d093c51a5df81ee6e3cbb5f5b`로 같습니다. 기존98d0 전수 실행은 후속3건의 자원 실패를 같은 바이너리에서 별도로 확인하고 수정 모듈을 검증한 뒤 명시적으로 종료했습니다(889완료·ExternalSIGTERM·incomplete·exit1). 관측 timeout 때문에 재시작한 것이 아니며 당시 진행 중인index889의 제품 오류나 자원 초과로 기록하지 않습니다. 종료 guardian/batch/native PID86429/86440/8598의 부재도 확인했습니다. 새 전체 검증은index0부터 다시 실행하며 이전 완료 개수/선택8개의 결과를 합산하지 않습니다.

## 빈 보호 문단 병합의 전체 실패 주입

main8df 기반 전체 바이너리 `4a611cf68060e1020465c5d22a8a2605aea4d97be7b4e90b2cca3661bea01205`는3,955개 중2,424개 완료 후 index2424 `HWPX empty protected merge allocation failures preserve insertion style and original`에서 물리 peak1,150,551,264바이트로1024MiB 관측 기준을 넘었습니다. 최종incomplete·guardStopped=true·exit1이며 종료된 native PID83874와 guardian/batch PID25510/25521의 부재를 확인했습니다. 완료 구간에는 별도로 수정한 생성 표 의미 검증의 단언 실패index874가1건 있었으므로 이 실행을 전체 통과로 읽지 않습니다. 해당 의미 회귀의 수정/공개91검사는 [수식 표시·의미 검증 경계](hwpx-preserved-formula-dependencies.md)가 소유합니다.

중단 테스트의 바깥 fixture/session 범위를 `checked_allocator.run`으로 분리하고 실패 주입은 공통 `allocation_failures.check`에 연결했습니다. 안전 검사와 누수 확인, 전체 실패 인덱스, 빈 삽입 스타일의 start/end1·char_shape_id0, 저장 XML의 charPrIDRef0 및 저장 전후 원문 바이트 동치 단언은 유지했습니다. 제품 merge/serialization 코드는 바꾸지 않았습니다.

수정 후 집중 바이너리 `1f3d3bd168b255d1b860430d39fe4ce2f090a11131e10739d87b2e5c5ca2d756`를 같은batch1/1024MiB 감시로 실행해 root 선언 포함2/2pass·fail/skip/log/leak0·exit0·guardStopped=false·peak4,555,088바이트를 확인했습니다. 이는 테스트 진단/소유 범위 차이의 대조이며 제품 메모리 사용량 개선이나 단일 장기 프로세스 gate 통과가 아닙니다. 한도를 높이거나 실패 지점/단언을 제외하지 않았고, 최신 main 전체 root 재실행은 별도로 필요합니다.

표 생성의 빈 상태/원문/전체 실패 지점을 유지한 후속 검사는 [생성 표 fixture 할당자 검증](native-created-table-staged-resource.md)이 소유합니다.

도형 텍스트 배치의 전체 실패 주입을 유지한 후속 자원 대조는 [배치 스냅샷 자원 검증](native-drawing-snapshot-resource.md)이 소유합니다.

실제 장식 선18개 스냅샷의 후속 전체 감사 중단과 범위 allocator 대조는 [선 스냅샷 자원 검증](native-line-snapshot-resource.md)이 소유합니다.

## 실제 쪽 기하 종합 검사

main7c3705e5 의존성과 같은 테스트 수리만 사용한 분리 소스에서도 집중17361은2/2·exit0, ReleaseSafe 제품 빌드5/5·exit0과fmt를 확인했습니다. 게시에는테스트5줄과기록만포함합니다. 로컬전체컴파일50536은별도진행중이며전체분할감사95505의코드/입력도바꾸지않았습니다. 기본WASM/편집기능게시나전체gate통과를뜻하지않습니다.

전체62384의index762 중단 뒤 같은 noori/page 입력의 집중 baseline도1024MiB관측 기준에서peak1245922552바이트·exit1로중단됐습니다. 테스트 바깥 소유 범위만 checked_allocator.run으로 바꾸고 두 원본의방향/크기/좌우·상하·머리말/꼬리말 여백 전체 구조체 동치와 max_pages0예산 거부 단언을 유지했습니다. 제품 inspectKnown/page geometry parser는 변경하지 않았습니다.

수정본 SHA256 `3317965ee34bd99bcf5fd591378469cea3b31391431e12556efe64ec17164d72`는root포함2/2·fail/skip/log/leak0·exit0, 같은한도에서peak5980496바이트입니다. 기록은 `/tmp/hwpjs-native-current-20261015.QKXKKy/page-geometry-{baseline,checked}.jsonl`입니다. fmt/diff check도 통과했으며 main분리검증/게시와전체4114재검증은 별도로 남아 있습니다.

## 실제 presentation 브러시/필드 검사

main67038c46 의존성과 동일 테스트 수리만 사용한 별도 소스/실제 입력에서 집중39961은2/2·exit0, ReleaseSafe 제품 빌드는5/5·exit0입니다. fmt도 통과했습니다. 게시에는 테스트5줄 변경과 기록만 포함하며 현재 전체 native 컴파일22025는 별도 진행 중입니다. 기존 제품/편집 확장이나 기본 WASM은 게시 범위가 아닙니다.

전체64392의index760 중단을 실제 `hwp3-sample-hwpx.hwpx` 집중 baseline으로 재현했습니다. 이름과 달리 HWPX 변환본이며 HWP3 구현 범위를 넓힌 것이 아닙니다. 같은1024MiB관측 한도에서peak1157121248바이트·exit1입니다. 테스트 바깥 allocator만 checked_allocator.run으로 바꾸고 presentation/브러시 각1·여섯 원값·실제 fillBrush 소유 연결·두 예산 거부·별도 DebugAllocator 요청bytes0 단언을 유지했습니다. 제품 parser와 내부 계측 allocator 설정은 변경하지 않았습니다.

수정본 SHA256 `b61fd2962c6a532b30e9fee731790a8efea059cb343b647010d6a0698b720e24`는 root 포함2/2·fail/skip/log/leak0·exit0, 같은한도에서peak5931344바이트입니다. 기록은 `/tmp/hwpjs-native-current-20261015.QKXKKy/presentation-{baseline,checked}.jsonl`입니다. fmt/diff check를 확인했으며 현재 로컬 source 집중 검증이고 전체4114완료나 main 분리 검증/게시 완료는 아닙니다.

## 외부 선언 뒤 패키지 OLE 종합 검사

main bab04989 의존성만 사용한 별도 소스/실제 입력에서도 집중2/2·exit0과 ReleaseSafe 제품 빌드5/5·exit0을 확인했습니다(실행98965). 잘못된 cwd로 먼저 실행한 로컬 집중29312의2/2와 합산하지 않았으며 main 분리 검증 근거는98965입니다. 게시에는 이 테스트5줄 변경과 기록만 포함합니다. 현재 로컬 전체 컴파일26184는 별도 진행 중이고 전체 gate 완료를 뜻하지 않습니다.

전체1502의index750 자원 중단을 같은 `SO-SUEOP.hwpx`(SHA256 `ebbd6f5c86d6eda195bb9c4ba1fc35b329432dcc5ef1dc0fffbfb4542fce74b8`) 집중 baseline에서도 재현했습니다. 같은1024MiB한도에서peak1326368016바이트·exit1입니다. 해당 테스트의 바깥 allocator만 checked_allocator.run으로 바꾸고 OLE candidate/external/packaged copy 각1·inspection failure0·resolved external1·대상0예산 거부·XML요소1예산 거부·계측 allocator 요청 bytes0 단언을 유지했습니다. 내부의 별도 memory-limit DebugAllocator도 그대로이며 제품 known inspection은 수정하지 않았습니다.

집중 수정본 SHA256 `2998a6301fffed13db53e912cae6d76a78d8cf3db73b08f03a9abc457692393b`는 root 포함2/2·fail/skip/log/leak0·exit0, 관측peak9503056바이트입니다. 기록은 `/tmp/hwpjs-native-current-20261015.QKXKKy/known-ole-{baseline,checked}.jsonl`입니다. fmt/diff check를 확인했고 이 결과는 로컬 source 집중 검사이며 기본 제품 변경·전체 native 완료·main 분리 검증 완료가 아닙니다.

## 실제 쪽 번호 상속과 전체 실패 주입

후속 게시 분리 검증은 main57a0d46b 의존성에 테스트 수리만 적용했습니다. 미게시 다구역/restart 제품 diff98줄은 제외하고 실제headerfooter 입력으로 집중2/2·exit0, ReleaseSafe 제품 빌드5/5·exit0, fmt를 확인했습니다. 게시 diff는 해당 테스트7줄과 이 기록뿐이며 현재 로컬 전체 native 검증의 대체 완료가 아닙니다.

전체 실행58902의 index645 중단 뒤 같은 로컬 소스에서 실제 headerfooter.hwpx 집중 baseline을 먼저 컴파일했습니다. 같은1024MiB 관측 한도에서peak1255195920바이트·자원중단/exit1을 재현했습니다. 테스트의 바깥 Session/read/save 소유 범위만 checked_allocator.run으로 감싸고 내부 주입을 allocation_failures.check에 연결했습니다. 기존 상속값·미지원 다음 구역·모든 할당 실패 인덱스·원본과 저장 bytes 일치 단언은 유지합니다. 이 파일에 있던 미게시 다구역/restart 제품 변경은 이번에 수정하지 않았습니다.

수정본 SHA256 `56b001001a0dd2b187a160926633b33b5feb51663e353c88c30df9892446a7b9`는 root 포함2/2·fail/skip/log/leak0·exit0, 같은한도에서peak4964688바이트입니다. 기록은 `/tmp/hwpjs-native-current-20261015.QKXKKy/page-number-{baseline,checked}.jsonl`이며 fmt도 통과했습니다. 현재 로컬 구현에 대한 집중 대조이고 제품 성능비·전체4114통과·게시 완료는 아닙니다. 기존 제품 변경과 분리해 게시할 때는 main 의존성에서 다시 확인해야 합니다.

같은 분리 소스의 ReleaseSafe 제품 빌드는5/5단계·exit0이고 네 Zig 파일의 fmt/diff check도 통과했습니다. 제품 기본 WASM이나 미게시 Session/ABI/Canvas 변경은 이 게시 단위에 포함하지 않습니다.

게시 전 확인된 테스트 수리4파일만 main 의존성과 함께 별도 소스 복사본에 준비했습니다. 실제 대형 참조 입력도 같은 경로로 복사해 누락 skip 없이 root/수식 snapshot/화살표/연결선 좌표/렌더링 집중5/5·exit0을 확인했습니다. 이 분리 소스의 수식 callback은626회입니다. 전체 로컬4114목록 실행58902는645완료·실패/log/leak0 뒤 실제 쪽 번호 상속 검사에서peak1098417280바이트로1024MiB 관측 기준을 넘겨incomplete·exit1입니다. 이 전체 실행의 연결선 검사는 통과했지만 전체 gate는 미완료이며 집중5/5로 대체하지 않습니다.

## 실제 연결선 좌표/렌더링 검사

화살표 수정 전체 실행28710은625/4114완료·실패/log/leak0 뒤 index625 연결선 lexical geometry에서peak1101415576바이트로1024MiB 관측 기준을 넘어exit1·incomplete입니다. 같은 문서/단언의 집중 baseline도 geometry에서peak1372636504바이트로중단됐습니다. 이 baseline은 뒤 rendering 검사까지 도달하지 않았으므로 rendering의 수정 전 peak를 측정했다고 주장하지 않습니다.

`connector_geometry_values.zig`와 `connector_rendering_points.zig`의 대형 문서 테스트 바깥 소유 범위만 checked_allocator.run으로 바꿨습니다. 제품 read/apply, 실제4개 연결선·좌표 유효성/원문 불변·rendering 전체 할당 실패 순회·budget 거부 단언은 그대로입니다. 렌더링 검사는 동일 문서/할당자 패턴의 예방적 범위 정리이며 독립적인 기존 자원 실패를 확정한 것은 아닙니다. 수정본 `10ef4141c2c23b9daed929702d28509443d109de93b26ca834b448002ffcf9b5`는 root 포함3/3·fail/skip/log/leak0·exit0, 같은1024MiB한도에서peak24084816바이트입니다. 기록은 `/tmp/hwpjs-native-current-20261015.QKXKKy/connectors-{baseline,checked}.jsonl`입니다. 포맷도 통과했으며 이전 전체 바이너리에 이 수리가 포함된 것으로 소급하지 않습니다.

## 실제 화살표 속성 검사

현재 로컬 전체4114목록의 실행86496은621완료·실패/log/leak0 뒤 실제 화살표 검사에서1024MiB 관측 기준을 넘겼습니다. 같은 실제 문서와 기존17화살표/4창/1일반선·속성/enum 단언을 유지한 집중 baseline을 수정 전에 컴파일했습니다. baseline SHA256 `3390ee2a426b54d53daaac2f3bed4fb084ed5b9b22e28dc040f45af501e2f552`는같은한도에서peak1444939120바이트로중단됐습니다.

`line_shape_values.zig`의 제품 collect/read는 변경하지 않고 해당 실제 문서 테스트의 소유 범위만 공통 checked_allocator.run으로 감쌌습니다. per-allocation stack 기록을 제외하고 명시적 safety/누수 검사·문서/section 선택·전체 요소 순회와 기존 단언을 유지합니다. 집중 수정본 SHA256 `efa9b6fbb875ed880b44c6f07f50dab5fb6acba503532515c73ce33104418587`는 root 포함2/2·fail/skip/log/leak0·exit0, 관측peak24068432바이트였습니다. 양쪽 모두 `/tmp/hwpjs-native-current-20261015.QKXKKy/arrows-*.jsonl`에 기록했습니다. fmt/diff check도 통과했으며 제품 메모리 성능비나 전체 native 통과 증거가 아닙니다.

기록된1335개 입력 파일은 실행 뒤 개별 SHA256을 다시 읽어 변경0을 확인했습니다(`input-after-check.json`). 이 비교는 기록 뒤 새 경로 추가 여부까지 검증하지 않습니다. 전체 바이너리는 수정 전 상태이고 새 전체 컴파일/실행은 별도로 필요합니다. 기본 WASM/브라우저/디바이스는 변경하지 않았습니다.

분할 native 실행의 index619(`connector_display_host_tests`)가 프로세스당1검사에서도 물리 footprint 관측4096MiB를 넘었습니다. `/tmp/hwpjs-wire-resource-audit.LC0pnc`는619개 완료·618pass·1fail·skip0 뒤 해당 검사에서 중단됐으며, 실제 관측 peak4423126568바이트입니다. 이 결과를 전체 통과로 읽지 않습니다. MAX 기대값 실패/3버퍼 누수는 [별도 회귀](formula-max-test-regression.md)이며 이 큰 자원 사용의 설명으로 대체하지 않습니다.

## 변경과 보존하는 검사

`src/testing/checked_allocator.zig`는 명시적 safety=true·stack_trace_frames=0인 DebugAllocator를 한 검사 범위에 소유합니다. callback의 오류를 보존하고 deinit 누수 상태가 있으면 TestAllocatorLeak으로 실패합니다. `allocation_failures.zig`도 같은 Debug 타입을 사용하며 기존 전체 실패 인덱스 순회를 유지합니다. 전역 SDK/제품 할당자나 표준 test runner는 수정하지 않습니다.

연결선 검사에서는 std.testing.allocator 대신 이 범위 할당자만 바꿉니다. 실제 원본 문서·4연결선·Unicode 입력·undo/redo·모든 위치 단언은 그대로입니다. 해당 인스턴스의 할당별 호출 위치 기록은 잃지만 안전성·누수 검출은 유지합니다. 전역 allow_stack_tracing은 여전히 true이고 다른 native/제품 오류 진단을 끄지 않습니다.

## 동일 집중 범위 대조

참조 입력은 `2025 행정업무운영 편람(최종).hwpx`, SHA256 `c6dd7e847a99f219681afc5a29c80a9665c04df9cda4d820a3350d739664fdf6`입니다. HEAD 의존성에 이 변경만 적용해 별도 집중 바이너리를 만들었습니다. 수정 전 집중 바이너리도 같은 source 집합에서 연결선 검사의 할당자만 되돌려 컴파일했습니다. 두 runner metadata의 기존2개 이름/순서는 같고 수정본에 helper 자체 검사1개가 추가됩니다. 처음 전체 metadata equality 시도가 이 추가 검사 때문에 실패했으며, 기존 검사를 제거한 것으로 통과시키지 않았습니다.

같은 프로세스당1검사·1024MiB 관측 한도에서 수정 전은 연결선 검사 중 peak1349748080바이트로 자원 중단됐습니다. 수정본 SHA256 `71f8fa0ac0cd3594d93d8da11ddeb052d75a3b1c9f9d19f6ac58dd753a5c2749`은3/3·실패/skip/log/leak0·exit0, 관측 peak96567752바이트(약92MiB)였습니다. 결과는 `/tmp/hwpjs-allocator-resource.0jY1Gb`에 있습니다. 이 footprint 관측은 OS 하드 상한이나 일반 제품 메모리 성능비의 증거가 아닙니다.

별도 `src/testing_checked_allocator_probe.zig`는 root inventory에 import하지 않는 음성 대조입니다. 양성2/2는 전역 tracing 유지·2할당의3개 전체 실패 호출·callback 오류 보존을 확인합니다. 의도적 누수와 단언 실패는 각각 실제1/1 실행에서 FAIL(TestAllocatorLeak)/FAIL(TestUnexpectedResult)·exit1이었고, 컴파일 오류/시그널 종료를 대조 성공으로 세지 않았습니다. 원래 전체 native gate의 자원 문제 전체가 해결됐다는 주장은 하지 않습니다.

ReleaseFast에서도 같은 양성2/2·exit0과 의도적 누수 FAIL(TestAllocatorLeak)·exit1을 확인했습니다. 최적화 모드의 기본 allocator 안전성에 기대지 않고 이 helper의 명시적 safety=true로 검사를 유지합니다. 모드별 결과를 서로 다른 사례 수로 합산하지 않습니다.

게시할 변경만 분리한 소스의 fmt와 ReleaseSafe 제품 빌드5/5단계도 통과했습니다. 기본 배포 WASM을 교체하지 않았고 브라우저·디바이스도 실행하지 않았습니다. 이 검사 수리와 HWP5 생성 표 Session/CFB/API 기능 게시를 구분합니다.

## 실파일 주석 모양 진단의 추가 자원 중단

사각형 host 테스트 수정만 반영한 main 격리 사본의 ReleaseSafe 제품 빌드도5/5단계·exit0입니다. 뒤에 조사 중인 셀 속성 batching 제품 변경은 이 사본·게시 범위에 포함하지 않았습니다.

AVG 포함 전체 바이너리 `0a069815661bcb4209cd006077b9f19964f13d90593c2f114fc41a345f799315`(4115개)의 `audit-average-current.jsonl`은 index885 `HWPX rectangle host batch shares current view without stale anchors`에서 관측 peak1123058864바이트·exit1로 중단됐습니다. 기존876번은 통과했으나 전체 완료는 아닙니다. 해당 테스트의 바깥 소유 범위와 전체 실패 주입만 공통 checked allocator로 변경하고 제품 readMany·중복/순서·splice 후 anchor 이동·잘못된 대상/구역·빈 배열 단언을 유지했습니다.

집중 수정본 `7a3d1678e3ae7ff220dd0eb193484c092ccf8d2a6ed578eb3dd819ce9216dbcc`는 ReleaseSafe2/2·fail/skip/log/leak0·exit0·관측 peak6488400바이트입니다. 로그는 같은 디렉터리 `audit-rectangle-host-checked.jsonl`입니다. 게시 main 기준 격리 사본에서도 제품 셀 조회 최적화를 섞지 않은 집중2/2·exit0을 확인했습니다. 별도 진행 중인 수식41개 검증과 전체 native gate의 완료를 뜻하지 않습니다.

게시 범위를 main 기반 세 파일(이 문서와 document_known_tests/formula_fixture_tests)로 분리한 격리 사본은 ReleaseSafe 집중5/5·exit0 및 제품 빌드5/5단계·exit0을 확인했습니다. 주석 모양 실제 참조2파일을 명시적으로 복사했고 미게시 AVG·생성 표 기능을 섞지 않았습니다. 전체 native gate가 여전히 미완료라는 경계는 유지합니다.

생성 표 flat formula 집중 수정본 `3586e0a1ed7c9824bfd1a9df37237ac224ccc30264ccfa78caec69a0218119d5`는 ReleaseSafe2/2·fail/skip/log/leak0·exit0·관측 peak7176528바이트입니다. 기록은 같은 디렉터리 `audit-flat-formula-checked.jsonl`입니다. 해당 미게시 기능과 함께 실행한 집중 결과이며 기본 제품이나 전체 native 통과를 뜻하지 않습니다.

geometry 수정 후 전체 바이너리 `178da078d4c5d65de951b3294bacd05bb3752110a364c66142194f1e349e89b9`(4114개, AVG 변경 전 snapshot)의 `audit-known-geometry-checked.jsonl`은 index876 `created table flat formula inputs recalculate reopen and roll back invalid number`에서 관측 peak1096172696바이트로1024MiB 한도를 넘어 exit1로 끝났습니다. 기존766번은 통과했으나 전체 완료는 아닙니다. 해당 테스트 바깥 범위만 checked_allocator.run으로 바꾸고 원래 두 호스트·원자성·재계산·재열기 단언을 유지한 집중 바이너리를 컴파일 중이며 자원 재측정은 아직 완료하지 않았습니다.

주석 모양 수정 후 전체 실행은 index766 `HWPX known inspections include table geometry diagnostics and limits`에서 관측 peak1159021768바이트·exit1로 다시 중단됐습니다. 기존759번은 통과했지만 전체4114개 통과는 아닙니다. 표 geometry 검사와 같은 모듈의 all-phases 전체 할당 실패 검사는 바깥 checked_allocator.run과 공통 allocation_failures.check로 통일했습니다. 원래 전체 실패 지점과 모든 단언을 유지하며, 후자의 수정 전 peak는 별도 측정하지 않았으므로 감소율이나 재현 실패를 주장하지 않습니다. 집중 자원 재측정은 `known-geometry-allocation-checked.jsonl`과 별도 stderr 로그에 기록했습니다. ReleaseSafe3/3·exit0·fail/skip/log/leak0·peak6996304바이트이며 바이너리 hash는 `ee26cc1911aa8695cd26b5b23dedd059ed58951e34733ccfaedf79d3ab7fa905`입니다.

수정 후 전체 로컬 바이너리 `6b5d41d3c0de28669127d88922d6659591cb994040f94523b47fe2d2fdbf980b`는4114개 inventory로 재컴파일했습니다. 동일 디렉터리 `audit-note-shapes-checked.jsonl`/`stderr-note-shapes-checked.log`에1024MiB 관측 한도·batch-size1의 새 전체 실행을 기록합니다. 최종 complete 전에는 전체 통과로 계수하지 않으며 이전 중단 실행의 pass 수와 합산하지 않습니다.

2026-10-15 로컬 전체 실행 `audit-page-geometry-checked.jsonl`은 index759 `HWPX section note shapes preserve observed width placement and color anomalies`에서 관측 물리 메모리1088947352바이트가1073741824바이트 한도를 넘어 exit1로 중단됐습니다. 기록 디렉터리는 `/tmp/hwpjs-native-current-20261015.QKXKKy`입니다. 이것은 문서 파싱 오류나 전체 통과 결과가 아닙니다.

해당 테스트의 두 실제 원본과 unknown enum·비정규 색상 기대값은 그대로 유지하고 바깥 할당 범위만 공통 checked_allocator.run으로 변경했습니다. ReleaseSafe에서 동일 이름 집중 필터 실행은 root 포함2/2·exit0으로 통과했습니다. 수정 바이너리 `fb9a7ca4dea42b3dace2715f354009a969115f94fe0dd8e5710765669766cb1d`의 별도 자원 감사도2/2·fail/skip/log/leak0·exit0이며 관측 peak11665744바이트입니다. 표준 runner 분리 프로세스의 동일 집중 범위이고 전체 native 재실행은 아직 완료하지 않았으며, 제품 파서·기본 WASM은 변경하지 않았습니다.

## 구조 수식 snapshot의 전체 실패 주입

다음 분리 바이너리 `2cbf582d6dfc82b203169fe9ced088f63ba0511d22d4401291b22cc3f86da527`는 앞선 수리를 포함하고3921개 inventory를 유지합니다. 1024MiB 관측 한도에서598개 pass·fail/skip/log/leak0 뒤 index598 구조 수식 snapshot 검사에서 중단됐습니다. peak1133167816바이트·exit1·guardStoppedtrue입니다. 이전4096MiB 실행보다 작은 한도이므로 이 이른 중단을 새로운 제품 오류로 해석하지 않습니다. 기록은 `/tmp/hwpjs-hwp5-wire-publication.Tdb3Dc`입니다.

이 검사의 바깥 Session과 save도 기본 테스트 할당자를 사용하고, snapshot read의 전체 실패 주입 동안 반복 호출됐습니다. `formula_structural_snapshot.zig`의 제품 read는 바꾸지 않고 테스트의 바깥 소유 범위를 checked_allocator.run, 내부 주입을 공통 allocation_failures.check로 통일했습니다. 원래 작은 문서·문단 분할·수식 변경·callback별 정의/구조 불변·저장 전후/원본 bytes 단언을 유지합니다. callback 호출 수를 관측하고1회를 넘는지도 검사합니다. 실패 지점을 일부만 선택하지 않습니다.

같은 집중 범위의 수정 전 바이너리는1024MiB 한도에서 peak1223083232바이트로 중단됐습니다. 수정본 `8eada057b977d95c233af68d7b010f01c98ba8b37c7877ffde0f7ebd03c0f6fc`는 root 포함2/2·fail/skip/log/leak0·exit0, peak4112720바이트(약4MiB)로 통과했습니다. callback은626회이며626개의 별도 테스트를 뜻하지 않습니다. 카운터 추가 전2/2 통과 결과와 합산하지 않습니다. 기록은 `/tmp/hwpjs-formula-snapshot-resource.9s8c26`이며 제품 메모리 성능비가 아닙니다.

전체 실행 전후의 추적 fixture와 참조 samples는1335파일·537471347바이트, SHA256 manifest `13da595154016f8106512429f00865767a3d68a2debaa179abfe3359ce0e75ee`로 동일했습니다. input-before/input-after의 unchanged=true를 확인했습니다. 파일 불변은 전체3921개 통과나 새 HWP5 작성 기능 완료의 증거가 아닙니다.

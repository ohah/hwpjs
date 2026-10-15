# 수동 계산 결과의 main 분리 검증

## 현재 상태와 범위

main `a2fb33f7` 기준의 `/tmp/hwpjs-manual-result-publication.ervxKq/tree`에 결과 소유 모델·직렬화·재계산 무효화·원본 표시 provenance·세션·체크포인트·이력과 수식별 서식 조회 연결을 분리했습니다. 이후 main975b68db의 검사기 CSS 변경과도 대조했습니다. 차트/덧말/새 문단 등 다른 작업 트리 변경은 가져오지 않았습니다. 선택적 전체/부분 setter·현재 범위/표시 export와 JS facade, 기존 Worker/Canvas 경로를 연결하고 공개/native 집중 검사를 등록했습니다. 이 문서는 해당 분리 범위의 검증 기록이며 게시 상태는 Git 이력이 소유합니다. 전체 native·기본 WASM 승격·전체 참조 편집/조판 완료와 구분합니다.

원본 캐시와 유효 표시를 구분하는 정책/세부 계약은 [결과 소유 계약](hwpx-formula-result-override.md)이 소유합니다. 실제 copay의 main은 source/current LastResult184.9, 본문100.0인 반면 프로토타입은 source184.9를 보존하면서 current 표시100과 command suffix100을 반환하고 본문100.0 및 원문 저장을 유지했습니다. 이 차이를 조회 오류를 삼키거나 원본 cache를 고쳐 해결하지 않습니다.

## native 실측과 발견한 누락

첫 집중20선언 실행은14개 완료 후 실제 copay 보존 검사에서 관측 physical footprint1,336,345,920바이트로1024MiB 한도를 넘겨exit1·incomplete였습니다. 테스트 바깥 fixture allocator만 기존 checked_allocator 범위로 바꾸고 전체 XML·비대상 원문 보존 단언을 유지했습니다.

원본 표시/seed 회귀까지23개로 확장한 다음 실행은22pass/1fail·exit1이었습니다. `actual text formula and style snapshots agree`에서 수동 문자열의 UTF-16 길이6에 대해 서식 끝점이 원본67.5의 길이4로 남았습니다. 수식별 현재 서식 조립/스냅샷의 prepare 호출2곳에 동일 override/source-display 옵션을 연결했습니다. run 없는 문단이나 다른 서식 확장은 섞지 않았고 기대6을 유지했습니다.

수정 후 native 바이너리 `6201f5eb0eddc0832b4d21db623ea34dda038ed2a04960e36e15c4f6dd964a90`는 표준 runner/batch-size1/관측1024MiB 기준에서23/23·fail/skip/log/leak0·exit0, peak810,091,432바이트입니다. 로그는 위 전용 디렉터리의 `manual-core-styles-audit.jsonl`입니다. 이전 실패·한도 중단을 통과로 소급하지 않으며 전체 root/native/단일 장기 프로세스 gate와 구분합니다.

## WASM·JS 공개 검증

ReleaseSafe 제품5/5·exit0 후보 SHA256은 `6e2f4f7fe08e28f498d0a650f9f92bcd45be4378d83daf2831792883d4691327`입니다. 깨끗한 사본의 JS facade·이 후보·실제 chart 원본으로 manual-formula-result-editor13/13·fail/skip0·exit0(11538.488916ms)을 확인했습니다. 실제13필드의 직접 입력·독립 전체 XML/ZIP 일반/-O와 변조 거부·캐시 보존·정의/표시 조합·참조 숫자 수정의 재계산·재열기·undo/redo 및 ABI/한도/Unicode/XML 거부 원자성을 포함합니다.

기존 등록 HWPX23파일+새 API1파일의 명시적24파일 실행도67/67·fail/skip0·exit0(112262.921458ms)입니다. 로그는 `manual-api-public-suite-final.log`입니다. 격리 고정 WASM 경로와 환경변수/Git metadata/work tree를 맞췄습니다. 최초 실행은 고정 경로 디렉터리 부재로exit1이며 인프라 실패로 보존했고 새 로그에서 다시 완료했습니다.

별도 edge 회귀1/1·exit0(3206.089167ms)은 빈 문자열·공백·결합 문자·astral 문자·정확히4096바이트 표시를 검사했습니다. 현재 텍스트/서식 범위·캐시 보존·전체 XML/ZIP 일반/-O 및 변조 반례·저장 재열기/undo/redo를 확인합니다. 해당 source는 격리 사본의 `tests/hwpx/manual-formula-result-edge.test.mjs`이며 앞선24파일 실행 중에 그 목록을 변경하지 않았습니다. 서로 겹치는 문서/필드 사례 수를 더해 전수 지원으로 주장하지 않습니다.

전체 참조436파일 조회·무편집 저장의 `manual-api-reference-query.jsonl` 최종 summary는 matched436/incomplete0/nonExactNoOp0, successfulQueries1002/queryErrors0/saveErrors0입니다. 암호화1개는 명시적으로 거부합니다. 동일 후보끼리의 검사이므로 이전 버전 대비 응답 동등성이나 전체 편집 지원 증거로 해석하지 않습니다.

## 브라우저 저장 검증과 UI 겹침

실제 브라우저에서 chart 원본을 열고 속성 패널의 결과 표시를 `브라우저😀<&`로 변경했습니다. 일반 클릭이 도움말/API 패널에 가려 실패하는 현상을 확인했습니다. 열린 검사기를 포함한 workspace가 sticky 상태로 후속 패널과 겹치는 것이 원인이어서 검사기가 열릴 때만 normal flow(position relative)로 전환했습니다. 수정 후 강제 클릭 없이 적용·다운로드·undo·redo를 수행했습니다. 이는 속성 패널 입력 경로이며 직접 Canvas 타이핑이나 실제 IME 검증은 아닙니다.

`browser-manual-edited.hwpx`와 `browser-manual-redone.hwpx`는 바이트 단위로 같고 `browser-manual-undone.hwpx`는 원본과 같습니다. 다운로드 편집본에 독립 전체 XML/ZIP 검사와5가지 변조 반례를 Python 일반/-O 양쪽에서 다시 실행해 각각exit0을 확인했습니다. 검증 후 해당 브라우저 세션과9018 임시 서버를 종료하고 실제 프로세스 제거·리스너 부재를 확인했습니다.

전체 편집 명령/참조 파일 전수와 기본 WASM 승격은 남아 있습니다. 실제 Canvas 후속 검증은 [수식 입력 경로](canvas-formula-result-input.md)가 소유하며 실제 작업 트리 기본 WASM은 바꾸지 않았습니다.

## 등록 후 공개 재검증

머리말/꼬리말 fixture scope를 기존 checked allocator로 감싼 집중 바이너리 `7698771c7d6e79a785e20668e2eb5e2b6dd1442c4d35ccf2b06257caf7749aba`는 같은batch1/1024MiB에서2/2pass·fail/skip/log/leak0·exit0·guardStopped=false·peak10,240,336바이트입니다. 실패 주입 인덱스·기존 머리말/꼬리말 변경·오류 원자성/원문 저장 단언은 유지했습니다. 로그는 `header-footer-split-checked.jsonl`이며 수정 후 전체 실행은 아직 남아 있습니다.

최종 분리 소스의 ReleaseSafe 제품5/5·exit0 재빌드는 `zig-out/manual-publication-final/bin/hwpjs.wasm`에서ca351f844db9535335578195370e81230e78a9b465d70c18c4ce9ed3bebf3b2e로 동일합니다. 앞선 소스 고정30파일87통과 뒤 변경한 것은 위 native 테스트 할당자 scope이며 제품 WASM은 바뀌지 않았습니다. 전체 native 미완료와 구형 기본 작업 트리 WASM 유지 경계는 그대로입니다.

전체 `60f6f33f7d6a2992e077371be78b0bac15de98f3007d8fb179aaff85e8f7c026`의 실제3951항목 실행은2404개 완료 뒤 index2404 `HWPX header footer public split allocation failures preserve prior edits`에서 peak1,151,108,296바이트로1024MiB 기준을 넘겨incomplete·guardStopped=true·exit1입니다. 새 머리말/꼬리말 분할 검사의 할당자 scope 측정이 남아 있으며 최종 전체 통과가 아닙니다. 앞선 placement OOM 검사는24,099회 할당·표17개 진단 후 이 실행에서 통과했습니다. 이 바이너리는 최신 바깥 텍스트 보존2회귀·projection/연속 입력 후속 수정을 포함하지 않으므로 결과 범위를 최신 작업 트리에 확대하지 않습니다.

전체3bc44b는874/3949완료 후 index874 `created table flat formula inputs recalculate reopen and roll back invalid number`에서peak1,111,590,040바이트로1024MiB 기준을 넘겨incomplete·guardStopped=true·exit1입니다. PID9801 종료를 확인했습니다. 앞선index871은이번실행에서status0/logs0/leaks0으로 통과했습니다.

index874의 실제 chart fixture scope를 checked allocator로 감싼 집중 바이너리 `53f6f771d6d49fd2c4cf2d4318679e2e28353d038e4b11b0f9c0a15015d7c014`는 같은batch1/1024MiB에서2/2pass·fail/skip/log/leak0·exit0·guardStopped=false·peak7,110,992바이트입니다. 원본 숫자 수정·156.3 재계산·잘못된 숫자 거부·저장/재열기 단언은 유지했습니다. 로컬의 별도 paragraph/character 참조 변경은 가져오지 않았습니다. 로그는 `created-table-flat-formula-checked.jsonl`이며 전체완료/제품 메모리 상한을 주장하지 않습니다.

일반 본문 호스트의 수정 집중 바이너리 `57d86ee28f29a2cedc51cb4d63dcf2a5cb420e06ce1a4d403a339c2769143efc`는 같은batch1/1024MiB 기준에서2/2pass·fail/skip/log/leak0·exit0·guardStopped=false·peak34,423,168바이트입니다. 앞선 수정 전 중단을 통과로 소급하지 않습니다.

두 검증 helper 수정·부분 치환 함수 등록 후 전체 컴파일은exit0이며 바이너리 `3bc44b20438f78433469eb1be45eb87d47f3f77f60a4586bb0d577471cbbbb1b`의 실제3949항목을 같은batch1/1024MiB에서 실행 중입니다. 로그는 `manual-root-healthy-verifiers-fixed.jsonl`입니다. 새 부분 치환 이력/ABI는 이 컴파일 뒤 연결했으므로 해당 연결까지 전체검증했다고 주장하지 않습니다.

같은 모듈의 일반 본문 호스트 실패 주입도 수정 전 `created-table-plain-healthy-before.jsonl`에서peak1,125,401,848바이트로1024MiB를 넘어incomplete1/2·guardStopped=true·exit1이었습니다. native PID67895 부재를 확인했습니다. 격리 사본의 해당 OOM 검증 경로도 동일 helper로 옮겼으며 기존 원본 저장/anchor2·성공 anchor4/OOM 전파 단언을 유지합니다. 이 수정의 후속 측정은 진행 중이며 필드 라벨2/2 통과를 일반 호스트 통과로 소급하지 않습니다.

수식 결과의 부분 치환 native 단계는 [별도 계약/검증](hwpx-formula-result-splice.md)이 소유합니다. 전체3947바이너리 및 기존6e2 WASM에는 아직 이 경로가 포함되지 않았습니다.

index871의 저장 검증을 scoped checked allocator helper로 분리한 집중 바이너리 `a0d23f35ad205146fc69c3a6f3681d71482c60651cf697d6ac7c986c7d990e9c`의 같은batch1/1024MiB 결과는2/2pass·fail/skip/log/leak0·exit0·guardStopped=false·peak29,180,312바이트입니다. 로그는 `created-table-label-healthy-fixed.jsonl`입니다. 전체 실패 인덱스/저장 bytes/anchor unit/OOM 전파 단언은 유지하며 전체 root 통과나 제품 메모리 상한의 증거는 아닙니다.

전체7f08062e 실행은871/3947완료 뒤 index871 `created table field label allocation failure sweep restores complete saved state`에서 peak1,109,148,920바이트가1024MiB를 넘어 incomplete·guardStopped=true·exit1로 종료됐습니다. native PID50390의 종료를 확인했습니다. assertion 실패나 전체 통과로 해석하지 않습니다. 원래 작업 트리에 같은 검증 경로의 분리 helper가 이미 있어 그 부분만 격리 사본에 가져왔으며, 같은 파일의 별도 서식 테스트/다른 변경은 포함하지 않았습니다. 수정 후 같은 기준 측정은 아직 남아 있습니다.

API/Worker/후속edge3파일을 같은6e2 후보로 함께 재실행한 `manual-api-worker-edge-final.log`는18/18·fail/cancel/skip0·exit0(13910.007458ms)입니다. 앞선17검사 이후 추가한 좌표 거부 사례를 포함하며26파일 전체 재실행 결과로 확대하지 않습니다.

후속 edge2/2·fail/skip0·exit0(4717.466875ms)은 기존 표시 경계 회귀와 새 좌표 거부 회귀입니다. 구역/수식 식별자 각각에 음수·분수·NaN·Infinity·u32초과·문자열·null·undefined·bigint를, native 경계에 u32최대 구역/수식과 비필드0을 전달한21거부를 검사했습니다. 매 거부 뒤 저장 원문·revision·source/current 값을 대조하고 마지막 redo 수정본 복원을 확인했습니다. 이 추가 테스트는 앞선26파일71개 실행 뒤 작성됐으므로 그 결과에 소급하지 않습니다.

전체7f08062e 실행은 이전 중단 지점index865 생성 셀 텍스트 검사를status0/logs0/leaks0으로 통과했습니다. 이후 실행이 계속되므로 이 지점 통과를 전체3947완료로 해석하지 않습니다.

생성 셀 텍스트 검사기 수정 포함 전체 root ReleaseSafe 컴파일은exit0이며 바이너리 SHA256 `7f08062e841fe86c7418c4d80a2de7fe9045fc215f6ee656e411ef4aa7c04095`입니다. 실제inventory3947개를 유지해batch1/seed0x485750/1024MiB 감시를 시작했고 로그는 `manual-root-created-cell-fixed.jsonl`입니다. 최종complete/프로세스 종료 전에는 전체 통과로 계수하지 않습니다.

동일6e2 후보의 교차 포맷 회귀로 build의 HWP5 editor18파일을 추출해312/312·fail/cancel/skip0·exit0(4137.115875ms)을 확인했습니다. 기본 CFB 계약/적대적/구조/정확조회/예외/쓰기6파일도47/47·fail/cancel/skip0·exit0(3062.009583ms)입니다. 로그는 각각 `manual-hwp5-registered.log`, `manual-cfb-registered.log`이며 전체 참조 HWP5 지원이나 전체 native 완료를 대신하지 않습니다.

전체 native 컴파일과 병행한 생성 셀 텍스트 집중 baseline 바이너리 `6c2782f2621307eead59ab64c6df723f96db7b35503e40a754535ca7dcfc68bf`는 root 진입점만 완료하고 해당 편집 테스트에서 peak1,152,156,824바이트로1024MiB 관측 기준을 초과했습니다. `created-cell-text-before.jsonl`의 최종 guardStopped=true/exit1·incomplete1/2이며 종료된 native PID39045의 부재를 확인했습니다. assertion 실패나 제품 누수 확정이 아니며 공통 실패 주입 할당자로 바꾼 후 같은 기준의 측정이 남아 있습니다. 최초 격리 경로의 감시 도구 부재는 테스트 시작 전 인프라 실패입니다.

이후 `created_cell_text_tests.zig`의 실패 주입1곳만 공통 `allocation_failures.check`로 바꿨습니다. 모든 실패 인덱스·원본 저장/이력·거부/no-op/redo 단언은 유지합니다. 수정 바이너리 `a6ae0fb1ff0280e3dfe2ab1e6b11d9fa2d250cb358143f1121cbba199b75e3e3`를 같은batch1/1024MiB에서 실행한 `created-cell-text-after.jsonl`은2/2pass·fail/skip/log/leak0·exit0·guardStopped=false·peak60,326,248바이트입니다. 제품 메모리 상한이나 전체 native 완료 증거는 아닙니다. 수정 전 전체 컴파일은 소유 PID26332를 확인해SIGTERM으로 종료(exit143)했으며 통과로 계수하지 않습니다. 수정 포함 새 전체 컴파일/실행 결과는 별도로 확인합니다.

build의 `hwpx_text_tests` 명령/추가 인수에서 정확한26파일을 추출하고 중복/개수를 검사한 뒤 Node 동시성2로 실행한 최종 결과는71/71·fail/cancel/skip0·exit0(120652.26ms)입니다. 로그는 `manual-registered-26.log`이며 모든 테스트의 고정 WASM과 환경변수 후보는 같은6e2 해시입니다. 일반 numeric48곳/수식13개 독립 산술·XML, 정의 변경, Worker, 새 수동 결과3파일을 포함합니다. source manifest 비교는 main975b68db 대비 기존 코어17파일 변경으로 수동 결과의 세션/이력/저장/조회/ABI/JS/등록 범위만 확인했습니다. 새 모듈과 공개 테스트14파일은 별도이며 이 manifest가 전체 native 완료를 뜻하지 않습니다.

등록 후 `zig test src/root.zig -O ReleaseSafe --test-filter 'HWPX manual formula result' --test-filter 'HWPX source formula display' --test-filter 'HWPX source result seed'`는 root 진입점1개를 포함해24/24·exit0입니다. 전체 root 테스트 수가 아닌 필터 실행입니다. 별도 batch1024MiB 감시 결과와 달리 이번 단일 runner에는 같은 메모리 한도를 적용하지 않았으므로 두 결과의 자원 조건을 혼동하지 않습니다. 등록 후 ReleaseSafe 제품 빌드5/5·exit0과 기존6e2 후보 해시 일치도 확인했습니다.

같은6e2 후보·격리 JS/Worker로 API/Worker/edge3파일을 함께 재실행해17/17·fail/skip0·exit0(12482.689709ms)을 확인했습니다. 선택적 ABI2개 각각의 누락 거부와 실제 Worker의 적용·저장·이력도 포함합니다. root 등록 이후 native 전체를 실행한 결과는 아닙니다.

copay 공개 회귀의 기존 기대184.9가 현재 조회100과 달라 실패했습니다. 독립 Python ZIP/XML에서 원본 Command/LastResult184.9 및 fieldBegin/fieldEnd 사이 표시100을 직접 확인했습니다. 회귀를 source184.9/current100 각각의 단언으로 분리하고 원문 저장·수정 후194.9·독립 전체 XML/ZIP 일반/-O·변조 거부·undo/redo·재열기를 유지해1/1·exit0(2988.167167ms)을 확인했습니다. 최초 참조 경로 누락은 인프라 실패이며 읽기 전용 참조 연결 후 재실행했습니다.

이후 수정 후 source 조회 불변·undo 후 current100/source184.9 복원 단언을 추가한 재실행도1/1·exit0(3325.882334ms)입니다. 이는 위26파일 묶음 밖의 별도 실제 참조 회귀입니다.

# unknownObj 후보의 공개 API 회귀

## 게시 d4c7d918의 최신 HWP5 등록 회귀 — 최초 미완료·TAP 재실행 중

숫자 입력·편람178범위·Canvas 수정키 회귀를 포함한 게시 `d4c7d918b0316056a52600ab7d86e36631b89b3e`를 `/tmp/hwpjs-field-interior-browser.DVJV5s`에 고정했습니다. 앞선 소유 브라우저 종료 후 e9aa1141 이후22경로만 Git archive로 반영했고 전체7,219개 blob을 게시 tree와 대조했습니다. 사본 Git index도 그 추적 목록으로 갱신했습니다. 별도 qzuKq7의 진행 중인 참조 감사 소스/원본은 변경하지 않았으며 새 대형 사본이나 WASM 빌드도 만들지 않았습니다.

초기 배열부터 has_side_effects 직전까지의 모든 등록에서93개 고유 파일을 추출해 Node24.20.0·nice10·직렬·명시적9e75 후보/cbaa 기준으로 실행합니다. `current-hwp5-gate.jsonl/.stderr`가 근거이며 실행기 `run-current-hwp5-gate.mjs`는 시작/끝의 전체 소스·두 WASM 불변을 확인합니다. 실행기 SHA256은 `a1f6c147cb529b7e7591af189a3ab2dcd2441506a7fc286ee9a6a79a22899887`, 최초 부모는55745입니다. 최종 통계·종료·불변 재대조 전에는 통과가 아닙니다. 이전495개·집중224개/178범위와 합산하지 않으며 기본 WASM/외부 데모·전체 참조 편집/조판 완료와 구분합니다.

최초 실행은 자식status1/signal=null/error=null·wrapper exit1로 종료했습니다. stdout315행에 최종 테스트 통계/명시적 assertion 실패가 없고 마지막 테스트 출력은 readonly session policy이며, 그 뒤 source7,219개·두 WASM 최종 불변 검사는 통과했습니다. 로그 SHA256은 `1788927d2e4710047bf94f6c806cac264922b6e704287e898640e3c11c4d244a`입니다. runner/test 부모55745/55750 및 관측 자식56170 부재를 확인했습니다. 성공·실패 테스트 수를 추정하거나 source 검증만으로 전체 gate를 통과 처리하지 않습니다. 당시 디스크 여유의 반복 감소는 관측했지만 ENOSPC 오류 원문이나 종료 원인은 확인하지 못했습니다.

같은 고정 사본의 바로 다음 document-numbering 회귀를 TAP으로 단독 실행한 `numbering-after-exit.log/.stderr`는5/5·exit0·stderr0이며 전체 종료 원인을 확정한 검사가 아닙니다. 동일93파일·소스/후보/기준을 유지하고 reporter만 TAP으로 바꾼 `current-hwp5-gate-tap-retry.jsonl/.stderr`를 새로 시작했습니다. 이전 실행과 합산하지 않으며 테스트별 진단과 전체 최종 종료를 기다립니다. TAP 실행기 SHA256은 `7322f959be11554d20d6cc7c53c2121890d21bb74664f525d7880a38ffbcaa0f`입니다. 최초 실행기는 TAP 옵션만 제거해 `run-current-hwp5-gate-spec-first.mjs`로 재구성했고 원래 a1f6 해시와 일치했습니다. 실행 소스/전체 참조 감사는 변경하지 않았으며 native 쪽·단 나누기 초안은 이 소스에 포함되지 않습니다.

## 최신 후보의 전체 참조 입력·이력 감사 — 실행 중

같은 e9aa1141 분리 사본 `/tmp/hwpjs-main-hwp5-gate.qzuKq7`·9e75 후보에서 전체 참조975경로의 signature별 HWP5/HWPX 입력 감사를 시작했습니다. 격리 실행기 `run-current-reference-edit.mjs`는 시작에7,214개 Git blob을 정확한 e9aa1141 tree와 대조하고975개 원본 경로/해시 manifest를 출력합니다. 끝에 소스·전체 원본·WASM을 다시 대조합니다. `run-reference-edit-files.mjs`는 게시된 개별 HWP5/일반 HWPX/전용 HWPX 감사만 순차 호출하며 이력·독립 저장 검증을 유지합니다. 파일별 결과·거부와 전체 종료를 분리하고 시간 경과를 이유로 재시작하지 않습니다. HWP3는 범위 제외이며 전체 prefix 검사가 모든 명령/위치/브라우저/조판 지원을 뜻하지 않습니다.

최초 `current-full-reference-edit.jsonl/.stderr`는 미추적 집계 도구가 게시 사본에 없어 MODULE_NOT_FOUND·exit1로 문서 검사 전에 종료했습니다. 소스/원본 최종 불변은 통과했지만 제품/문서 검사 성공이 아닙니다. 해당 사용자 미추적 도구를 채택하지 않고 별도 scratch 실행기로 연결한 `current-full-reference-edit-retry.jsonl/.stderr`를 새 실행 기록으로 사용합니다. 최초 재실행 부모25106/집계25134를 관찰했고 첫 HWP5 원본의121/121입력·이력·비대상 stream·저장 재열기가 완료됐습니다. 전체 최종 집계 전에는975개 성공으로 보고하지 않습니다.

실행기 SHA256은 각각 `4f3636e40145c05555e84f5845ff39b48af02cc0c30414b86c35d90fe1dd60ab`, `655c1e271d59811857e1b1f6be831b8cc6e10460540d22681fdf720e56691d5d`입니다. 제품 Git 경로/기존 기본 WASM/외부 서버는 변경하지 않으며 로그와 실행기는 해당 격리 경로에 보존합니다.

## 게시 e9aa1141의 HWP5 공개 등록 회귀 — 완료

게시 `e9aa1141a55c4c8879e9aa47e62bcc992e22520a`·tree `04169bfb83de0635b15c6dc5d2a238c170f06fdb`를 `/tmp/hwpjs-main-hwp5-gate.qzuKq7`에 분리했습니다. 완료한 HWPX 사본의 APFS clone에 두 커밋 간 변경 경로만 Git archive로 반영하고 추적7,214개 blob 전체를 새 HEAD와 대조했습니다. 새 Git index에도 해당 blob 경로만 등록했습니다. 참조/기준/후보를 원래 작업 트리와 섞지 않으며 후보9e75·기준cbaa의 전체 해시는 아래와 같습니다.

`editor_api_tests`의 초기 배열과 has_side_effects 직전까지의 모든 addArg에서92개 고유 경로를 추출했습니다. install 의존성 뒤의 등록도 누락하지 않습니다. Node24.20.0·nice10·직렬·명시적 HWPJS_TEST_WASM/HWPJS_BASELINE_WASM으로 `registered-hwp5.jsonl/.stderr`를 기록하고 시작/종료의 전체 소스/build/두 WASM 불변을 검사합니다. 종료/통계/skip/최종 재대조 전에는 성공이 아니며, 아래 HWPX372개·Native4,118개와 한 실행으로 합산하지 않습니다. 기본 WASM/외부 데모는 그대로입니다.

같은 실행은495/495·fail/cancel/skip/todo0·653292.219292ms로 완료됐습니다. 자식 status0/signal=null/error=null·wrapper exit0이며 stderr의 구조화된 정상 종료 한 줄을 오류나 빈 stderr로 보고하지 않습니다. 마지막 `registered-hwp5-final-identity`에서7,214개 source blob·build·후보/기준 불변을 확인했습니다. 로그 SHA256은 `96dd4ba23c9ec281fa7b528879ffdff335a53e34c441502ba0e237a57211fc46`입니다. 이후 task1749 집중 회귀는 이 동결 소스에 포함되지 않으며 실제 Chromium·전체 참조 편집·원본 조판·기본 배포 완료로 확대하지 않습니다.

## 게시 bd75e76b의113파일 등록 회귀

게시 `bd75e76b840d598784a3576aa1ebe1307ddb4b1b`·tree `e0193d9c6a1d7b2bab2d18ea0169d1d62f2136c9`를 `/tmp/hwpjs-main-public-gate.mrTKYH`에 분리했습니다. 추적7,211개 blob을 Git과 전수 대조한 뒤 그 경로만 사본의 새 Git index에 등록했고 참조 samples도 별도로 복사했습니다. `src/`·`.mise.toml` 범위에서 후보 빌드 소스6f4fe0ea와 달라진 제품 코드가 없음을 확인했습니다. 후보9e75와 기준cbaa의 전체 SHA256은 아래52개 수정 후 기록과 같으며, 후보는 사본 zig-out에만 설치하고 기준은 사본 baseline.wasm으로 고정했습니다.

선택 build의 초기 인자/모든 addArg에서 HWPX112파일과 WASM export1파일, 총113개 고유 경로를 추출했습니다. HWPX 부분은 hwpxGateTestPaths와 순서까지 대조했습니다. Node24.20.0·nice10·직렬 실행의 `registered-hwpx.jsonl/.stderr`는372/372·fail/cancel/skip/todo0(1331245ms)·자식 status0/signal=null/error=null·wrapper exit0입니다. stderr는 정상 구조화된 종료 한 줄이며 비어 있다고 보고하지 않습니다. 명시적 HWPJS_TEST_WASM/HWPJS_BASELINE_WASM을 제공했고 종료 후 전체7,211개 blob·build·두 WASM 불변 검사를 통과했습니다. 로그 SHA256은 `95154deef6e816f20a831b54a4d4fa1f82185f5ea655ddb4b92fe99d09de0dfe`입니다.

이후의 BELOW 연속 입력/저장 단축키 회귀는 이 동결113파일에 없으며 집중 결과를 한 번의 이후 최신 전체 gate로 합산하지 않습니다. 기존 Native/고정44원본 감사를 재시작하거나 기본 WASM/외부 서버를 교체하지 않았습니다. 실제 Chromium·OS IME·원본 조판·전체 fixture 의미/편집의 완료 증거는 아닙니다.

## 52개 native 수정 뒤 새 후보의 전체 HWPX 등록 회귀

제품 소스 `6f4fe0ea`의 `/tmp/hwpjs-native-postfix-main.33GojG`에서 별도 prefix ReleaseSafe WASM 빌드5/5·exit0(WASM compile45s)을 확인했습니다(`candidate-build.log/.stderr`). 새 후보 SHA256은 `9e75fd8bab9b879b3883f4703a7a8c2ffe100f98cd48c68a511eed797840b468`입니다. afb7 게시 후보와 export 이름/종류336개가 같고 missing/changedKind/added0이며 signature/동작 전체 동일성을 이 대조만으로 주장하지 않습니다.

게시 `4fa53dc93f7169db796ebacfbd27833376945ea8`·tree `084590abd6abb44ffba1777ff6e26946d79f72d6`를 `/tmp/hwpjs-public-postfix-main.97m5P2`에 추출했습니다. 추적 blob7,194개를 Git blob 해시로 전수 대조해 일치했고, 이 경로들만 사본의 별도 Git index에 등록했습니다. gitlink legacy/hwpers 내용은 포함하지 않습니다. 참조 samples도 별도 사본이며 새 후보는 사본의 고정 설치 경로에만 복사했습니다. 6f4fe0ea와4fa53dc9 사이 src/build/.mise/js/web/tools 변경이 없음을 확인했고 새로 추가한 수동 결과 원본 두 회귀는 이 후속 검사 소스에 포함됩니다.

등록은 기존 hwpxGateTestPaths와 순서 대조한 HWPX107파일·WASM export1파일, 총108개 고유 경로입니다. 최초 `registered-hwpx.log/.stderr`는 기준 환경변수가 없어 chart-baseline-parity가 skip될 설정임을 확인하고 소유 wrapper/runner/test 자식만 종료한 불완전 실행(exit143)으로 보존합니다. PID18848/18850/23409 종료를 확인했으며 native 전체/고정44파일 검사는 건드리지 않았습니다. 관측 타임아웃 때문에 재시작한 것이 아니고 이 부분 결과를 최종 gate로 합산하지 않습니다.

후속 `registered-hwpx-baseline.jsonl/.stderr`는 Node24.20.0·동일 새 후보·명시적 cbaa 기준으로 전체108파일을 직렬 실행해359/359·fail/cancel/skip/todo0(1099589.853542ms)이며 자식 status0/signal=null/error=null·wrapper exit0입니다. stderr의70바이트는 이 구조화된 정상 종료 기록 한 줄이며 비어 있다고 보고하지 않습니다. 시작/종료의 build·후보·기준·사본 고정 설치 파일 해시 검사를 통과했고 종료 후 사본의 추적7,194개 blob을 Git과 전수 재대조해 일치했습니다. 이후 추가한 연쇄 SUM28입력 회귀와 브라우저 guard 변경은 이 동결108파일 소스에 없으므로 최신109파일 gate 통과로 주장하지 않습니다. 원래 작업 트리의 기본 WASM/외부 데모는 변경하지 않았고 HWP5·전체 참조·브라우저·조판 완료와 구분합니다.

## Zig 0.17 게시 소스의 전체 HWP5 공개 편집 등록 회귀

아래 HWPX와 같은 eddbfa8c 게시 소스 사본·Node24.20.0·afb7 후보·cbaa 기준에서 `build.zig`의 `editor_api_tests` 초기 인자와 모든 addArg의92개 고유 경로를 직렬/TAP로 실행했습니다. 중간에 install 의존성이 선언된 뒤에도 addArg가 이어지므로 추출 끝은 `has_side_effects` 직전으로 잡아 뒤의 등록을 누락하지 않았습니다. `registered-hwp5.log/.stderr`는 최상위398개·하위 포함 총493/493·fail/cancel/skip/todo0·자식 exit0/signal=null·wrapper exit0·stderr0(691328ms)입니다. 최상위와 하위 수를 합산하지 않습니다.

실제 폼7문서의1,446문단 Canvas→Worker 입력/저장·독립 전체 Section·undo/redo·재열기 회귀도 이 실행에 포함됩니다. 끝에 등록 소스/두 WASM 해시가 그대로이고, 종료한 부모/runner가 남지 않으며 사본7193개 Git blob도 eddbfa8c와 전부 같음을 확인했습니다. 로그 SHA256은 `5e4a12e2814e34db2ff8399dcc2e1596e914fc923c30ac691eccdc00667808ce`입니다. 두 공개 gate는 차례로 실행했으며 기본 제품/외부 데모 WASM은 바꾸지 않았습니다. native 전체·전체 참조 corpus·실제 Chromium/OS 입력·원본 조판 또는 전체 편집기 완료를 대신하지 않습니다.

## Zig 0.17 게시 소스의 전체 HWPX 공개 등록 회귀

main `eddbfa8c35bb9e28824e404a5b96f1bcd97fcb99`·tree `c201fa64d85323f153b5dc691e87d131e30bbbaf`를 `/tmp/hwpjs-published-hwpx-gate.7WPrL4`에 추출했습니다. `build.zig`의 `hwpx_text_tests` 초기 인자와 addArg를 모두 읽어 HWPX105파일과 WASM export1파일, 총106개 고유 등록 경로의 존재를 확인했습니다. HWPX 경로는 기존 `hwpxGateTestPaths` 결과와 순서까지 대조하며 별도 수동 목록을 만들지 않았습니다. `node --test --test-concurrency=1 --test-reporter=tap`으로 전체106파일을 직렬 실행했습니다.

Node24.20.0·명시적 게시 소스 Zig0.17 후보 `afb7fdfbbc8a9c9cc45a7cdb98ade6be7a6a88b1943e1c5354c63d6715b9e05e`·명시적 기준 `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`의 `registered-hwpx.log/.stderr`는348/348·fail/cancel/skip/todo0·자식 exit0/signal=null·wrapper exit0·stderr0(1056593ms)입니다. 시작/종료에 build 등록 소스와 두 WASM의 해시를 대조했습니다. 로그 SHA256은 `c0060cc38c2aeff42f37299b1ed8caeaffe3286622a2f5446597711abf3e7931`입니다. 종료 뒤 부모/테스트 runner가 남지 않았고 사본의 추적7193개 Git blob이 해당 HEAD와 전부 일치함을 재확인했습니다.

Git inventory를 쓰는 검사를 위해 추출한 추적 fixture만 사본의 임시 Git index에 등록했고, 참조 samples는 별도 clone 사본으로 제공했습니다. 고정 설치 경로를 읽는 테스트에도 사본 안 `zig-out/bin/hwpjs.wasm`으로 같은 후보를 제공했습니다. 원래 작업 트리의 기본 WASM/외부 데모는 교체하지 않았습니다. 이후 문서 기록 커밋을 제외한 해당 게시 코드의 공개 등록 회귀 결과이며 최신 전체 native gate·HWP5 공개 gate·전체 참조 문서 전수 편집·실제 브라우저/OS 입력·원본 조판 완료로 확대하지 않습니다. 아래 진행 중인 고정44문서 결과와 합산하지 않습니다.

## 과거 실패44개 재검사 — 고정 실행 기록

`/tmp/hwpjs-old-failures-current.8bPWPB`는 과거 `/tmp/hwpjs-normalized-reference-edit.Dld3zF`의 실제 완료861행에서 verification_failed44개를 전부 고정한 사본입니다. 과거 root의975개 전체가 완료됐다는 뜻은 아닙니다. baseline 로그 SHA256은 `31c3aa0e0745ff6936fe79065a626ff7d780f2c95e6b7f4099f0e95484e2115f`입니다. 원본44개의 SHA256이 당시 행과 모두 같음을 확인했고, 합계48,568,945바이트를 cases에 복사했습니다. 원본을 수정하지 않습니다.

시작 당시 HEAD는737a50a8이며 작업 트리의 JS/도구421파일을 해시와 함께 고정했습니다. 이 사본에는 미커밋 도구가 포함되므로 main 소스와 동일하다고 주장하지 않습니다. `candidate.wasm`은 Zig0.17 작업 트리 후보 `f4e0f396a3fea6e6354b364ff176e31d72ed00ec643fa566c4abbd8bc2f58d77`의 사본입니다. manifest SHA256은 `fbc985c34b429b6c9128b95bcfa4d8e5b55e2484f22cc318ce05931e3f3a9470`입니다. 중간 검증에서 코드421·원본44·사본44·WASM 모두 그대로임을 다시 확인했습니다. 기본 제품/외부 데모를 교체하지 않았습니다.

감사는 문서별 일반 prefix/저장/이력 뒤 전용 prefix/독립 XML·ZIP/재열기/이력을 직렬 실행했습니다. 최종 `results.jsonl/.stderr`는 파일 완료 행44개·입력 manifest와 누락/중복0·summary의 전체 prefix 통과22/부분 지원6/verification_failed16·프로세스 exit1입니다. 종료 후 코드421개·원본44개·사본44개·WASM·manifest 해시를 전수 재대조해 일치했고 부모 종료도 확인했습니다. results.jsonl SHA256은 `31ef83ad352643793d95592cdded82a54c946f5d53e3148b8af226ebac1e0ab8`입니다.

이것은 f4e0 고정 사본의 실패를 포함한 종료 기록이며, 이후9e75/main의 oracle 수정·숫자/수동 결과 편집 통과로 소급 변경하지 않습니다. stderr가 비어 있어도 verification_failed를 성공으로 바꾸지 않고16개를 최신 parser 결함16개로 단정하지도 않습니다. 거부는 지원 성공이 아니며 계산 결과의 명시적 수동 편집은 별도 경로입니다. 전체975개 편집·모든 명령/위치·실제 브라우저/조판 동치 완료와도 구분합니다.

첫 원본의 독립 XML 문단 수는1,203개입니다. 일반 감사 정상 종료 후 전용 감사로 넘어간 것을 프로세스 전환으로 확인했고, 전용 oracle 입력에서754번 문단을 관측했습니다. 이는 성공 개수가 아니라 실행 위치이며 파일 최종 결과가 아닙니다. 별도 한 문단870의 실측은 조회 약0.008–1.5ms·prefix 입력4.7ms·save96ms·reader177ms·독립 XML270ms이며 undo/redo·각 save까지 exit0입니다. `first-query-profile.jsonl`, `first-transaction-profile.jsonl`이 근거이며 한 표본을 전체 성능/호환성 증명으로 확대하지 않습니다.

[원본 빈 run 입력 소속](hwpx-prefix-insertion-affinity.md)은 실제 sample2의 저장 검사 실패를 재현하고, 다른 글꼴 run으로 기대값을 옮기던 독립 검사기의 누락과 변조 거부 회귀를 분리해 기록합니다.

## 소스와 산출물

`/tmp/hwpjs-hwpx-public-current.pbeDpJ`는 e9d24ba4의 build.zig/js/web/tools/tests 사본과 원본 fixture 연결을 사용합니다. WASM 후보는eaaa0d2007a2e02fce27335e6218379284108e756e285d4859cad28167d0fe5f입니다. 명시적 HWPJS_TEST_WASM을 제공하며 고정 설치 경로를 읽는 검사도 이 사본의 zig-out/bin/hwpjs.wasm 연결을 통해 같은 후보를 사용합니다. 실제 제품 기본/외부 데모를 바꾼 것이 아닙니다.

## 수동 계산 결과

`manual-formula-family.log/.stderr`는 등록 목록에서 manual-formula-/manual-result- 아홉 파일을 선택해36/36·fail/skip/cancel0·exit0·stderr0(61810.010125ms)입니다. 결과/부분 문자열 편집·독립 전체 XML/ZIP normal/-O·정의와 다른 표시 보존·재열기·이력·실제 Worker·선택 export 부재/잘못된 좌표 거부·section2 oracle 반례가 포함됩니다. 별도 두 파일의 초기 재현도 `manual-formula-focused.log`에서3/3·exit0입니다. 반복 결과는 합산하지 않습니다.

첫 등록95파일 실행 중 디스크 여유가 고갈됐고 일부 수동 결과 검사에서 실패가 기록됐습니다. `registered-hwpx-95.log/.stderr`는 child exit1로 끝났으나 전체 테스트 합계/상세 오류가 없어 완료 근거가 부족합니다. 이후 공간 확보 뒤의36/36은 첫 실행의 실패를 소급 통과로 바꾸지 않습니다. 첫 실행의 모든 실패 원인을 디스크로 단정하지 않습니다.

## 명시적 차트 기준 대조

`chart-baseline-explicit.log/.stderr`는1/1·fail/skip/cancel0·exit0·stderr0(4192.266042ms)입니다. 기준은2589a92e5e53b0fa222d373f78cba64900a1ae623f19a9c4ea6195df1290634c이며28개 참조 차트의 원래 전체 node/site/point 응답, 호스트 입력28개, 숫자/문자 변경56개와 undo/redo를 두 후보에서 비교했습니다. 기준과 같은 오류 가능성까지 배제하는 독립 조판 oracle은 아닙니다. 첫 등록95파일 실행의 기준 환경변수 부재 skip1건과 이 명시적 실행을 한 번의 무건너뜀 gate로 합산하지 않습니다.

## 상세 TAP 재실행과 환경 실패

같은 e9d24ba4 소스·후보·95파일을 명시적 기준 WASM과 TAP reporter로 재실행한 `registered-hwpx-95-tap.log/.stderr`는288개·pass283/fail5/cancel0/skip0·exit1·stderr0(887305.410666ms)입니다. 다섯 실패는 모두 MEMO의 독립 oracle 입력을 임시 파일에 쓰는 `tools/oracle-process.mjs:15`의 ENOSPC입니다. 파서/저장 XML의 단언 실패로 바꾸지 않습니다. 전체 gate 통과도 아닙니다.

공간 확보 뒤 같은 소스와 WASM에서 해당 두 파일을 재실행한 `memo-resource-retry.log/.stderr`는5/5·fail/cancel/skip0·exit0·stderr0(151578.225584ms)입니다. 실제 Worker MEMO label·주석과 표시의 동시 편집·잘못된 metadata의 거부/redo·두 실제 원본의 전체 XML/ZIP을 검사합니다. 이5개 통과를 앞선283개와 합쳐 한 번의288개 전체 gate 성공으로 주장하지 않습니다.

## 추가 참조 원본의 필드 위치 불일치

등록 gate 밖의 `reference/rhwp/samples/task1789/exclusion_probe_line_spacing.hwpx`를 같은082cf938 사본·eaaa0d20 후보로 검사한 `task1789-current-specialized.log/.stderr`는 exit1입니다. 실행에는120초 상한을 두었으며 시간 초과가 아니라 `Unexpected XML change outside the chosen field prefix`로 종료했습니다. 옛77b60b82 후보의 장기 감사 로그에도 같은 원본의 같은 오류가 있었으나 새 재현과 합산하지 않습니다.

별도 공개 API 재현에서 구역0·문단17의 `anchorText`는 UnsupportedStructuralFieldEdit, `fieldRangeTarget(0,17,0,0)`은 beginElement211/start0/end68입니다. 독립 XML inventory의 해당 필드는 id1878228493입니다. 원본 문단 첫 run에는 tbl 다음에 `2. ` 텍스트가 있고, 저장 diff는 이 run의 tbl 앞에 prefix 텍스트를 새로 넣습니다. fieldBegin.dirty는 원래1입니다. 기존 필드 oracle은 해당 문단의 첫 텍스트인 표 뒤 `2. `에 prefix를 넣은 기대 트리를 만들었습니다.

후속 원인 대조에서 `source_field_paragraph_positions`가 `anchor_text_positions.buildForFieldText`의 한 단위 개체 경계를 사용하고, 필드 입력은 `field_text_positions.insertionSite`로 필드 소속 site를 선택함을 확인했습니다. 따라서 이 원본의0번 입력은 표 앞 경계이고 표 뒤 텍스트의0번이 아닙니다. 제품 위치 계산을 바꾸지 않고 독립 oracle의 원본 site 선택을 보완했습니다. `tools/hwpx_field_prefix_site.py`는 원본 문단 첫 run의 직접 tbl/pic/container가 선택 필드 시작·끝 사이에 있는 경우에만 앞쪽 텍스트 site를 만듭니다. 오직 삽입 위치0·삭제0에 적용하며, 전체 XML·dirty·ZIP metadata/비대상 payload 비교는 그대로 유지합니다. 저장본을 보고 기대 위치를 고르지 않습니다.

`/tmp/hwpjs-field-boundary.LHORcC`의 oracle은 HEAD83c18d62에 위 세 줄과 새 helper만 추가한 사본입니다. 무관한 작업 트리의 styled-run 삭제 변경은 제외했습니다. 같은 eaaa0d20 후보의 `field-boundary-tests.log/.stderr`는3/3·fail/cancel/skip0·exit0입니다. 새 실제 원본 회귀는 필드 oracle 및 기존 별도 anchor oracle을 normal/-O에서 모두 통과하며, undo/redo·독립 editor 재열기·바이트 일치·원본 불변을 검사합니다. 합성 회귀는 tbl/pic/container 각각의 표 뒤 잘못된 삽입·개체/dirty/필드 끝/기대 문자열/비대상 header 변조와 필드 밖 선행 개체를 거부합니다. 기존 실제 중첩 필드 회귀도 통과했습니다. 두 Python 모드의 기존 field oracle self-test도 exit0입니다. 실제 브라우저/전체 native gate 또는 임의 위치 전수의 증거는 아닙니다.

같은 사본에서 문제 원본 전체의 specialized prefix 감사를 다시 실행한 `task1789-specialized.log/.stderr`는 exit0입니다. 시도90/검증90/독립 XML90(필드86)/거부0이며, 일반·필드 밖 일반 입력 가능한 나머지 문단은 이 specialized 감사 대상이 아닙니다. 이 한 파일의90개 결과를 전체 참조 corpus 통과로 확대하지 않습니다.

## 여러 문단에 걸친 중첩 필드 감사

옛 감사 로그의861개 완료 행 중 verification_failed44개를 읽기 전용으로 분류했습니다. 이는 옛77b60b82 산출물/당시 도구의 결과이며 현재 실패44개라는 뜻이 아닙니다. 현재 후보로 `task1765/merged_cell_trailing_ls.hwpx`를 다시 검사한 `task1765-specialized.log/.stderr`는1시도/독립 XML1·거부0·exit0입니다. 반면 `hwpx/opengov/36387103_결재문서본문_수질검사 신청 민원 처리 결과 안내.hwpx`는 현재에도 기존 specialized 도구의 `independent field fragment must be unique`에서2!=1로 실패했습니다. 같은 문단을 덮는 외부/내부 필드의 두 inventory 행을 파싱 실패로 잘못 해석한 것입니다.

수정한 inventory는 원본 ElementTree의 요소 순번인 beginElement를 함께 내보냅니다. 감사 도구는 입력 전에 선택한 실제 fieldRangeTarget과 이 독립 인덱스를 연결해 정확히 한 필드를 검사합니다. 첫 후보 선택이나 오류 무시는 하지 않습니다. 필드 경로를 anchored 조회보다 우선하는 실제 prefix 명령 순서와도 맞춥니다. 필드 oracle의 `hwpx_field_dirty_owners.py`는 원본의 필드 시작/끝 포함 관계로 선택 필드와 상위 필드의 dirty 기대값을 구성하며, 여러 문단 범위도 유지합니다. 교차 필드/선택 필드 끝의 모호성은 거부하고 전체 XML/ZIP 비교는 유지합니다.

`/tmp/hwpjs-nested-field-audit.DkiTGa`에는883e7e8d의 두 도구에 이 수정만 적용했습니다. 작업 트리의 styled-run 삭제/별도 refusal 출력 변경은 포함하지 않습니다. 명시적 eaaa0d20 후보의 `nested-tests.log/.stderr`는4/4·fail/cancel/skip0·exit0입니다. 실제 원본의14/16번 문단에서 내부 필드 선택·독립 인덱스/ID·전체 XML/ZIP normal/-O·undo/redo·재열기·원본 불변을 확인했고, 합성 여러 문단 필드의 상위/선택 dirty 누락도 거부했습니다. 기존 두 실제 필드 회귀와 Python 두 모드의 기존 self-test도 통과했습니다. 파일 전체의 specialized 감사인 `nested-corpus.log/.stderr`도68시도/검증68/독립 XML68(필드63)/거부0·exit0이며, 집중 결과와 합산하지 않습니다.

## 전체 등록 gate 상태

### 제목 전용 oracle 교차 회귀

6bc8c4fa 이후 기존 `title-field-prefix.test.mjs`를 현재 helper와 교차 실행하자 정상 제목 검사가 Unsupported field dirty owner로 실패했습니다. 공통 dirty helper가 선택된 BOOKMARK까지 CLICK_HERE/HYPERLINK로 제한한 도구 회귀입니다. 전용 title oracle은 이미 BOOKMARK·제목 metadata·한 필드/텍스트를 검증하므로, 선택 필드 종류의 권한은 그 전용 fragment 선택기에 남기고 공통 helper는 추론한 상위 필드 종류만 제한하도록 수정했습니다. 일반 field oracle의 BOOKMARK 선택 허용을 넓히지 않았으며, 전용 선택기 없는 BOOKMARK가 계속 거부되는 합성 회귀도 추가했습니다.

`/tmp/hwpjs-title-field-crosscheck.PEUEXF`의 `crosscheck-final.log/.stderr`는 명시적 eaaa0d20 후보·동결 JS·깨끗한6bc8c4fa oracle·수정 helper로6/6·fail/cancel/skip0·exit0·stderr0(8686.423917ms)입니다. 제목 양성/metadata 음성, 기존/여러 문단 중첩, 표 경계, 일반 BOOKMARK 거부를 결합했습니다. scoped oracle self-test도 normal/-O에서 통과했습니다. 같은 디렉터리의 먼저 실행한 `crosscheck.log`와 `crosscheck-complete.log`는 사본에 title-field-mutate.py/중첩 oracle 파일이 빠져 exit1이었으며 성공으로 세지 않습니다. 누락된 기존 도구를 연결한 최종 실행과 구분합니다.

`36388711_사회보장제도 신설 협의요청서(청년오피스)_260624.hwpx`의 specialized 전체 감사는 당시 inventory0개로 중단됐습니다. 선택 필드가 BOOKMARK(beginElement32/id1115723309)이고 일반 inventory가 그 종류를 제외하기 때문입니다. 후속 `hwpx-bookmark-field-oracle.py`는 별도 BOOKMARK 전용 adapter로 이를 연결합니다. 일반 fragments의 기본 종류는 바꾸지 않고, 같은 원본 fragment 순회·전체 XML/ZIP comparator를 명시적 종류 인자로 재사용합니다. 감사는 일반 inventory에 정확한 선택 대상이 없을 때만 이 별도 inventory의 같은 section/문단/beginElement를 연결하며, 일치0/복수는 계속 실패입니다. 뒤의 텍스트나 첫 번째 후보로 대체하지 않습니다. 실제 prefix 명령·WASM은 바꾸지 않았습니다.

공통 dirty helper의 허용 상위 종류에는 기존 text-field 계약의 BOOKMARK도 명시했습니다. 합성 여러 문단의 BOOKMARK 상위 필드와 CLICK_HERE/HYPERLINK 자식이 함께 dirty가 되며, DATE 상위는 거부합니다. BOOKMARK 전용 adapter의 합성 검사는 editable=0·dirty=0 원본의 올바른 prefix와 잘못된 ID/문자열/dirty/DATE 대체를 검사하고, 일반 field oracle의 BOOKMARK 거부도 유지합니다. 최종 사본·실제 파일별 결과는 아래 후속 기록을 따릅니다.

`/tmp/hwpjs-bookmark-audit.P9yX9V`는1d03fc70의 깨끗한 oracle/동결 JS에 이 연결만 더한 사본입니다. 작업 트리의 styled-run 삭제/별도 refusal 출력은 제외했습니다. helper의 BOOKMARK 상위 지원을 확정한 뒤 다시 실행한 `bookmark-final-tests.log/.stderr`는7/7·fail/cancel/skip0·exit0·stderr0(8493.724417ms)입니다. 실제 BOOKMARK/제목·원본/여러 문단 중첩·표 경계·일반 거부와 합성5검사를 normal/-O에서 확인했습니다. base/scoped oracle의 두 모드 self-test도 통과했습니다.

같은 최종 사본과 eaaa0d20 후보의 `bookmark-final-corpus.log/.stderr`는 위36388711 원본의52시도/검증52/독립 XML52(필드1)/거부0·exit0/signal=null입니다. 파일별120초 상한 내 정상 종료이며 일반 입력 문단을 이 specialized 분모에 넣지 않습니다. 일반 inventory를 넓히거나 앞선 inventory0 오류를 무시한 결과가 아닙니다. 이52개를 전체 참조 corpus/브라우저/원본 조판 증거로 확대하지 않습니다.

같은 중첩 필드 수정 사본의 `leading-corpus.log/.stderr`에서 앞선 task1789 원본도90시도/검증90/독립 XML90(필드86)/거부0·exit0으로 재확인했습니다. 두 원본의 특수 입력 결과이며 일반 입력·전체 참조 corpus·실제 브라우저 검증을 대신하지 않습니다.

옛 실패 목록의 `issue6451/underline_run_fragments.hwpx`도 같은 사본·후보의 `underline-corpus.log/.stderr`에서110시도/검증110/독립 XML110(필드95)/거부0·exit0입니다. 파일별120초 상한 내 정상 종료이며 시간 초과나 미검사 문단을 통과로 계수하지 않았습니다.

도구 탭을 더한082cf938의 build/js/web/tools/tests2,046개 Git blob과 정확히 같은 `/tmp/hwpjs-ribbon-preview.yjDs24`에서 등록97파일·concurrency1·명시적 후보/기준·TAP의 `registered-hwpx-97-tap.log/.stderr`가295/295·fail/cancel/skip0·child exit0/signal=null·stderr0(925534.848458ms)으로 완료됐습니다. wrapper 세션의 종료코드도0이며 자식 PID91684의 종료를 확인했습니다. 고정 설치 경로를 읽는 검사에도 이 사본의 zig-out/bin 연결로 같은 후보를 제공했습니다. [도구 탭 집중 검증](document-ribbon.md)이나 앞선95파일 결과를 합산하지 않습니다.

이295개는082cf938 소스의 gate입니다. 이후7e5b8401/6bc8c4fa의 필드 oracle·감사 도구·회귀 추가는 위 별도 사본의4개 집중 검사 및 실제 원본별 결과로 검증했으며, 실행 중이던97파일 사본에 변경을 주입하지 않았습니다. 따라서295개가 후속 도구 수정까지 포함한 최신 전체 gate라고 주장하지 않습니다. 제품 WASM/외부 데모를 교체한 것도 아니며 전체 native는 별도 진행 중입니다.

위 집중 통과가 최신 전체 native gate·전체 HWPX 공개 gate·브라우저/조판·임의 명령/위치 완료를 뜻하지 않습니다. 실제 픽스쳐 입력/저장 전수는 [후보 추적 감사](unknown-candidate-fixture-verification.md), 실제 HWP5 화면 검증은 [로드맵 브라우저](hwp5-roadmap-browser-roundtrip.md)가 소유합니다.

## HWP5 공개 편집 API 등록 gate

같은082cf938 사본·eaaa0d20 후보·2589a92e 기준·명시적 fixture Git index에서 `editor_api_tests` 등록90개 고유 파일을 직렬/TAP로 실행한 `registered-hwp5-90-tap.log/.stderr`는478/478·fail/cancel/skip0·child exit0/signal=null·stderr0(679897.614291ms)입니다. 최상위391개와 하위 subtest를 포함한 총478개를 중복 합산하지 않습니다. wrapper 세션 exit0과 자식 PID23620 종료도 확인했습니다. HWPX295개와 별개이며, native 전체·모든 명령/위치·원본 조판·제품 WASM 승격을 대신하지 않습니다.

## 큰 원본의 명시적 문단 범위 실행

`aift.hwpx`의 일반 입력/이력 전체 감사는 `/tmp/hwpjs-bookmark-audit.P9yX9V/aift-plain.log/.stderr`에서120초 상한의 ETIMEDOUT/SIGTERM으로 끝났습니다. 완료 파일 행/총계가 없으므로 통과로 세지 않습니다. 종료 후 해당 감사 자식이 남지 않았음을 확인했습니다. 원본은6,343문단이며, 일부 조회/입력 관측을 전체 검사로 확대하지 않습니다.

일반 감사의 범위 선택은 공통 CLI 경계의 opt-in 검증과 일반 감사의 문단 필터/집계로 분리했습니다. 기본 전체 실행은 그대로이며 범위 옵션은 명시적 fixture/WASM이 필요합니다.0/역전/빈 범위·지수/소수/선행0·중복·정밀도/정수 상한·실제 문단 수 초과를 거부합니다. 결과는 선택 범위/검사 문단 수/원본 전체 문단 수/completeFixture를 구분합니다. completeFixture는 문단 inventory 전체를 시도했는지만 뜻하며 거부 문단까지 편집 지원하거나 모든 명령을 검증했다는 뜻이 아닙니다. 잘못된 실행 범위에서는 성공 파일 행/요약을 출력하지 않습니다. 실행 명령은 [개발 명령](development-commands.md)이 소유합니다.

`/tmp/hwpjs-paragraph-range.OnGmPi`는5e1ce5f9의 동결 JS/도구에 이 범위 변경만 적용한 사본입니다. 명시적 eaaa0d20 후보의 `range-tests.log/.stderr`는3/3·fail/cancel/skip0·exit0·stderr0(448.737459ms)입니다. 실제 charshape7문단의 기본 전체와1:8 범위 총계가 같고,3:5 부분의 분모2/원본7/completeFixture=false 및7:9 거부 후 성공 요약 부재를 검사했습니다. 잘못된 인자/실제 범위 회귀는 정규 HWPX gate에 등록합니다. 이 실행은 고비용 전수 회귀를 추가로 시작한 것이 아닙니다.

같은 사본의 `aift-bookmark-range.log/.stderr`는 해당 원본의196:197 한 문단에서 입력/이력 복원1·거부0·exit0/signal=null입니다. 원본 분모6,343/선택1/completeFixture=false를 확인했습니다. 이 한 문단이나 여러 부분 범위의 수를 무조건 합쳐 전수 통과로 주장하지 않습니다.

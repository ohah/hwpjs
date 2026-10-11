# HWPX 수식 셀 분류와 숫자 입력 검증

## 현재 범위

작업 트리 구현이며 기본 데모 WASM의 지원 범위를 변경하지 않았습니다. 임시 후보와 과거 실측은 [조사 기록](hwpx-formula-merged-origin-prototype.md)이 소유합니다. HWP5/HWPX 전체 편집 또는 원본 한글 계산 규칙과의 완전 동치가 입증된 상태는 아닙니다.

## 책임과 정책

수식 결과 직접 수정의 별도 소유/저장 계약은 [결과 override 기반](hwpx-formula-result-override.md)이 소유합니다. 현재 내부 직렬화 단계이며 수식 결과 필드의 공개 편집 허용을 뜻하지 않습니다.

- `formula_cell_rectangle`는 셀 주소·span·표 경계·점유/겹침을 검사합니다. `formula_values`는 기존 선택 iterator와 집계·누적 작업 예산을 소유합니다. 반복 주소를 계산에서 제거하지 않습니다.
- `formula_cell_number`는 현재 text site와 활성 XML 구조를 읽습니다. strict 읽기는 단일 문단 숫자만 허용합니다. SUM scalar 조회는 첫 활성 문단만 number/text/empty로 분류하며 문단 사이의 숫자를 이어 붙이거나 뒤 문단의 숫자를 끌어오지 않습니다. 뒤 문단을 포함한 활성 제어 요소는 여전히 검사합니다. 이 첫 문단 정책은 실제 파일 관측 기반이며 일반 한글 숫자 추출 명세 전체가 아닙니다.
- SUM만 text/empty를 집계에서 제외합니다. AVG/PRODUCT/MIN/MAX는 기존 strict 숫자 정책을 유지합니다. 숫자 병합 셀은 원점에서만 읽으며 내부 좌표는 거부합니다. 설명 셀의 내부 좌표를 제외할 때도 겹침/예산 검사를 먼저 수행합니다.
- `formula_dependency_evaluation`은 실제로 읽은 숫자 입력 셀을 선택적으로 기록합니다. 이 목록은 해당 평가 거래의 임시 데이터이며 문서 모델이나 저장 캐시가 아닙니다. 목록 중복 제거는 반복 주소의 산술 의미를 바꾸지 않습니다.
- `formula_numeric_input_guard.validateFormulaTransition`은 이전 값 평가로 참조 숫자 입력을 수집하고 변경된 해당 셀의 첫 문단이 여전히 number인지 확인합니다. 구조·권한·수식 준비 검사를 대체하거나 편집 권한을 부여하지 않습니다. 설명 문단 변경과 참조하지 않는 숫자 셀은 이 검증만으로 제한하지 않습니다.
- 일반 `formula_splice`와 구조화된 `paragraph_structure_formula_splice`는 같은 전환 검증을 호출합니다. 구조 경로는 기존 일시적 source-binding projection을 사용하고 저장 사전 검증 후에만 소유 값을 교체합니다. 생성/변경 수식 및 다른 구조 명령의 모든 게시 경로에 대한 감사는 별도입니다.
- 현재 후속 출력 정책은 implicit grouped general의 정수값만 소수0자리 십진수로 보존하고 소수값은 기존6유효자리 규칙을 유지합니다. 명시적 precision/fixed/비grouped 경로는 그대로입니다. 이는 아래 원본 관측과 기존 회귀를 함께 만족하는 제한적 정책이며 원본 한글의 모든 반올림/정밀도에 대한 증명은 아닙니다. 이전15자리 후보의 설명/결과는 이력입니다.

## 검증 경계

### 긴 설명 scalar의 후속 작업 트리 수정

같은a4f8 작업 트리 후보로 formula-editor·created-table-formula-host·table-creation-worker·text-sum-fixture-editor·formula-queued-history-worker·created-table-field-exterior의 정확한6파일을 함께 실행해25/25·exit0·skip0(53209.67175ms)을 확인했습니다. 실제48숫자 입력 재계산·긴 설명 전체 XML/ZIP·stale-display 원문 보존·생성 표와 수식/필드/서식 양쪽 순서·대기 숫자 입력 이력·Worker 현재 주소 보존을 포함합니다. 실제 브라우저 픽셀/IME 및 실패한 정의 precision 회귀를 포함한 전체 제품 검사로 확대하지 않습니다. 기존 미해결 정의 회귀는 이 통과 집계로 상쇄하지 않습니다.

후속 독립 검사기 보강은 같은 SUM 원본 표/셀 점유/5수식 식별자를 재사용합니다. 설명 편집 모드는 대상 문단의 단일 직접 텍스트가 원본 설명이며 실제 SUM의 설명 행에 속함을 검사한 후 정확히 긴 설명100회 반복만 기대 XML에 반영합니다. 모든 수식 캐시/dirty/본문은 원문 그대로 비교하고, 전체 XML 및 비대상 ZIP payload/메타데이터/순서/CRC를 검사합니다. 일반/-O 모두5변조(결과·Command·dirty·대상 설명·비대상 header)를 거부한 최종 long-text 공개1/1·exit0·skip0(7523.11475ms)을 확인했습니다. 기존 숫자 수정 모드도 독립fe7 후보로1/1·exit0·skip0(8126.168041ms)을 재검증했습니다. 앞선 독립 XML/ZIP 미검증 기록을 이 후속 특정 테스트에 한해 보완하며 전체 runtime gate/브라우저 완료로 확대하지 않습니다.

후속 작업 트리 ReleaseSafe 빌드6/6·exit0(44초)로 별도 long-text 후보를 생성했습니다. SHA256은 `a4f8cf4dfe65c2a2341ad4f60a9d81f309f52ee4067f99fd6a8e75cb719b2ad5`입니다. 실제 외부 Bindata 문서의 설명 셀을 긴 설명100회 반복으로 수정한 공개 테스트1/1·exit0·skip0(5901.216834ms)을 확인했습니다. 수식5결과/입력 버퍼 불변·undo 원문/redo 수정본·저장 재열기를 확인했습니다. 독립 전체 XML/ZIP 및 최종 전체 native 검사는 아직 없습니다. runtime/새 테스트는 미커밋이며 다른 기존 작업 트리 변경도 포함한 빌드로 독립fe7 사본과 구분합니다.

기존128바이트 수집 한도는 숫자가 아닌 긴 설명도 SUM에서 제외하지 못하고 LimitExceeded로 거부했습니다. 후속 작업 트리의 scalar 수집은 기존 `text_sites.Options.max_text_bytes` 예산을 재사용하며 strict 숫자 읽기의128바이트 한도는 유지합니다. 활성 구조/소유자 검사를 마친 뒤 UTF-8 유효성 및 숫자 어휘를 검사하고, 명백한 설명은 숫자 파서에 넘기지 않습니다. 숫자처럼 보이는129자리 입력은 기존 숫자 파서 한도에서 계속 거부합니다.600바이트 한글·긴 공백·잘못된 UTF-8·할당 실패·기존 제어/문단/선택 경계의 최종 집중 ReleaseSafe7/7·exit0·fmt/diff check를 확인했습니다. 이 변경은 미커밋 runtime이며 기존fe7/1e 후보와 이미 실행 중인 전체 native snapshot에 포함되지 않습니다. 최종 수정의 WASM/public/전체 gate는 아직 없습니다.

### 추가 수식 정의 회귀의 실패와 후속 수정

확장자 기반 참조439경로의 ZIP/XML 직접 조사는35FORMULA 모두 `%g,`였고,6자리를 넘는 유효 숫자는 정수2건뿐이었으며 긴 소수 예는 없었습니다. 암호화 XML1개와 실제 ZIP이 아닌6경로는 조사 오류로 별도 분리했고 유효 HWPX/전체 파서 검사로 계산하지 않았습니다. 이 관측은 모든 소수에15자리를 적용할 근거가 아니므로 후속 렌더러에서 정수 십진수 보존과 기존 소수6자리 정책을 분리했습니다. 직접 native2/2·exit0은 PRODUCT 반례68,991.2·큰 정수/음수/음의0·전체 할당 실패를 포함합니다.

후속 작업 트리 ReleaseSafe 빌드6/6·exit0(59초), 후보 `zig-out/verification/formula-integer-precision/bin/hwpjs.wasm` SHA256 `202ab910788143ca9a73263b1c006890e4af852883dc7fe58d84fe95455143df`를 확인했습니다. 정의 corpus·정확 숫자 corpus·실제 text SUM3파일6/6·exit0·skip0(30506.667167ms)로 앞선 정의2실패를 수정 후 재검증했습니다.13정의의 opposite/MIN/MAX 및 PRODUCT/반복 주소·48입력 정확 문자열·긴 설명 전체 XML/ZIP·stale-display 저장/이력을 포함합니다. 알려진5참조의 조회/무편집 저장 조사도5/5원문 바이트 일치·exit0입니다. 검사기의6자리 기대값을 완화하지 않았습니다. runtime은 미커밋이며 다른 기존 작업 트리 변경을 포함한 후보라 독립 소스/최종 전체 native/기본 제품/실제 한글 동치로 확대하지 않습니다. 결과 직접 편집 구현은 여전히 남습니다.

직접 저장/재열기 대조에서 chart의 첫 정의를 `=PRODUCT(B?:E?)`로 변경하면 기본6a 제품은 Command/LastResult를 `68,991.2`, 독립fe7 후보는 `68,991.2496`으로 저장했습니다. 원본 `%g,`는 동일합니다. source-only `formulaSources`를 변경 직후 조회하면 여전히 원본 SUM/67.5가 반환돼 현재 편집 결과의 증거가 아니므로 실제 저장 뒤 재열기해서 비교했습니다. 기존 제품의 PRODUCT 단독 회귀1/1·exit0(3852.961ms)도 확인했습니다.

[한글 공식 계산식 도움말](https://help.hancom.com/hoffice130/ko-KR/Hwp/table/calculation/calculation.htm)의 형식/쉼표 설명은 기본 형식의 유효 숫자 수를 명시하지 않습니다. 따라서 이 자료로15자리 또는6자리 정책 전체를 확정하지 않습니다. 같은 도움말의 재계산 설명은 결과값을 사용자가 임의 수정한 경우 참조 셀 수정이나 계산식 고치기 전까지 유지한다고 명시합니다. 현재 결과 필드 prefix 거부13건은 원본 FORMULA 소유권 확인 증거일 뿐, 원본 한글과 동일한 결과 직접 편집 지원 증거가 아닙니다. 결과 override의 소유 모델·저장/이력·참조 입력 수정 시 해제/재계산은 추가 구현 및 검증 대상으로 남습니다.

독립fe7 후보로 실제 chart 숫자 입력48곳의 저장/재열기/이력과13결과의 독립 산술 비교(상대오차1e-5)가1/1·exit0(30651.56775ms), 별도48숫자 입력의 정확한 결과 문자열 검사가1/1로 통과했습니다. 그러나 `numeric-exact-corpus`와 `formula-definition-corpus` 두 파일을 함께 실행한 최종 집계는3개 중1통과/2실패·exit1(14353.917708ms)이었습니다. PRODUCT/반복 주소 정의 검사와 전체13정의의 aggregate 변경 검사가 독립 검사기의 `general six-digit calculation`에서 실패했고 후자는 ordinal6에서 중단됐습니다. PRODUCT 단독 재현도1실패·exit1입니다. 후보의 implicit grouped15자리 정책과 기존 oracle의 `%g,`6자리 기대값이 충돌하며, 관측 큰 정수 원문만으로 모든 새 PRODUCT/AVG 정의의 정책을 입증할 수 없습니다. 검사기를 완화하거나 후보를 기본 제품에 승격하지 않았습니다. 정책의 원문/레퍼런스 대조와 회귀 해결이 추가 게시 gate입니다.

### 커밋 범위의 독립 소스 빌드

독립 후보의 전체 참조 텍스트 읽기와 별도 명시 비밀번호 검증은 [참조 읽기 감사](reference-reader-release-audit.md)가 소유합니다. 수식 편집/필드 지원/원본 조판 완료 증거로 합치지 않습니다.

HEAD의 Git archive에 이번 소유 변경15개 기존 파일과3개 신규 파일만 적용한 사본을 `zig-out/verification/formula-release.1eLR2A`에 구성했습니다. 다른 기존 로컬 변경은 가져오지 않았습니다. 해당 사본의 ReleaseSafe build5/5 steps·exit0, WASM SHA256 `fe7de3455ed8f88856c7fe59303fa114fe8e9b98e0eacd56a56983887b18be38`을 확인했습니다. 이 후보로 원 작업 트리의 실제 reference를 포함한 공개5파일20/20·exit0/skip0(46654.318125ms)을 확인했습니다. 테스트 실행 소스는 원 작업 트리이고 WASM만 독립 소스에서 나온 것이므로 게시 패키지 전체 검증과 구분합니다.

최초 집중 native11개 실행은 저장 모듈의 새 stale-display 선언이 부모 import 필터에 의해 빠졌습니다. root 테스트 import에 해당 모듈을 명시적으로 추가해 다시 실행했고12/12·exit0으로 새 선언의 전체 할당 실패도 실제 실행된 것을 확인했습니다. 이 추가 import는 테스트 경로 수정이며 앞선 WASM 빌드와 native 소스 snapshot을 혼동하지 않습니다. 소유 사용자 staged46줄은 그대로 보존했습니다. 독립 빌드/집중 통과는 최종 전체 native gate나 기본 제품 승격을 대체하지 않습니다.

### 무편집 저장과 내부 재계산

[단계별 실제 파일 조사기](../tools/hwpx-formula-refusal-probe.mjs)는 후보 hash와 각 파일의 open/문단 조회/수식 조회/save 단계를 구분합니다. 현재37e932 후보는5파일 모두 조회되지만 copay의 무편집 save는 바이트가 달랐습니다. 독립 전체 XML 차이는 첫 필드1295981349의 dirty0→1과 소유 표시 문자열100→184.9 두 곳뿐이며 다른 ZIP payload는 같았습니다. 원본 Command/LastResult와 독립 합산은184.9인데 원본 본문만100이므로, 파서의 값 잘림이 아니라 무편집 저장에서의 재계산입니다. 조사기의 절대 후보 경로/누락/중복/잘못된 인수 거부 테스트1/1·exit0을 확인했습니다.

첫 원문 보존 후보 `formula-source-preservation/bin/hwpjs.wasm`(verification 아래), SHA256 `fea8740006868508cf405cfa8d18d253fc4df55d7613aa91962281ed104d788f`는 실제5파일 조회/무편집 저장 원문 일치와 native4/4를 통과했지만 공개19개 중16통과/3실패·exit1이었습니다. 서식/구조 내부의 재구성 XML에서 재계산까지 생략해 StructuralFormulaOutputMismatch가 발생했습니다. 이 후보를 제품에 승격하지 않았습니다.

후속 작업 트리 구현은 `writeWithDefinitionsMode`에 원문 보존 허용을 명시합니다. 최종 flat Session.save만 이를 허용하고 기존 내부 writer는 기본적으로 재계산합니다. 정의 변경·dirty·실제 text site 변경이 있으면 원문 일치 빠른 경로를 사용하지 않습니다. native4/4·exit0으로 untouched 원문 보존과 내부 derive 모드 재계산·실제 숫자 편집·전체 할당 실패를 함께 확인했습니다. 이 후속 후보 SHA256 `1e026c60f14315a6343453b486721eff6ef1be4a755a41cfca2d52b629c5310d`는 ReleaseSafe build6/6 steps·exit0, 공개4파일19/19·exit0/skip0(47876.225708ms), 실제5파일 조회/무편집 저장 원문 일치5/5·exit0을 확인했습니다. [실제 브라우저 입력 검증](hwpx-formula-browser-verification.md)은 별도이며 한 파일의 단일 입력/다운로드·undo/redo 바이트 복원까지 확인했습니다. 기존 전체 ReleaseSafe 실행은 이 저장 모드 변경 전 source snapshot이며 최종 수정의 전체 gate로 계수하지 않습니다.

현재 소스의 ReleaseSafe 집중 native11/11·exit0, 공통 선택 모듈 직접8/8·exit0, 관련 Zig fmt check·Node 테스트 문법 검사·diff check exit0을 확인했습니다. 첫 문단 숫자/설명 문단 변경과 숫자→문구 거부, 전체 할당 실패, 제어 요소·소유자·site identity·길이 제한 및 독립 점유 mask 반례를 포함합니다.

ReleaseSafe 빌드6/6 steps·exit0의 작업 트리 후보는 `zig-out/verification/formula-candidate/bin/hwpjs.wasm`, SHA256 `37e9324519993edaab2b18b14bc381fad1092b964e8123cd93cf481a306be67c`입니다. 기본 `zig-out/bin/hwpjs.wasm`의 SHA256 `6a25125e797c7f2501476ba5ddb3a1e45700be6707bf6b6a14daec0849f31faa`와 구분합니다. 후보는 다른 기존 로컬 변경도 포함한 작업 트리 빌드이지 게시된 깨끗한 checkout 산출물이 아닙니다.

공개 회귀는 `formula-editor`, `created-table-formula-host`, `table-creation-worker`, `text-sum-fixture-editor` 네 파일을 정확히 선택해 이 후보로18/18·exit0(50879.640875ms), skip0을 확인했습니다. 새 실제 reference 테스트는 해당 RHWP 파일이 없으면 명시적으로 skip하며 그 경우 실제 파일 검증으로 계수하지 않습니다. 실제 수정본의 전체 XML/ZIP/Decimal 재계산과 일반/-O 변조 거부, 입력 거부·이력·재열기를 검사합니다. Canvas 대역은 실제 브라우저 픽셀/IME 검증이 아닙니다.

이전 `/tmp` 산출물과 프로세스 핸들이 없어져 종료 결과를 회수하지 못한 전체 Debug/ReleaseSafe 및136선언 실행은 완료/통과로 간주하지 않습니다. 현재 소스의 전체 ReleaseSafe 검사를 새로 시작했으며 아직 완료되지 않았습니다. 첫 문단 정책 후보의 copay/tac 실제 조회도 이전 핸들의 최종 결과가 없으므로 완료로 보고하지 않습니다.

2026-10-11 14:48 KST 실행 관측: 독립 소스 사본의 전체 Debug 세션60077은 테스트 PID19412가 CPU100%·CPU 누적31분50초로 실행 중이었습니다. 1초 스택 표본은 `created_table_session_tests`의 `created table staged allocation failures retain empty current state and source` → `testing.checkAllAllocationFailures` → 표 생성/source ID·header XML 파싱을 보여 주었습니다. 표본의 physical footprint11.6GiB는 전체 테스트 프로세스 관측이며 생산 코드 메모리 누수나 특정 수식 테스트의 사용량으로 판정하지 않습니다. 별도 이전 snapshot의 전체 ReleaseSafe 세션19562도 PID13023의 CPU100%·누적70분02초로 실행 중임을 확인했습니다. 두 실행 모두 최종 종료코드/통과 집계는 아직 없고 중단·재시작하지 않았습니다. 이 관측은 진행 위치 확인이지 전체 검증 통과 증거가 아닙니다.

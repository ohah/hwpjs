# HWPX 수식 셀 분류와 숫자 입력 검증

## 현재 범위

작업 트리 구현이며 기본 데모 WASM의 지원 범위를 변경하지 않았습니다. 임시 후보와 과거 실측은 [조사 기록](hwpx-formula-merged-origin-prototype.md)이 소유합니다. HWP5/HWPX 전체 편집 또는 원본 한글 계산 규칙과의 완전 동치가 입증된 상태는 아닙니다.

## 책임과 정책

- `formula_cell_rectangle`는 셀 주소·span·표 경계·점유/겹침을 검사합니다. `formula_values`는 기존 선택 iterator와 집계·누적 작업 예산을 소유합니다. 반복 주소를 계산에서 제거하지 않습니다.
- `formula_cell_number`는 현재 text site와 활성 XML 구조를 읽습니다. strict 읽기는 단일 문단 숫자만 허용합니다. SUM scalar 조회는 첫 활성 문단만 number/text/empty로 분류하며 문단 사이의 숫자를 이어 붙이거나 뒤 문단의 숫자를 끌어오지 않습니다. 뒤 문단을 포함한 활성 제어 요소는 여전히 검사합니다. 이 첫 문단 정책은 실제 파일 관측 기반이며 일반 한글 숫자 추출 명세 전체가 아닙니다.
- SUM만 text/empty를 집계에서 제외합니다. AVG/PRODUCT/MIN/MAX는 기존 strict 숫자 정책을 유지합니다. 숫자 병합 셀은 원점에서만 읽으며 내부 좌표는 거부합니다. 설명 셀의 내부 좌표를 제외할 때도 겹침/예산 검사를 먼저 수행합니다.
- `formula_dependency_evaluation`은 실제로 읽은 숫자 입력 셀을 선택적으로 기록합니다. 이 목록은 해당 평가 거래의 임시 데이터이며 문서 모델이나 저장 캐시가 아닙니다. 목록 중복 제거는 반복 주소의 산술 의미를 바꾸지 않습니다.
- `formula_numeric_input_guard.validateFormulaTransition`은 이전 값 평가로 참조 숫자 입력을 수집하고 변경된 해당 셀의 첫 문단이 여전히 number인지 확인합니다. 구조·권한·수식 준비 검사를 대체하거나 편집 권한을 부여하지 않습니다. 설명 문단 변경과 참조하지 않는 숫자 셀은 이 검증만으로 제한하지 않습니다.
- 일반 `formula_splice`와 구조화된 `paragraph_structure_formula_splice`는 같은 전환 검증을 호출합니다. 구조 경로는 기존 일시적 source-binding projection을 사용하고 저장 사전 검증 후에만 소유 값을 교체합니다. 생성/변경 수식 및 다른 구조 명령의 모든 게시 경로에 대한 감사는 별도입니다.

## 검증 경계

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

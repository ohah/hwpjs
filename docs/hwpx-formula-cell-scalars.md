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

현재 소스의 ReleaseSafe 집중 native11/11·exit0, 공통 선택 모듈 직접8/8·exit0, 관련 Zig fmt check·Node 테스트 문법 검사·diff check exit0을 확인했습니다. 첫 문단 숫자/설명 문단 변경과 숫자→문구 거부, 전체 할당 실패, 제어 요소·소유자·site identity·길이 제한 및 독립 점유 mask 반례를 포함합니다.

ReleaseSafe 빌드6/6 steps·exit0의 작업 트리 후보는 `zig-out/verification/formula-candidate/bin/hwpjs.wasm`, SHA256 `37e9324519993edaab2b18b14bc381fad1092b964e8123cd93cf481a306be67c`입니다. 기본 `zig-out/bin/hwpjs.wasm`의 SHA256 `6a25125e797c7f2501476ba5ddb3a1e45700be6707bf6b6a14daec0849f31faa`와 구분합니다. 후보는 다른 기존 로컬 변경도 포함한 작업 트리 빌드이지 게시된 깨끗한 checkout 산출물이 아닙니다.

공개 회귀는 `formula-editor`, `created-table-formula-host`, `table-creation-worker`, `text-sum-fixture-editor` 네 파일을 정확히 선택해 이 후보로18/18·exit0(50879.640875ms), skip0을 확인했습니다. 새 실제 reference 테스트는 해당 RHWP 파일이 없으면 명시적으로 skip하며 그 경우 실제 파일 검증으로 계수하지 않습니다. 실제 수정본의 전체 XML/ZIP/Decimal 재계산과 일반/-O 변조 거부, 입력 거부·이력·재열기를 검사합니다. Canvas 대역은 실제 브라우저 픽셀/IME 검증이 아닙니다.

이전 `/tmp` 산출물과 프로세스 핸들이 없어져 종료 결과를 회수하지 못한 전체 Debug/ReleaseSafe 및136선언 실행은 완료/통과로 간주하지 않습니다. 현재 소스의 전체 ReleaseSafe 검사를 새로 시작했으며 아직 완료되지 않았습니다. 첫 문단 정책 후보의 copay/tac 실제 조회도 이전 핸들의 최종 결과가 없으므로 완료로 보고하지 않습니다.

# 다른 구역의 표 번호 참조를 보존하는 텍스트 입력

## 계약

HWP5의 한 구역에서 일반 텍스트를 splice할 때, 수정하지 않는 다른 구역의 로컬 표 번호/이름 상호참조를 원문으로 보존합니다. 기존 `validateUnselectedCharacterFormat`과 필드 연결 검사를 재사용하는 `validateUnselectedTextSection`이 단일 허가 진입점입니다. 공개 입력 적격성 조회와 실제 Session splice가 같은 함수를 사용합니다.

이 거래는 개체 ID·번호 선언·다른 구역의 문서 모델을 변경하지 않습니다. 기존 대상 부재도 복구하지 않으며 저장된 표시 문자열을 재계산 결과로 승인하지 않습니다. 외부 문서·페이지·대상 텍스트·상대 위치 참조는 계속 거부합니다. 참조가 들어 있는 선택 구역의 텍스트 편집, 문단 분할/병합 등 구조 변경, 번호 재계산에는 이 허가를 전달하지 않습니다. 저장 시 stale-layout 동의도 유지합니다.

## 실제 파일과 반례

분리 후보 WASM SHA256은 `b2d3a8b7350cf5a6fd0e9cac1a2c7ef6bc58925a1da0a8cde8de436e5e1c2fd9`입니다. `hwpspec.hwp`는 0/1/4/5번 구역의 입력 조회를 허용하고 참조가 있는 2/3번 구역을 거부합니다. 실제 HWP5인 `hwp-3.0-HWPML.hwp`는 0/1/3/4번을 허용하고 2번을 거부합니다. HWP3 지원을 추가하지 않습니다. 두 원본은 명시적인 배포용/CFB 보정본 열기 옵션을 사용합니다.

실제 표 번호 참조를 가진 다른 구역의 선행 서식 변경을 유지한 채 Unicode 입력·독립 전체 Section/비대상 stream·선언/ID 보존·저장 재열기·undo/redo를 검사했습니다. 외부 문서/페이지/텍스트/상대 위치로 명령을 바꾼 네 반례는 입력을 거부하고 원본과 기존 redo를 유지했습니다. 실제 7구역 roadmap의 다른 종류 상호참조 보호도 유지합니다. API 묶음10/10·skip0입니다.

실제 참조 문단을 축소한 native 검사는 새 비대상 정책의 전체 부분 할당 실패, 기존 일반 비대상/선택 필드 거래의 거부, 페이지 참조 변이 거부를 검사합니다. ReleaseSafe2/2와 기존 입력 정책을 포함한 Debug3/3이 통과했습니다. Canvas/Worker DOM 대역 검사는 직접 beforeinput/input·글자 서식·저장 원문·undo/redo 및 보호 구역 거부 후 redo를 검사해1/1 통과했습니다. 실제 브라우저/OS IME·전체 native·전체 픽스쳐 편집·한글 조판 동치 검증은 아닙니다. 기본 WASM/데모 승격도 별도입니다.

## 재현

`HWPJS_TEST_WASM=/absolute/candidate.wasm node --test --test-concurrency=1 tests/hwp5/unselected-table-number-text.test.mjs tests/hwp5/unselected-cross-reference-gate.test.mjs tests/hwp5/table-number-character-format.test.mjs tests/hwp5/normalized-distribution.test.mjs tests/hwp5/table-number-format-canvas.test.mjs`

`zig test src/root.zig -O ReleaseSafe --test-filter 'table number character format source validation cleans every partial allocation'`와 Debug로 검사합니다. 후보 소스/산출물을 명시하며 reference 부재에 따른 skip은 실제 통과로 세지 않습니다.

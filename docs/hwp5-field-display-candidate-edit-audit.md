# 필드 표시 후보의 HWP5 픽스쳐 편집 검사

2026-10-13 후보39c827ed(SHA256 `39c827edcce665efcce4b40c9a70d47d0d1f74a1ac63013972d2b10a49692a1f`)로 `node tools/hwp5-edit-corpus-audit.mjs --wasm=<후보> --history`를 실행했습니다. `/tmp/hwpjs-hwp5-edit-current.C8vR77`의 최종 JSON과 종료코드0을 확인했습니다. 실제 Git 추적101개의 HWP/HWPX 경로를 열거하며 HWPX는 별도 감사 상태로 분리합니다.

HWP5는55경로 중53파일의 모든 문단 prefix 입력이 통과했습니다. 전체2090시도 중2042입력·이력 복원, 독립 CFB.js/zlib 본문 텍스트·비대상 스트림 비교와 저장본 editor 재열기가 확인됐습니다. chart.hwp의175문단은127개 비숫자 prefix 성공과48개 InvalidFormulaNumber 거부입니다. password-12345.hwp는 UnsupportedEncryption으로 읽기 거부입니다. HWPX45개 읽기/별도 편집 감사 상태와 password-12345.hwpx의 EncryptedDocument는 HWP5 성공에 합산하지 않습니다.

## 실제 숫자 입력과 의도적 거부의 분리

`HWPJS_TEST_WASM=<같은 후보> node tools/run-selected-node-tests.mjs tests/hwp5/chart-numeric-input-corpus.test.mjs`는 실제 chart.hwp의175문단 전부에 비숫자 prefix를 시도해48개 숫자 문단을 분류합니다. 각 거부가 원본 저장 상태를 변경하지 않는지 확인한 뒤 전체 숫자 값을7로 치환했습니다.48개 모두 성공했고 독립 CFB/zlib로 저장 본문의 해당 UTF-16 값 `7\r`을 확인했습니다. 전체 스트림 목록·비대상 스트림 보존, 새 editor 재열기와 undo 원본 ZIP이 아닌 **CFB 파일 바이트** 복원·redo 저장 바이트 복원도 통과했습니다. 테스트1/1·skip0·종료코드0입니다.

따라서48개 비숫자 거부를 일반 셀 편집 미지원48개로 해석하지 않습니다. 이 검사는 해당 숫자 입력과 보존/이력만 입증하며 수식 결과 전체의 독립 산술 대조·모든 숫자 문법·서식/페이지 조판·실제 브라우저 numeric 입력 완료는 아닙니다. 저장은 기존 재조판 필요 상태를 명시적으로 허용했고 그 경고를 없애지 않았습니다. 암호 HWP 거부도 해소한 결과가 아닙니다.

같은 후보의 참조 전체 읽기는 [읽기 감사](field-display-candidate-read-audit.md), HWPX 편집·실제 Canvas 검증은 [HWPX 감사](hwpx-table-fixture-edit-audit.md)가 소유합니다. 기본 제품 WASM 승격이나 native 전체 gate 완료를 주장하지 않습니다.

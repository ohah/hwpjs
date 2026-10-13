# 참조 암호 문서의 명시적 열기·편집 감사

## 후보와 범위

2026-10-13 후보 `zig-out/verification/unselected-fields-format/bin/hwpjs.wasm`의 SHA-256은 `e1609e28fdc650a04fcd66fa067ad805d1c72181a8292a01070ed6c35444ee86`입니다. 기본 전체 읽기 감사의 암호 거부를 성공으로 바꾸지 않으며, 비밀번호를 제공한 별도 복호화 경로를 검증합니다. 전체 기본 읽기·편집의 경계는 [최종 후보 기록](hwp5-unselected-field-preservation.md)을 따릅니다.

예제의 공개 비밀번호 `123456`을 사용했습니다. 계정 자격 증명이 아닙니다. 원본 파일은 수정하지 않았으며 반환된 평문 컨테이너는 암호 보호를 유지하지 않습니다.

## 실제 두 참조 문서

- `HWP5-password-123456.hwpx`: 실제 HWPX, 418문단.
- `hwp3-sample16-hwp5-2024-password-123456.hwp`: 이름과 달리 실제 HWP5, 4,282문단. HWP3 제외에 넣지 않습니다.

`tests/hwpx/reference-password-reader.test.mjs`는 잘못된 비밀번호 거부·올바른 비밀번호 읽기·원본 및 평문 입력 불변을 검사합니다. `tests/hwpx/reference-password-editor.test.mjs`는 각 문서의 대표 한 문단 입력·독립 XML/ZIP 또는 CFB/레코드 저장 비교·undo/redo·새 편집기 재열기를 검사합니다. HWPX 독립 Python oracle은 일반/최적화 모드 모두 실행합니다.

HWP5/HWPX `password-worker.test.mjs`와 함께 실행한 결과는 9/9·skip 0·종료코드 0입니다. Worker에는 잘못된 비밀번호 후 재시도, 편집 이력, 보호 해제 출력 동의와 파일 전환 초기화 검사가 포함됩니다. 실제 Chromium·OS IME·두 문서의 전체 문단 편집 완료를 뜻하지 않습니다. 원본 암호화 상태로 재저장하는 기능의 검증도 아닙니다.

## 대형 HWP5 전수 편집

명시적으로 복호화한 4,282문단의 메모리 내 전수 prefix·독립 전체 본문/비대상 스트림·이력·재열기 감사를 별도 시작했습니다. 로그는 `/tmp/hwpjs-unselected-format-protected-hwp5-edit.json` 및 `.stderr`입니다. 암호 원본과 평문은 디스크에 재작성하지 않습니다. 실행 중 상태이며 대표 한 문단 성공을 전수 성공으로 확대하지 않습니다.

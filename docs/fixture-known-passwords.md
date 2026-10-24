# 공개 암호 예제의 감사 정책

`tools/fixture-known-password.mjs`는 공개 테스트 원본 네 개의 SHA256만 고정 예제 암호에 대응시킵니다. 파일명·경로에서 암호를 추측하지 않으며, 원본 바이트가 달라지거나 hash 표기가 맞지 않으면 대응하지 않습니다. 일반 사용자 문서의 암호 자동 입력 기능이 아닙니다. 실제 데모의 암호 대화상자는 계속 사용자가 입력합니다.

| 원본 | SHA256 | 공개 예제 암호 |
|---|---|---|
| legacy password-12345.hwp | e86aac42e3efbcc2e06cc50e628705dce710bec0c252961b7d52c87e3c6b0660 | 12345 |
| legacy password-12345.hwpx | 1d54f5dd6f0716ded516252c4acac92178d23d846d04b4f76d74dd8f97ae3e3f | 12345 |
| reference HWP5-password-123456.hwpx | 93e7a62565e0f3efa4feee2812aaf518347dbbcc09d2f26a0d9385f9a4e26060 | 123456 |
| reference hwp3-sample16-hwp5-2024-password-123456.hwp | 59d4bed335b9552fe78fa68d2a56f7cfa3d586bcdeaaba839af80df13f3e08dc | 123456 |

마지막 원본은 이름과 별개로 실제 HWP5입니다. HWP3 지원 확대가 아닙니다. 복호화는 명시적인 보호 제거 변환이며 감사 저장은 `allowUnprotectedOutput:true`를 명시합니다. 보호를 유지한 재암호화 지원이라고 주장하지 않습니다. 감사 요청에서 전달한 암호도 expectedSHA의 고정 정책과 같은지 검사합니다. 정책 파일 해시는 provenance와 이후 증거 재사용 조건에 포함합니다.

2026-10-25 명시 WASM `8c3143aa4c7e123d466536a32d2dcc75c595595600e27c4ca10a40d5f1fe5cf3`에서 두 참조 파일의 오답 암호 거부·정답 복호화·원본 불변 및 파싱을 확인했습니다. 기존 HWP5/HWPX password API7개 검사도 통과했으며 독립 AES/압축 payload 대조, 편집·저장 재열기와 secret 버퍼 해제를 포함합니다. HWP5/HWPX reader의 메서드는 각각 `readText`/`readTextEvents`이며 초기 진단 코드의 잘못된 reader 메서드 호출을 제품 오류로 집계하지 않았습니다.

`zig-out/verification/reference-password-edit-corrections`는 실제 앱 로더와 typed 편집 수명을 두 파일에서 다시 실행했습니다. HWP5는 삽입·저장·undo/redo·재열기·동일 재저장과 독립 CFB/Section 검사까지 통과했습니다. HWPX도 같은 제품 수명은 완료했지만 독립 삽입 oracle가 미지원이어서 `oracle-unsupported`로 남겼습니다. 전수 감사의 암호 미제공 오류를 파일 손상으로 판정하거나 이 후속 검증으로 전체 암호 형식 지원을 선언하지 않습니다. 실제 후속 실행의 source/implementation/WASM 불변도 확인했습니다.

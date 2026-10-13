# 필드 표시 후보의 참조 전체 읽기 검사

같은 후보의 추적 HWP5 prefix·숫자 입력은 [HWP5 편집 감사](hwp5-field-display-candidate-edit-audit.md)의 별도 검증 축입니다.

2026-10-13 후보 `field-label-display-owned-api` SHA256 `39c827edcce665efcce4b40c9a70d47d0d1f74a1ac63013972d2b10a49692a1f`로 `tools/reference-parser-audit.mjs --wasm=<후보> --root=reference/rhwp/samples`를 실행했습니다. `/tmp/hwpjs-reference-parser.RtiKQL`의 시작·975개 개별 결과·최종 summary와 종료코드0을 확인했습니다.

실제 서명으로 HWP3 26개를 제외했습니다. 범위 내949개 중 HWP5 509/HWPX435의690523문단 텍스트 projection·입력 버퍼 불변이 통과했습니다. 개별 path 중복 부재·개별 문단 수 합계와 summary 일치·현재 artifact hash 일치도 별도로 검사했습니다. 기본 제품 WASM은 승격하지 않았으며 모든 필드·편집·저장·Canvas 완료 결과가 아닙니다.

남은5거부는 기본 무비밀번호 정책의 `HWP5-password-123456.hwpx`(EncryptedDocument), `hwp3-sample16-hwp5-2024-password-123456.hwp`(실제 서명 HWP5, UnsupportedEncryption)와 issue5715/5802/5828의3원본(SectionCountMismatch)입니다. 파일명 hwp3로 범위를 제외하지 않았습니다. 성공944개·거부5개를 구분하며 암호 지정 복호화나 누락 구역 자동 복구를 수행한 집계로 바꾸지 않습니다. 같은 후보의 두 실제 중첩 문서 편집 검사와 추적 Worker 회귀는 [편집 감사](hwpx-table-fixture-edit-audit.md)의 별도 범위입니다.
